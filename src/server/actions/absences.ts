'use server'

import { revalidatePath } from 'next/cache'
import { addDays, format } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { calcDays, ABSENCE_LABELS } from '@/lib/absenceUtils'

// ── Días de vacaciones consumidos en el año ────────────────────────────────
export async function getVacationDaysUsed(
  employeeId: string,
  year: number,
): Promise<number> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { vacationDaysType: true },
  })

  const absences = await prisma.absenceRequest.findMany({
    where: {
      employeeId,
      type: 'VACACIONES',
      status: 'APPROVED',
      startDate: { gte: new Date(year, 0, 1) },
      endDate:   { lte: new Date(year, 11, 31) },
    },
  })

  const tipo = (emp?.vacationDaysType ?? 'NATURALES') as 'NATURALES' | 'LABORABLES'
  return absences.reduce(
    (acc, a) => acc + calcDays(new Date(a.startDate), new Date(a.endDate), tipo),
    0,
  )
}

// ── Crear ausencia ─────────────────────────────────────────────────────────
export async function createAbsence(data: {
  organizationId: string
  employeeId: string
  type: string
  startDate: string
  endDate: string
  comment?: string
  blocksPlanningPeriods?: boolean
}) {
  const emp = await prisma.employee.findUnique({
    where: { id: data.employeeId },
    select: { vacationDaysType: true, vacationDaysPerYear: true },
  })

  const start = new Date(data.startDate)
  const end   = new Date(data.endDate)
  const tipo  = (emp?.vacationDaysType ?? 'NATURALES') as 'NATURALES' | 'LABORABLES'
  const totalDays = calcDays(start, end, tipo)

  // Verificar solapamiento
  const overlap = await prisma.absenceRequest.findFirst({
    where: {
      employeeId: data.employeeId,
      status: { not: 'REJECTED' },
      startDate: { lte: end },
      endDate:   { gte: start },
    },
  })
  if (overlap) {
    throw new Error(
      `Ya existe una ausencia en ese rango (${format(new Date(overlap.startDate), 'dd/MM/yyyy')} – ${format(new Date(overlap.endDate), 'dd/MM/yyyy')})`
    )
  }

  const absence = await prisma.absenceRequest.create({
    data: {
      organizationId: data.organizationId,
      employeeId:     data.employeeId,
      type:           data.type as any,
      startDate:      start,
      endDate:        end,
      totalDays,
      status:         'PENDING',
      comment:        data.comment?.trim() || null,
      blocksPlanningPeriods: data.blocksPlanningPeriods ?? true,
    },
    include: { employee: true },
  })

  revalidatePath('/absences')
  revalidatePath(`/employees/${data.employeeId}`)
  return absence
}

// ── Actualizar ausencia ────────────────────────────────────────────────────
export async function updateAbsence(id: string, data: {
  type?: string
  startDate?: string
  endDate?: string
  comment?: string
  managerNote?: string
  blocksPlanningPeriods?: boolean
}) {
  const existing = await prisma.absenceRequest.findUnique({
    where: { id },
    include: { employee: true },
  })
  if (!existing) throw new Error('Ausencia no encontrada')
  if (existing.status === 'APPROVED') throw new Error('No se puede editar una ausencia aprobada')

  const start = data.startDate ? new Date(data.startDate) : new Date(existing.startDate)
  const end   = data.endDate   ? new Date(data.endDate)   : new Date(existing.endDate)
  const tipo  = (existing.employee.vacationDaysType ?? 'NATURALES') as 'NATURALES' | 'LABORABLES'
  const totalDays = calcDays(start, end, tipo)

  const updated = await prisma.absenceRequest.update({
    where: { id },
    data: {
      ...(data.type && { type: data.type as any }),
      startDate: start,
      endDate:   end,
      totalDays,
      ...(data.comment      !== undefined && { comment:      data.comment }),
      ...(data.managerNote  !== undefined && { managerNote:  data.managerNote }),
      ...(data.blocksPlanningPeriods !== undefined && { blocksPlanningPeriods: data.blocksPlanningPeriods }),
    },
  })

  revalidatePath('/absences')
  revalidatePath(`/employees/${existing.employeeId}`)
  return updated
}

// ── Eliminar ausencia ──────────────────────────────────────────────────────
export async function deleteAbsence(id: string) {
  const existing = await prisma.absenceRequest.findUnique({ where: { id } })
  if (!existing) throw new Error('Ausencia no encontrada')
  if (existing.status === 'APPROVED') throw new Error('No se puede eliminar una ausencia aprobada')

  await prisma.absenceRequest.delete({ where: { id } })
  revalidatePath('/absences')
  revalidatePath(`/employees/${existing.employeeId}`)
  return { success: true }
}

