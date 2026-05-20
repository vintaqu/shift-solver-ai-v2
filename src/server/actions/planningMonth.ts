'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, format } from 'date-fns'

// ── Datos completos del mes para el calendario ─────────────────────────────
export async function getMonthData(
  organizationId: string,
  locationId: string,
  year: number,
  month: number, // 1-12
) {
  const monthStart = startOfMonth(new Date(year, month - 1, 1))
  const monthEnd = endOfMonth(monthStart)

  // Extender al inicio/fin de semana para mostrar días de semanas parciales
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const [periods, absences, employees] = await Promise.all([
    // Todos los periodos que tocan este rango del calendario
    prisma.planningPeriod.findMany({
      where: {
        organizationId,
        locationId,
        weekStart: { lte: calEnd },
        weekEnd: { gte: calStart },
      },
      include: {
        assignments: {
          select: {
            id: true,
            date: true,
            employeeId: true,
            startTime: true,
            endTime: true,
            breakMinutes: true,
            normalHours: true,
            nightHours: true,
            overtimeHours: true,
          },
        },
        validationIssues: {
          where: { isResolved: false },
          select: { id: true, severity: true },
        },
      },
      orderBy: { weekStart: 'asc' },
    }),

    // Ausencias que tocan este mes
    prisma.absenceRequest.findMany({
      where: {
        employee: { organizationId },
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: calEnd },
        endDate: { gte: calStart },
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, color: true },
        },
      },
      orderBy: { startDate: 'asc' },
    }),

    // Empleados activos para métricas
    prisma.employee.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        color: true,
        contracts: {
          where: { isActive: true },
          take: 1,
          select: { weeklyHours: true },
        },
      },
    }),
  ])

  // Agregar datos por día
  const dayMap: Record<string, {
    date: string
    workers: number
    totalHours: number
    nightHours: number
    overtimeHours: number
    planningPeriodId: string | null
    status: string | null
    issues: number
    blockingIssues: number
    absences: Array<{ employeeId: string; firstName: string; lastName: string; color: string; type: string }>
  }> = {}

  // Inicializar todos los días del calendario
  let cursor = new Date(calStart)
  while (cursor <= calEnd) {
    const key = format(cursor, 'yyyy-MM-dd')
    dayMap[key] = {
      date: key,
      workers: 0,
      totalHours: 0,
      nightHours: 0,
      overtimeHours: 0,
      planningPeriodId: null,
      status: null,
      issues: 0,
      blockingIssues: 0,
      absences: [],
    }
    cursor = addDays(cursor, 1)
  }

  // Mapear assignments a días
  for (const period of periods) {
    for (const a of period.assignments) {
      const key = format(new Date(a.date), 'yyyy-MM-dd')
      if (!dayMap[key]) continue
      dayMap[key].workers++
      dayMap[key].totalHours += a.normalHours
      dayMap[key].nightHours += a.nightHours
      dayMap[key].overtimeHours += a.overtimeHours
      dayMap[key].planningPeriodId = period.id
      dayMap[key].status = period.status
      dayMap[key].issues = period.validationIssues.length
      dayMap[key].blockingIssues = period.validationIssues.filter(
        i => i.severity === 'BLOCKING' || i.severity === 'ERROR'
      ).length
    }

    // Para semanas sin assignments, marcar igualmente el status
    let weekDay = new Date(period.weekStart)
    for (let i = 0; i < 7; i++) {
      const key = format(weekDay, 'yyyy-MM-dd')
      if (dayMap[key] && !dayMap[key].planningPeriodId) {
        dayMap[key].planningPeriodId = period.id
        dayMap[key].status = period.status
      }
      weekDay = addDays(weekDay, 1)
    }
  }

  // Mapear ausencias a días
  for (const absence of absences) {
    let d = new Date(absence.startDate)
    const end = new Date(absence.endDate)
    while (d <= end) {
      const key = format(d, 'yyyy-MM-dd')
      if (dayMap[key]) {
        dayMap[key].absences.push({
          employeeId: absence.employee.id,
          firstName: absence.employee.firstName,
          lastName: absence.employee.lastName,
          color: absence.employee.color,
          type: absence.type,
        })
      }
      d = addDays(d, 1)
    }
  }

  // Métricas del mes completo
  const monthDays = Object.values(dayMap).filter(d => {
    const date = new Date(d.date)
    return date >= monthStart && date <= monthEnd
  })

  const monthMetrics = {
    totalHours: monthDays.reduce((a, d) => a + d.totalHours, 0),
    totalNightHours: monthDays.reduce((a, d) => a + d.nightHours, 0),
    totalOvertimeHours: monthDays.reduce((a, d) => a + d.overtimeHours, 0),
    weeksPublished: periods.filter(p => p.status === 'PUBLISHED').length,
    weeksDraft: periods.filter(p => p.status === 'DRAFT' || p.status === 'GENERATED').length,
    weeksTotal: periods.length,
    weeksEmpty: 0, // calculado abajo
    totalAlerts: periods.reduce((a, p) => a + p.validationIssues.length, 0),
    totalAbsences: absences.length,
    approvedAbsences: absences.filter(a => a.status === 'APPROVED').length,
    pendingAbsences: absences.filter(a => a.status === 'PENDING').length,
  }

  // Contar semanas vacías del mes
  const weeksInMonth = getWeeksInMonth(year, month)
  monthMetrics.weeksEmpty = Math.max(0, weeksInMonth - periods.length)

  return {
    days: dayMap,
    periods: periods.map(p => ({
      id: p.id,
      weekStart: format(new Date(p.weekStart), 'yyyy-MM-dd'),
      weekEnd: format(new Date(p.weekEnd), 'yyyy-MM-dd'),
      status: p.status,
      origin: p.origin,
      assignmentsCount: p.assignments.length,
      issuesCount: p.validationIssues.length,
      blockingIssuesCount: p.validationIssues.filter(
        i => i.severity === 'BLOCKING' || i.severity === 'ERROR'
      ).length,
      score: null as number | null,
    })),
    absences: absences.map(a => ({
      id: a.id,
      employeeId: a.employee.id,
      employeeName: `${a.employee.firstName} ${a.employee.lastName}`,
      employeeColor: a.employee.color,
      type: a.type,
      status: a.status,
      startDate: format(new Date(a.startDate), 'yyyy-MM-dd'),
      endDate: format(new Date(a.endDate), 'yyyy-MM-dd'),
    })),
    employees: employees.map(e => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      color: e.color,
      weeklyHours: e.contracts[0]?.weeklyHours ?? 0,
    })),
    metrics: monthMetrics,
    calStart: format(calStart, 'yyyy-MM-dd'),
    calEnd: format(calEnd, 'yyyy-MM-dd'),
    monthStart: format(monthStart, 'yyyy-MM-dd'),
    monthEnd: format(monthEnd, 'yyyy-MM-dd'),
  }
}

