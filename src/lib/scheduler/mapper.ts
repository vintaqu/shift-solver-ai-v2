// ============================================================
// Shift Solver AI — Mapper
// Convierte modelos Prisma → ScheduleRequest (formato exacto API)
// y ScheduleResponse → ScheduleAssignment[] para guardar en DB
// ============================================================

import { addDays, format } from 'date-fns'
import type {
  ScheduleRequest, ScheduleResponse, Trabajador, Contrato,
  Restricciones, FranjaNum, FranjaRol, FranjaEti, HorarioApertura,
  CuadranteTrabajador, JornadaDia
} from './index'

// ── Mapeo de niveles internos → nombres exactos del solver ────────────────

const LEVEL_TO_ROL: Record<string, string> = {
  BASIC:        'CAMARERO_BASICO',
  SEMI_MANAGER: 'SEMI_ENCARGADO',
  MANAGER:      'ENCARGADO',
  OWNER:        'DUENO',
}

// Mapeo inverso — del nombre del solver al level de DB
const ROL_TO_LEVEL: Record<string, string> = Object.fromEntries(
  Object.entries(LEVEL_TO_ROL).map(([k, v]) => [v, k])
)

// Días en español en orden — solver espera esta lista exacta
const DIAS_SOLVER = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']

// Mapeo fecha (Date.getDay() = 0=Dom) → nombre solver
function dateTodiaSolver(date: Date): string {
  const idx = (date.getDay() + 6) % 7  // 0=Lun, 6=Dom
  return DIAS_SOLVER[idx]
}

// Horario por día del solver (siempre el mismo restaurante)
const HORARIO_APERTURA_DEFAULT: Record<string, HorarioApertura> = {
  LUNES:     { apertura: '06:00', cierre: '00:00' },
  MARTES:    { apertura: '06:00', cierre: '00:00' },
  MIERCOLES: { apertura: '06:00', cierre: '00:00' },
  JUEVES:    { apertura: '06:00', cierre: '00:00' },
  VIERNES:   { apertura: '06:00', cierre: '00:00' },
  SABADO:    { apertura: '06:30', cierre: '00:00' },
  DOMINGO:   { apertura: '06:30', cierre: '00:00' },
}

// ── Mapper: Empleado DB → Trabajador solver ────────────────────────────────

function mapEmployee(emp: any): Trabajador {
  const contract = emp.contracts?.[0]
  const roleLevel = emp.skills?.[0]?.laborRole?.level ?? 'BASIC'
  const skillNames = [...new Set(
    emp.skills?.map((s: any) => s.skill?.name).filter(Boolean) as string[]
  )]

  // Contrato
  let contrato: Contrato
  if (contract?.minWeeklyHours != null && contract?.maxWeeklyHours != null &&
      contract.minWeeklyHours !== contract.maxWeeklyHours) {
    contrato = {
      tipo: 'horquilla',
      min_horas: contract.minWeeklyHours,
      max_horas: contract.maxWeeklyHours,
    }
  } else {
    contrato = {
      tipo: 'fijo',
      horas: contract?.weeklyHours ?? 40,
    }
  }

  // Restricciones desde availabilities
  const restricciones: Restricciones = {
    dias_libres: [],
    no_antes_de: [],
    no_despues_de: [],
    trabajar_obligatorio: [],
  }

  for (const av of emp.availabilities ?? []) {
    const dias = av.dayOfWeek != null ? [DIAS_SOLVER[av.dayOfWeek]] : 'TODOS' as const

    if (av.type === 'DAY_OFF' && !av.startTime) {
      // Día libre completo
      if (Array.isArray(dias)) restricciones.dias_libres.push(...dias)
    } else if (av.type === 'NOT_BEFORE' && av.startTime) {
      restricciones.no_antes_de.push({ hora: av.startTime, dias })
    } else if (av.type === 'NOT_AFTER' && av.endTime) {
      restricciones.no_despues_de.push({ hora: av.endTime, dias })
    } else if (av.type === 'ONLY_BETWEEN' && av.startTime && av.endTime) {
      // ONLY_BETWEEN = no antes de startTime Y no después de endTime
      restricciones.no_antes_de.push({ hora: av.startTime, dias })
      restricciones.no_despues_de.push({ hora: av.endTime, dias })
    } else if (av.type === 'DAY_OFF' && av.startTime && av.dayOfWeek != null) {
      // Franja bloqueada dentro de un día — modelamos como no_antes_de + no_despues_de
      // (aproximación: el solver no tiene tipo "franja bloqueada" explícito)
    }
  }

  // Etiquetas en MAYÚSCULAS (el solver las espera así)
  const etiquetasSolver = skillNames.map(s => s.toUpperCase())

  // Jornada mínima diaria: 4h para todos los contratos >= 20h/sem
  // En hostelería no tiene sentido operativo un turno menor a 4h salvo contratos muy reducidos
  const weeklyH = contract?.weeklyHours ?? 40
  const minHorasJornada = weeklyH >= 20 ? 4.0 : 3.0

  return {
    nombre: `${emp.firstName.toUpperCase()} ${emp.lastName.toUpperCase()}`,
    contrato,
    rol: LEVEL_TO_ROL[roleLevel] ?? 'CAMARERO_BASICO',
    etiquetas: etiquetasSolver,
    restricciones,
    min_horas_jornada: minHorasJornada,
  }
}

