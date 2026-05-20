'use server'

import { revalidatePath } from 'next/cache'
import { addDays } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { callSolverApi, checkSolverHealth, SolverError, type ScheduleResponse } from '@/lib/scheduler'
import { buildScheduleRequest, mapResponseToAssignments, extractIssuesFromResponse } from '@/lib/scheduler/mapper'
import { getActiveTemplate } from '@/server/actions/coverageTemplates'
import { getAbsenceBlocksForWeek } from '@/server/actions/absences'

// ── Tipos públicos ─────────────────────────────────────────────────────────

export interface GenerateResult {
  success: boolean
  planningPeriodId?: string
  estado?: string
  // Métricas
  slots_demanda?: number
  slots_asignados?: number
  slots_huecos?: number
  cobertura_pct?: number
  horas_asignadas?: number
  total_continuadas?: number
  total_partidas?: number
  tiempo_calculo?: number
  // Issues
  issuesCount?: number
  blockingCount?: number
  warningCount?: number
  infoCount?: number
  // Errores
  error?: string
  errorCode?: string
  // Respuesta completa para el modal de resultado
  solverResponse?: ScheduleResponse
}

// ── Acción principal: generar cuadrante ───────────────────────────────────

export async function generateSchedule(
  planningPeriodId: string,
  options?: {
    seed?: number
    keepLocked?: boolean
    onlyGaps?: boolean
  }
): Promise<GenerateResult> {

  // 1. Cargar el planning period con toda la info necesaria
  const period = await prisma.planningPeriod.findUnique({
    where: { id: planningPeriodId },
    include: { location: true },
  })
  if (!period) return { success: false, error: 'Planning period no encontrado', errorCode: 'NOT_FOUND' }

  // Obtener plantilla de cobertura activa
  const activeTemplate = await getActiveTemplate(period.locationId)
  const coverageSlots = activeTemplate?.coverageRequirements ?? []

  // 2. Cargar empleados activos con todo lo necesario
  const employees = await prisma.employee.findMany({
    where: { organizationId: period.organizationId, isActive: true },
    include: {
      contracts: { where: { isActive: true }, orderBy: { startDate: 'desc' }, take: 1 },
      skills: { include: { skill: true, laborRole: true } },
      availabilities: true,
    },
  })

  if (employees.length === 0) {
    return {
      success: false,
      error: 'No hay empleados activos configurados',
      errorCode: 'NO_EMPLOYEES',
    }
  }

  if (coverageSlots.length === 0) {
    return {
      success: false,
      error: 'No hay necesidades de cobertura configuradas. Ve a "Cobertura" y añade los slots.',
      errorCode: 'NO_COVERAGE',
    }
  }

  // 3. Obtener ausencias aprobadas de la semana para inyectarlas como días libres
  const weekStart = new Date(period.weekStart)
  const weekEnd = addDays(weekStart, 6)
  const absenceBlocks = await getAbsenceBlocksForWeek(
    period.organizationId,
    weekStart,
    weekEnd,
  )

  // 4. Construir el payload para el solver (con ausencias como días_libres)
  const payload = buildScheduleRequest(
    employees,
    coverageSlots,
    (period.location as any).openingHours as Record<string, { open: string; close: string }> | null,
    options?.seed,
    absenceBlocks,  // ← días bloqueados por ausencias aprobadas
  )

  // 4. Llamar a la API OR-Tools
  let response: ScheduleResponse
  try {
    response = await callSolverApi(payload)
  } catch (err) {
    if (err instanceof SolverError) {
      return {
        success: false,
        error: err.message,
        errorCode: err.code,
      }
    }
    return {
      success: false,
      error: `Error inesperado: ${(err as Error).message}`,
      errorCode: 'UNKNOWN',
    }
  }

  // 5. Si el solver no encontró solución, devolver diagnóstico
  if (response.estado === 'INFEASIBLE' || response.estado === 'MODEL_INVALID') {
    return {
      success: false,
      error: response.estado === 'INFEASIBLE'
        ? 'El solver no encontró solución con las restricciones actuales'
        : 'El modelo tiene errores — revisa la configuración',
      errorCode: response.estado,
      solverResponse: response,
      issuesCount: extractIssuesFromResponse(response).length,
    }
  }

  // 6. Persistir en DB (transacción)
  const assignments = mapResponseToAssignments(response, employees, weekStart)

  // Si keepLocked, cargar los bloqueados existentes
  let lockedAssignments: any[] = []
  if (options?.keepLocked) {
    lockedAssignments = await prisma.scheduleAssignment.findMany({
      where: { planningPeriodId, isLocked: true },
    })
  }

  // Extraer issues del solver
  const solverIssues = extractIssuesFromResponse(response)

  await prisma.$transaction(async (tx) => {
    // Borrar assignments no bloqueados del periodo
    if (options?.keepLocked) {
      await tx.scheduleAssignment.deleteMany({
        where: { planningPeriodId, isLocked: false },
      })
    } else {
      await tx.scheduleAssignment.deleteMany({ where: { planningPeriodId } })
    }

    // Crear los nuevos assignments del solver
    // Si onlyGaps, solo crear los que no colisionen con bloqueados
    const lockedDates = new Set(
      lockedAssignments.map(a => `${a.employeeId}_${new Date(a.date).toDateString()}`)
    )

    const toCreate = options?.onlyGaps
      ? assignments.filter(a => !lockedDates.has(`${a.employeeId}_${a.date.toDateString()}`))
      : assignments

    if (toCreate.length > 0) {
      await tx.scheduleAssignment.createMany({
        data: toCreate.map(a => ({
          planningPeriodId,
          locationId: period.locationId,
          ...a,
        })),
      })
    }

    // Actualizar status del planning period
    await tx.planningPeriod.update({
      where: { id: planningPeriodId },
      data: {
        status: 'GENERATED',
        origin: options?.keepLocked ? 'MIXED' : 'AUTOMATIC',
        apiScore: calcScore(response),
        apiMetadata: response as object,
      },
    })

    // Borrar issues anteriores y crear los nuevos
    await tx.validationIssue.deleteMany({ where: { planningPeriodId } })

    if (solverIssues.length > 0) {
      await tx.validationIssue.createMany({
        data: solverIssues.map(issue => ({
          planningPeriodId,
          type: issue.type,
          severity: issue.severity,
          message: issue.message,
          suggestion: issue.suggestion,
          isResolved: false,
        })),
      })
    }
  })

  revalidatePath(`/planning/week/${planningPeriodId}`)

  const blocking = solverIssues.filter(i => i.severity === 'BLOCKING').length
  const warnings = solverIssues.filter(i => i.severity === 'WARNING').length
  const info = solverIssues.filter(i => i.severity === 'INFO').length

  return {
    success: true,
    planningPeriodId,
    estado: response.estado,
    slots_demanda: response.slots_persona_demanda,
    slots_asignados: response.slots_persona_asignados,
    slots_huecos: response.slots_persona_huecos,
    cobertura_pct: response.slots_persona_demanda > 0
      ? Math.round((response.slots_persona_asignados / response.slots_persona_demanda) * 100)
      : 100,
    horas_asignadas: response.horas_persona_asignadas,
    total_continuadas: response.metricas.total_continuadas,
    total_partidas: response.metricas.total_partidas,
    tiempo_calculo: response.tiempo_calculo_segundos,
    issuesCount: solverIssues.length,
    blockingCount: blocking,
    warningCount: warnings,
    infoCount: info,
    solverResponse: response,
  }
}

// ── Health check ──────────────────────────────────────────────────────────

export async function checkSolverStatus() {
  return checkSolverHealth()
}

// ── Score interno ─────────────────────────────────────────────────────────

function calcScore(r: ScheduleResponse): number {
  if (r.slots_persona_demanda === 0) return 100
  const cobertura = (r.slots_persona_asignados / r.slots_persona_demanda) * 100
  const penaltyHuecos = r.huecos_etiqueta.length * 3
  const penaltyGaps = r.gaps_entre_jornadas.filter(g => g.gap_horas != null && g.gap_horas < 12).length * 10
  return Math.max(0, Math.round(cobertura - penaltyHuecos - penaltyGaps))
}