function getWeeksInMonth(year: number, month: number): number {
  const start = startOfWeek(startOfMonth(new Date(year, month - 1, 1)), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(new Date(year, month - 1, 1)), { weekStartsOn: 1 })
  let count = 0
  let cursor = start
  while (cursor <= end) {
    count++
    cursor = addDays(cursor, 7)
  }
  return count
}

// ── Crear un planning period para una semana desde el calendario ────────────
export async function createPlanningPeriodForWeek(
  organizationId: string,
  locationId: string,
  weekStartISO: string,
) {
  const weekStart = new Date(weekStartISO)
  const weekEnd = addDays(weekStart, 6)

  // Verificar que no existe ya
  const existing = await prisma.planningPeriod.findFirst({
    where: {
      organizationId,
      locationId,
      weekStart: { gte: weekStart, lte: addDays(weekStart, 1) },
    },
  })

  if (existing) return existing

  const period = await prisma.planningPeriod.create({
    data: {
      organizationId,
      locationId,
      weekStart,
      weekEnd,
      status: 'DRAFT',
      origin: 'MANUAL',
      version: 1,
    },
  })

  revalidatePath('/planning')
  return period
}

// ── Duplicar una semana entera a otra ──────────────────────────────────────
export async function duplicateWeekToDate(
  sourcePeriodId: string,
  targetWeekStartISO: string,
  organizationId: string,
  locationId: string,
) {
  const source = await prisma.planningPeriod.findUnique({
    where: { id: sourcePeriodId },
    include: { assignments: true },
  })
  if (!source) throw new Error('Semana origen no encontrada')

  const targetWeekStart = new Date(targetWeekStartISO)
  const targetWeekEnd = addDays(targetWeekStart, 6)
  const dayDiff = Math.round(
    (targetWeekStart.getTime() - new Date(source.weekStart).getTime()) / (1000 * 60 * 60 * 24)
  )

  // Borrar si existe
  const existing = await prisma.planningPeriod.findFirst({
    where: { organizationId, locationId, weekStart: targetWeekStart },
  })
  if (existing) {
    await prisma.scheduleAssignment.deleteMany({ where: { planningPeriodId: existing.id } })
    await prisma.planningPeriod.delete({ where: { id: existing.id } })
  }

  const newPeriod = await prisma.planningPeriod.create({
    data: {
      organizationId,
      locationId,
      weekStart: targetWeekStart,
      weekEnd: targetWeekEnd,
      status: 'DRAFT',
      origin: 'MANUAL',
      version: 1,
      parentId: sourcePeriodId,
      assignments: {
        create: source.assignments.map(a => ({
          employeeId: a.employeeId,
          locationId: a.locationId,
          laborRoleId: a.laborRoleId,
          date: addDays(new Date(a.date), dayDiff),
          startTime: a.startTime,
          endTime: a.endTime,
          breakMinutes: a.breakMinutes,
          origin: 'MANUAL' as const,
          status: 'DRAFT' as const,
          isLocked: false,
          isSplit: a.isSplit,
          normalHours: a.normalHours,
          nightHours: a.nightHours,
          overtimeHours: a.overtimeHours,
        })),
      },
    },
  })

  revalidatePath('/planning')
  return newPeriod
}