// ── Mapper: CoverageRequirements DB → Franjas solver ──────────────────────

function mapCoverageToFranjas(slots: any[]): {
  franjas_num: Record<string, FranjaNum[]>
  franjas_rol: Record<string, FranjaRol[]>
  franjas_eti: Record<string, FranjaEti[]>
} {
  const franjas_num: Record<string, FranjaNum[]> = {}
  const franjas_rol: Record<string, FranjaRol[]> = {}
  const franjas_eti: Record<string, FranjaEti[]> = {}

  // Inicializar todos los días
  for (const dia of DIAS_SOLVER) {
    franjas_num[dia] = []
    franjas_rol[dia] = []
    franjas_eti[dia] = []
  }

  // Agrupar slots por día
  const byDay: Record<number, any[]> = {}
  for (const slot of slots) {
    if (!byDay[slot.dayOfWeek]) byDay[slot.dayOfWeek] = []
    byDay[slot.dayOfWeek].push(slot)
  }

  for (const [dayIdx, daySlots] of Object.entries(byDay)) {
    const dia = DIAS_SOLVER[Number(dayIdx)]
    if (!dia) continue

    // Ordenar por hora inicio
    const sorted = [...daySlots].sort((a, b) => a.startTime.localeCompare(b.startTime))

    // Consolidar franjas contiguas con misma demanda (reduce el tamaño del payload)
    // Pero el solver acepta franjas solapadas o no contiguas, así que enviamos todo
    for (const slot of sorted) {
      // Numérica
      const existingNum = franjas_num[dia].find(
        f => f.inicio === slot.startTime && f.fin === slot.endTime
      )
      if (!existingNum) {
        franjas_num[dia].push({
          inicio: slot.startTime,
          fin: slot.endTime,
          personas: slot.minWorkers,
        })
      }

      // Rol — si el slot tiene laborRole, añadirlo; si no, solo camarero básico
      if (slot.laborRole) {
        const rolSolver = LEVEL_TO_ROL[slot.laborRole.level] ?? 'CAMARERO_BASICO'
        const existingRol = franjas_rol[dia].find(
          f => f.inicio === slot.startTime && f.fin === slot.endTime
        )
        if (existingRol) {
          existingRol.personas_por_rol[rolSolver] =
            (existingRol.personas_por_rol[rolSolver] ?? 0) + 1
        } else {
          // Distribuir: 1 del rol requerido, resto camarero básico
          const personas_por_rol: Record<string, number> = {}
          if (rolSolver === 'CAMARERO_BASICO') {
            personas_por_rol['CAMARERO_BASICO'] = slot.minWorkers
          } else {
            personas_por_rol[rolSolver] = 1
            const resto = slot.minWorkers - 1
            if (resto > 0) personas_por_rol['CAMARERO_BASICO'] = resto
          }
          franjas_rol[dia].push({
            inicio: slot.startTime,
            fin: slot.endTime,
            personas_por_rol,
          })
        }
      } else {
        // Sin rol específico → todo camarero básico
        const existing = franjas_rol[dia].find(
          f => f.inicio === slot.startTime && f.fin === slot.endTime
        )
        if (!existing) {
          franjas_rol[dia].push({
            inicio: slot.startTime,
            fin: slot.endTime,
            personas_por_rol: { CAMARERO_BASICO: slot.minWorkers },
          })
        }
      }

      // Etiqueta
      if (slot.skill) {
        const existing = franjas_eti[dia].find(
          f => f.inicio === slot.startTime && f.fin === slot.endTime
        )
        if (existing) {
          if (!existing.etiquetas.includes(slot.skill.name.toUpperCase())) {
            existing.etiquetas.push(slot.skill.name.toUpperCase())
          }
        } else {
          franjas_eti[dia].push({
            inicio: slot.startTime,
            fin: slot.endTime,
            etiquetas: [slot.skill.name.toUpperCase()],
          })
        }
      }
    }
  }

  return { franjas_num, franjas_rol, franjas_eti }
}