// ── Aprobar ausencia ───────────────────────────────────────────────────────
export async function approveAbsence(id: string, managerNote?: string) {
  const existing = await prisma.absenceRequest.findUnique({
    where: { id },
    include: { employee: true },
  })
  if (!existing) throw new Error('Ausencia no encontrada')

  // Verificar saldo si es VACACIONES
  if (existing.type === 'VACACIONES') {
    const year  = new Date(existing.startDate).getFullYear()
    const used  = await getVacationDaysUsed(existing.employeeId, year)
    const total = existing.employee.vacationDaysPerYear ?? 23
    const tipo  = (existing.employee.vacationDaysType ?? 'NATURALES') as 'NATURALES' | 'LABORABLES'
    const thisDays = calcDays(new Date(existing.startDate), new Date(existing.endDate), tipo)

    if (used + thisDays > total) {
      throw new Error(
        `Saldo insuficiente: ${existing.employee.firstName} tiene ${total - used} días disponibles y esta solicitud requiere ${thisDays} días`
      )
    }
  }

  const updated = await prisma.absenceRequest.update({
    where: { id },
    data: {
      status:     'APPROVED',
      resolvedAt: new Date(),
      ...(managerNote && { managerNote }),
    },
    include: { employee: true },
  })

  // Notificación
  await prisma.notification.create({
    data: {
      organizationId: existing.organizationId,
      employeeId:     existing.employeeId,
      type:           'ABSENCE_APPROVED',
      title:          'Ausencia aprobada',
      body:           `Tu solicitud de ${ABSENCE_LABELS[existing.type] ?? existing.type} del ${format(new Date(existing.startDate), 'dd/MM/yyyy')} al ${format(new Date(existing.endDate), 'dd/MM/yyyy')} ha sido aprobada.`,
    },
  })

  revalidatePath('/absences')
  revalidatePath(`/employees/${existing.employeeId}`)
  return updated
}

// ── Rechazar ausencia ──────────────────────────────────────────────────────
export async function rejectAbsence(id: string, managerNote: string) {
  const existing = await prisma.absenceRequest.findUnique({ where: { id } })
  if (!existing) throw new Error('Ausencia no encontrada')

  const updated = await prisma.absenceRequest.update({
    where: { id },
    data: {
      status:     'REJECTED',
      resolvedAt: new Date(),
      managerNote,
    },
  })

  await prisma.notification.create({
    data: {
      organizationId: existing.organizationId,
      employeeId:     existing.employeeId,
      type:           'ABSENCE_REJECTED',
      title:          'Ausencia no aprobada',
      body:           `Tu solicitud ha sido denegada. Motivo: ${managerNote}`,
    },
  })

  revalidatePath('/absences')
  revalidatePath(`/employees/${existing.employeeId}`)
  return updated
}

// ── Días bloqueados por ausencias para el solver ───────────────────────────
export async function getAbsenceBlocksForWeek(
  organizationId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<Record<string, string[]>> {
  const DIAS_SOLVER = ['LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO']

  const absences = await prisma.absenceRequest.findMany({
    where: {
      organizationId,
      status:               'APPROVED',
      blocksPlanningPeriods: true,
      startDate: { lte: weekEnd },
      endDate:   { gte: weekStart },
    },
    include: { employee: true },
  })

  const blocks: Record<string, string[]> = {}

  for (const absence of absences) {
    const empName = `${absence.employee.firstName.toUpperCase()} ${absence.employee.lastName.toUpperCase()}`
    if (!blocks[empName]) blocks[empName] = []

    let cursor = new Date(absence.startDate)
    const end  = new Date(absence.endDate)

    while (cursor <= end) {
      if (cursor >= weekStart && cursor <= weekEnd) {
        const dayIdx   = (cursor.getDay() + 6) % 7   // 0=Lun, 6=Dom
        const diaSolver = DIAS_SOLVER[dayIdx]
        if (diaSolver && !blocks[empName].includes(diaSolver)) {
          blocks[empName].push(diaSolver)
        }
      }
      cursor = addDays(cursor, 1)
    }
  }

  return blocks
}

// ── Actualizar configuración de vacaciones del empleado ────────────────────
export async function updateEmployeeVacationConfig(
  employeeId: string,
  vacationDaysType: 'NATURALES' | 'LABORABLES',
  vacationDaysPerYear: number,
) {
  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data:  { vacationDaysType, vacationDaysPerYear },
  })
  revalidatePath(`/employees/${employeeId}`)
  revalidatePath('/absences')
  return updated
}
