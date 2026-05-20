// ============================================================
// Shift Solver AI — Schedule Validation Service
// services/validation/scheduleValidation.ts
//
// Convenio colectivo hostelería Tarragona + Estatuto Trabajadores
// ============================================================

import type {
  ScheduleAssignment,
  Employee,
  ValidationIssue,
  CoverageRequirement,
  RuleSeverity,
} from '@/types'

// ---- Helpers ----

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100
}

function assignmentDurationMinutes(a: ScheduleAssignment): number {
  const start = timeToMinutes(a.startTime)
  let end = timeToMinutes(a.endTime)
  // Handle overnight shifts (e.g. 22:00 → 00:00 next day)
  if (end <= start) end += 24 * 60
  return end - start - a.breakMinutes
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function restHoursBetween(prev: ScheduleAssignment, next: ScheduleAssignment): number {
  const prevEnd = timeToMinutes(prev.endTime)
  const nextStart = timeToMinutes(next.startTime)
  const prevDate = new Date(prev.date)
  const nextDate = new Date(next.date)
  const dayDiff = daysBetween(prevDate, nextDate)
  const prevEndAbsolute = dayDiff * 24 * 60 + (prevEnd <= timeToMinutes(prev.startTime) ? prevEnd + 24 * 60 : prevEnd)
  const nextStartAbsolute = dayDiff * 24 * 60 + nextStart
  return (nextStartAbsolute - prevEndAbsolute) / 60
}

function makeIssue(
  planningPeriodId: string,
  type: string,
  severity: RuleSeverity,
  message: string,
  suggestion?: string,
  employeeId?: string,
  assignmentId?: string,
): ValidationIssue {
  return {
    id: `${type}-${employeeId ?? ''}-${assignmentId ?? ''}-${Date.now()}-${Math.random()}`,
    planningPeriodId,
    employeeId,
    assignmentId,
    type,
    severity,
    message,
    suggestion,
    isResolved: false,
  }
}

// ---- Single assignment validation ----

export function validateAssignment(
  assignment: ScheduleAssignment,
  employee: Employee,
  planningPeriodId: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const contract = employee.contract
  if (!contract) return issues

  const durationH = minutesToHours(assignmentDurationMinutes(assignment))
  const maxDaily = contract.maxDailyHours ?? 9

  // Rule 3: max 9h ordinary per day
  if (durationH > maxDaily) {
    issues.push(makeIssue(
      planningPeriodId,
      'MAX_DAILY_HOURS',
      'ERROR',
      `${employee.fullName} — turno de ${durationH}h supera el máximo diario de ${maxDaily}h`,
      `Reduce la jornada a máximo ${maxDaily}h`,
      employee.id,
      assignment.id,
    ))
  }

  // Rule 5: if continuous shift > 5h, needs 20min break
  if (!assignment.isSplit && durationH > 5 && assignment.breakMinutes < 20) {
    issues.push(makeIssue(
      planningPeriodId,
      'MIN_BREAK_CONTINUOUS',
      'ERROR',
      `${employee.fullName} — jornada continua >5h sin descanso mínimo de 20 min`,
      'Añade al menos 20 min de descanso (computan como tiempo trabajado)',
      employee.id,
      assignment.id,
    ))
  }

  // Rule 6: split shift — each part 3–5h, gap ≥ 1.5h
  if (assignment.isSplit && assignment.splitPairId) {
    if (durationH < 3) {
      issues.push(makeIssue(
        planningPeriodId,
        'SPLIT_MIN_HOURS',
        'ERROR',
        `${employee.fullName} — tramo partido de ${durationH}h (mínimo 3h por tramo)`,
        'Cada tramo de jornada partida debe ser de mínimo 3h',
        employee.id,
        assignment.id,
      ))
    }
    if (durationH > 5) {
      issues.push(makeIssue(
        planningPeriodId,
        'SPLIT_MAX_HOURS',
        'ERROR',
        `${employee.fullName} — tramo partido de ${durationH}h (máximo 5h por tramo)`,
        'Cada tramo de jornada partida debe ser de máximo 5h',
        employee.id,
        assignment.id,
      ))
    }
  }

  // Check employee availability restrictions
  const startMinutes = timeToMinutes(assignment.startTime)
  const endMinutes = timeToMinutes(assignment.endTime)
  const dayOfWeek = new Date(assignment.date).getDay()

  // JOSE: no trabaja Lunes-Jueves (1-4), no antes de 07:00
  // EDGAR: no antes de 08:00, no después de 18:00, no sáb/dom
  // MAYTE: Dom-Jue no después de 22:00, nunca antes de 07:00
  // These are populated from employee.availabilities in the full implementation.
  // Here we flag generic availability conflicts:
  if (startMinutes < 7 * 60) {
    issues.push(makeIssue(
      planningPeriodId,
      'AVAILABILITY_RESTRICTION',
      'WARNING',
      `${employee.fullName} — turno inicia antes de las 07:00`,
      'Revisar restricción horaria del trabajador',
      employee.id,
      assignment.id,
    ))
  }

  return issues
}

// ---- Rest between shifts ----

export function validateRestBetweenShifts(
  employee: Employee,
  assignments: ScheduleAssignment[],
  planningPeriodId: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const sorted = [...assignments].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    const dayDiff = daysBetween(new Date(prev.date), new Date(curr.date))

    if (dayDiff > 1) continue // not consecutive days

    const rest = restHoursBetween(prev, curr)
    const minRest = employee.contract?.minRestBetweenShifts ?? 12

    if (rest < minRest) {
      issues.push(makeIssue(
        planningPeriodId,
        'MIN_REST_BETWEEN_SHIFTS',
        'BLOCKING',
        `${employee.fullName} — solo ${rest.toFixed(1)}h de descanso entre turnos (mínimo ${minRest}h)`,
        'Ajusta el horario para garantizar al menos 12h de descanso entre jornadas',
        employee.id,
        curr.id,
      ))
    }
  }

  return issues
}