// ── Construir el ScheduleRequest completo ─────────────────────────────────

export function buildScheduleRequest(
  employees: any[],
  coverageSlots: any[],
  openingHours: Record<string, { open: string; close: string }> | null,
  seed?: number,
  absenceBlocks?: Record<string, string[]>,  // nombre_solver → ['LUNES', 'MARTES', ...]
): ScheduleRequest {
  // Horario de apertura: del local si existe, si no el default
  const horario_apertura: Record<string, HorarioApertura> = {}
  for (const dia of DIAS_SOLVER) {
    const dayKey = dia.charAt(0) + dia.slice(1).toLowerCase() // LUNES → Lunes
    const oh = openingHours?.[dia] ?? openingHours?.[dayKey]
    if (oh) {
      horario_apertura[dia] = { apertura: oh.open, cierre: oh.close }
    } else {
      horario_apertura[dia] = HORARIO_APERTURA_DEFAULT[dia]
    }
  }

  // Catálogo de etiquetas completo (union de todas las etiquetas de empleados)
  const etiquetasSet = new Set<string>()
  for (const emp of employees) {
    for (const s of emp.skills ?? []) {
      if (s.skill?.name) etiquetasSet.add(s.skill.name.toUpperCase())
    }
  }
  // Añadir etiquetas conocidas del catálogo
  const ETIQUETAS_CATALOGO = [
    'PASTAS','APERTURA','CAJERA','BARISTA','BANDEJERA',
    'PLANCHISTA','COMANDERA','BARRA','DELIVERY','CIERRE','CONTABLE',
  ]
  for (const e of ETIQUETAS_CATALOGO) etiquetasSet.add(e)

  const { franjas_num, franjas_rol, franjas_eti } = mapCoverageToFranjas(coverageSlots)

  // Aplicar ausencias como días_libres extra en las restricciones de cada trabajador
  const trabajadores = employees.map(emp => {
    const trabajador = mapEmployee(emp)
    const solverName = trabajador.nombre
    const absenceDays = absenceBlocks?.[solverName] ?? []
    if (absenceDays.length > 0) {
      // Unir con los días libres ya configurados (restricciones individuales)
      const existing = trabajador.restricciones.dias_libres
      const merged = Array.from(new Set([...existing, ...absenceDays]))
      trabajador.restricciones.dias_libres = merged
    }
    return trabajador
  })

  return {
    dias: DIAS_SOLVER,
    roles_jerarquia: ['CAMARERO_BASICO', 'SEMI_ENCARGADO', 'ENCARGADO', 'DUENO'],
    etiquetas: Array.from(etiquetasSet),
    slot_duracion_min: 30,
    horario_apertura,
    trabajadores,
    franjas_num,
    franjas_rol,
    franjas_eti,
    parametros: {
      seed: seed ?? null,
      time_limit_seconds: 90,
      min_horas_jornada_global: 4.0,  // mínimo global — cada trabajador puede tener el suyo
    },
  }
}

// ── Mapper: ScheduleResponse → ScheduleAssignment[] para DB ───────────────

export interface MappedAssignment {
  employeeId: string
  date: Date
  startTime: string
  endTime: string
  breakMinutes: number
  isSplit: boolean
  normalHours: number
  nightHours: number
  overtimeHours: number
  origin: 'AUTOMATIC'
  status: 'DRAFT'
  isLocked: false
  notes: string | null
}

export function mapResponseToAssignments(
  response: ScheduleResponse,
  employees: any[],       // empleados de DB
  weekStart: Date,        // lunes de la semana
): MappedAssignment[] {
  const assignments: MappedAssignment[] = []

  // Mapa nombre solver → empleado DB
  const nameToEmployee = new Map<string, any>()
  for (const emp of employees) {
    const solverName = `${emp.firstName.toUpperCase()} ${emp.lastName.toUpperCase()}`
    nameToEmployee.set(solverName, emp)
    // También por nombre parcial (firstName)
    nameToEmployee.set(emp.firstName.toUpperCase(), emp)
  }

  for (const cuadrante of response.cuadrante) {
    const emp = nameToEmployee.get(cuadrante.nombre) ??
      nameToEmployee.get(cuadrante.nombre.split(' ')[0])

    if (!emp) continue  // empleado en solver no encontrado en DB — skip

    for (const jornada of cuadrante.jornadas) {
      if (jornada.tipo === 'descanso' || jornada.tramos.length === 0) continue

      // Calcular fecha
      const diaIdx = DIAS_SOLVER.indexOf(jornada.dia.toUpperCase())
      if (diaIdx === -1) continue
      const date = addDays(weekStart, diaIdx)

      // Calcular horas nocturnas del tramo (22:00–06:00)
      function calcNightH(start: string, end: string): number {
        const toMin = (t: string) => {
          const [h, m] = t.split(':').map(Number)
          return h * 60 + (m || 0)
        }
        const s = toMin(start)
        let e = toMin(end)
        if (e <= s) e += 24 * 60
        let night = 0
        for (let m = s; m < e; m++) {
          const n = m % (24 * 60)
          if (n >= 22 * 60 || n < 6 * 60) night++
        }
        return night / 60
      }

      if (jornada.tipo === 'partida' && jornada.tramos.length >= 2) {
        // Jornada partida → 2 assignments (uno por tramo)
        for (const tramo of jornada.tramos) {
          const nightH = calcNightH(tramo.inicio, tramo.fin)
          assignments.push({
            employeeId: emp.id,
            date,
            startTime: tramo.inicio,
            endTime: tramo.fin,
            breakMinutes: 0,
            isSplit: true,
            normalHours: tramo.duracion_horas - nightH,
            nightHours: nightH,
            overtimeHours: 0,
            origin: 'AUTOMATIC',
            status: 'DRAFT',
            isLocked: false,
            notes: `Tramo jornada partida (solver OR-Tools)`,
          })
        }
      } else {
        // Jornada continua → 1 assignment
        const tramo = jornada.tramos[0]
        if (!tramo) continue
        const breakMin = jornada.requiere_pausa_20min ? 20 : 0
        const nightH = calcNightH(tramo.inicio, tramo.fin)
        const totalH = jornada.horas

        assignments.push({
          employeeId: emp.id,
          date,
          startTime: tramo.inicio,
          endTime: tramo.fin,
          breakMinutes: breakMin,
          isSplit: false,
          normalHours: totalH - nightH,
          nightHours: nightH,
          overtimeHours: 0,
          origin: 'AUTOMATIC',
          status: 'DRAFT',
          isLocked: false,
          notes: jornada.requiere_pausa_20min
            ? 'Jornada >5h — incluye pausa obligatoria 20min (computa como trabajo)'
            : null,
        })
      }
    }
  }

  return assignments
}