// ---- Weekly hours ----

export function validateEmployeeWeeklyHours(
  employee: Employee,
  assignments: ScheduleAssignment[],
  planningPeriodId: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const contract = employee.contract
  if (!contract) return issues

  const totalMinutes = assignments.reduce(
    (acc, a) => acc + assignmentDurationMinutes(a),
    0,
  )
  const totalHours = minutesToHours(totalMinutes)
  const max = contract.maxWeeklyHours ?? (contract.weeklyHours + 4) // +4h flexibilidad
  const min = contract.minWeeklyHours ?? Math.max(contract.weeklyHours - 4, 0)

  if (totalHours > max) {
    issues.push(makeIssue(
      planningPeriodId,
      'MAX_WEEKLY_HOURS',
      'ERROR',
      `${employee.fullName} — ${totalHours}h semanales superan el máximo contratado de ${max}h`,
      `Reduce ${(totalHours - max).toFixed(1)}h repartiendo entre otros trabajadores`,
      employee.id,
    ))
  }

  if (totalHours < min) {
    issues.push(makeIssue(
      planningPeriodId,
      'MIN_WEEKLY_HOURS',
      'WARNING',
      `${employee.fullName} — ${totalHours}h semanales por debajo del mínimo de ${min}h`,
      `Añade ${(min - totalHours).toFixed(1)}h para cumplir las horas mínimas contratadas`,
      employee.id,
    ))
  }

  return issues
}

// ---- Weekly rest (2 consecutive days) ----

export function validateWeeklyRest(
  employee: Employee,
  assignments: ScheduleAssignment[],
  planningPeriodId: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const workedDays = new Set(
    assignments.map((a) => new Date(a.date).getDay()),
  )

  // Check for 2 consecutive rest days
  const allDays = [0, 1, 2, 3, 4, 5, 6]
  const restDays = allDays.filter((d) => !workedDays.has(d))

  if (restDays.length < 2) {
    issues.push(makeIssue(
      planningPeriodId,
      'WEEKLY_REST',
      'BLOCKING',
      `${employee.fullName} — no tiene 2 días de descanso semanal`,
      'Asigna 2 días consecutivos de descanso semanal (convenio)',
      employee.id,
    ))
    return issues
  }

  // Check consecutiveness
  let hasConsecutive = false
  for (let i = 0; i < restDays.length - 1; i++) {
    if (restDays[i + 1] - restDays[i] === 1 || (restDays[i] === 6 && restDays[0] === 0)) {
      hasConsecutive = true
      break
    }
  }

  if (!hasConsecutive) {
    issues.push(makeIssue(
      planningPeriodId,
      'WEEKLY_REST_CONSECUTIVE',
      'ERROR',
      `${employee.fullName} — los días de descanso no son consecutivos`,
      'El convenio exige 2 días de descanso ininterrumpidos',
      employee.id,
    ))
  }

  return issues
}

// ---- Coverage validation ----

export interface CoverageSlotResult {
  dayOfWeek: number
  startTime: string
  endTime: string
  required: number
  achieved: number
  hasGap: boolean
  isBlocking: boolean
}

export function validateCoverage(
  requirements: CoverageRequirement[],
  assignments: ScheduleAssignment[],
  weekDays: Date[],
): CoverageSlotResult[] {
  return requirements.map((req) => {
    const dayDate = weekDays[req.dayOfWeek]
    if (!dayDate) return { ...req, required: req.minWorkers, achieved: 0, hasGap: true, isBlocking: req.isRequired }

    const reqStart = timeToMinutes(req.startTime)
    const reqEnd = timeToMinutes(req.endTime)

    const working = assignments.filter((a) => {
      const aDate = new Date(a.date)
      if (aDate.toDateString() !== dayDate.toDateString()) return false
      const aStart = timeToMinutes(a.startTime)
      const aEnd = timeToMinutes(a.endTime) <= timeToMinutes(a.startTime)
        ? timeToMinutes(a.endTime) + 24 * 60
        : timeToMinutes(a.endTime)
      // Worker covers the slot if they are working during it
      return aStart <= reqStart && aEnd >= reqEnd
    })

    const achieved = working.length
    const hasGap = achieved < req.minWorkers

    return {
      dayOfWeek: req.dayOfWeek,
      startTime: req.startTime,
      endTime: req.endTime,
      required: req.minWorkers,
      achieved,
      hasGap,
      isBlocking: hasGap && req.isRequired,
    }
  })
}