// ── Traducir resultado del solver a ValidationIssues legibles ─────────────

export interface SolverIssue {
  type: string
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'BLOCKING'
  message: string
  suggestion: string
  employeeName?: string
  day?: string
}

export function extractIssuesFromResponse(response: ScheduleResponse): SolverIssue[] {
  const issues: SolverIssue[] = []

  // Huecos de cobertura
  for (const hueco of response.huecos_cobertura) {
    issues.push({
      type: 'COVERAGE_GAP',
      severity: 'ERROR',
      message: `${hueco.dia} ${hueco.inicio}–${hueco.fin}: faltan ${hueco.falta_personas} persona(s) (cubierto ${hueco.cubierto}/${hueco.demanda_total})`,
      suggestion: 'Añade personal manualmente en esta franja o ajusta la demanda de cobertura',
      day: hueco.dia,
    })
  }

  // Huecos de etiqueta
  for (const hueco of response.huecos_etiqueta) {
    issues.push({
      type: 'LABEL_GAP',
      severity: 'WARNING',
      message: `${hueco.dia} ${hueco.inicio}–${hueco.fin}: ningún asignado tiene [${hueco.etiquetas_requeridas.join(', ')}]`,
      suggestion: `Asigna manualmente a alguien con estas etiquetas: ${hueco.etiquetas_requeridas.join(', ')}`,
      day: hueco.dia,
    })
  }

  // Gaps entre jornadas < 12h
  for (const gap of response.gaps_entre_jornadas) {
    if (gap.gap_horas != null && gap.gap_horas < 12) {
      issues.push({
        type: 'MIN_REST_VIOLATION',
        severity: 'BLOCKING',
        message: `${gap.trabajador}: solo ${gap.gap_horas.toFixed(1)}h descanso en cruce ${gap.cruce} (mínimo 12h)`,
        suggestion: 'Ajusta manualmente los turnos de ese cruce de día',
        employeeName: gap.trabajador,
      })
    }
  }

  // Pausas 20min obligatorias (informativo)
  for (const pausa of response.pausas_obligatorias) {
    issues.push({
      type: 'REQUIRED_BREAK',
      severity: 'INFO',
      message: `${pausa.trabajador} el ${pausa.dia}: jornada continua ${pausa.inicio}–${pausa.fin} (${pausa.duracion_horas}h) requiere pausa interna de 20 min`,
      suggestion: 'El restaurante debe asignar internamente la pausa de 20 min (computa como tiempo trabajado)',
      employeeName: pausa.trabajador,
    })
  }

  // Propuestas del diagnóstico (si hay)
  if (response.diagnostico) {
    for (const propuesta of response.diagnostico.propuestas) {
      const severityMap: Record<string, 'INFO' | 'WARNING' | 'ERROR' | 'BLOCKING'> = {
        critica: 'BLOCKING',
        alta: 'ERROR',
        media: 'WARNING',
        baja: 'INFO',
      }
      issues.push({
        type: `DIAGNOSTIC_${propuesta.categoria.toUpperCase()}`,
        severity: severityMap[propuesta.severidad] ?? 'WARNING',
        message: `${propuesta.titulo}: ${propuesta.mensaje}`,
        suggestion: propuesta.accion_sugerida,
        employeeName: propuesta.afecta_trabajador ?? undefined,
        day: propuesta.afecta_dia ?? undefined,
      })
    }
  }

  return issues
}