// ---- Night hours calculation ----

const NIGHT_START = 22 * 60 // 22:00
const NIGHT_END = 6 * 60    // 06:00

export function calculateNightHours(assignment: ScheduleAssignment): number {
  const start = timeToMinutes(assignment.startTime)
  let end = timeToMinutes(assignment.endTime)
  if (end <= start) end += 24 * 60

  let nightMinutes = 0

  for (let m = start; m < end; m++) {
    const normalizedM = m % (24 * 60)
    if (normalizedM >= NIGHT_START || normalizedM < NIGHT_END) {
      nightMinutes++
    }
  }

  return minutesToHours(nightMinutes)
}

// ---- Overtime calculation ----

export function calculateOvertime(
  employee: Employee,
  assignments: ScheduleAssignment[],
): number {
  const contract = employee.contract
  if (!contract) return 0

  const totalHours = minutesToHours(
    assignments.reduce((acc, a) => acc + assignmentDurationMinutes(a), 0),
  )

  const maxOrdinary = contract.maxWeeklyHours ?? contract.weeklyHours
  return Math.max(0, totalHours - maxOrdinary)
}

// ---- Labour cost calculation ----

export function calculateLaborCost(
  employee: Employee,
  assignments: ScheduleAssignment[],
): number {
  const contract = employee.contract
  const hourlyRate = contract?.hourlyCost ?? contract?.hourlyWage ?? 0
  const nightRate = hourlyRate * 1.25 // +25% nocturno
  const overtimeRate = hourlyRate * 1.75 // horas extra

  let cost = 0
  for (const a of assignments) {
    const normalH = a.normalHours
    const nightH = a.nightHours
    const extraH = a.overtimeHours
    cost += normalH * hourlyRate + nightH * nightRate + extraH * overtimeRate
  }
  return Math.round(cost * 100) / 100
}

// ---- Full planning validation ----

export interface PlanningValidationResult {
  issues: ValidationIssue[]
  coverageResults: CoverageSlotResult[]
  employeeSummaries: {
    employee: Employee
    weeklyHours: number
    overtimeHours: number
    nightHours: number
    estimatedCost: number
    isValid: boolean
  }[]
  isPublishable: boolean
  score: number
}

export function validateFullPlanning(
  employees: Employee[],
  allAssignments: ScheduleAssignment[],
  requirements: CoverageRequirement[],
  weekDays: Date[],
  planningPeriodId: string,
): PlanningValidationResult {
  const allIssues: ValidationIssue[] = []
  const summaries = []

  for (const emp of employees) {
    const empAssignments = allAssignments.filter((a) => a.employeeId === emp.id)

    const dailyIssues = empAssignments.flatMap((a) =>
      validateAssignment(a, emp, planningPeriodId),
    )
    const restIssues = validateRestBetweenShifts(emp, empAssignments, planningPeriodId)
    const weeklyIssues = validateEmployeeWeeklyHours(emp, empAssignments, planningPeriodId)
    const restDayIssues = validateWeeklyRest(emp, empAssignments, planningPeriodId)

    allIssues.push(...dailyIssues, ...restIssues, ...weeklyIssues, ...restDayIssues)

    const weeklyHours = minutesToHours(
      empAssignments.reduce((acc, a) => acc + assignmentDurationMinutes(a), 0),
    )
    const overtimeHours = calculateOvertime(emp, empAssignments)
    const nightHours = empAssignments.reduce((acc, a) => acc + calculateNightHours(a), 0)
    const estimatedCost = calculateLaborCost(emp, empAssignments)
    const empIssues = allIssues.filter(
      (i) => i.employeeId === emp.id && (i.severity === 'ERROR' || i.severity === 'BLOCKING'),
    )

    summaries.push({
      employee: emp,
      weeklyHours,
      overtimeHours,
      nightHours: Math.round(nightHours * 100) / 100,
      estimatedCost,
      isValid: empIssues.length === 0,
    })
  }

  const coverageResults = validateCoverage(requirements, allAssignments, weekDays)
  const blockingCoverage = coverageResults.filter((c) => c.isBlocking)
  const blockingIssues = allIssues.filter((i) => i.severity === 'BLOCKING')
  const isPublishable = blockingIssues.length === 0 && blockingCoverage.length === 0

  // Score: 100 - penalties
  const errorPenalty = allIssues.filter((i) => i.severity === 'ERROR').length * 5
  const warnPenalty = allIssues.filter((i) => i.severity === 'WARNING').length * 2
  const coveragePenalty = coverageResults.filter((c) => c.hasGap).length * 8
  const score = Math.max(0, 100 - errorPenalty - warnPenalty - coveragePenalty)

  return {
    issues: allIssues,
    coverageResults,
    employeeSummaries: summaries,
    isPublishable,
    score,
  }
}
