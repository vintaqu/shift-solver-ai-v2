'use server'

import { prisma } from '@/lib/prisma'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, format, subMonths, getDaysInMonth } from 'date-fns'
import { calcDays } from '@/lib/absenceUtils'

// ── Datos del dashboard ────────────────────────────────────────────────────

export async function getDashboardData(organizationId: string, locationId: string) {
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0)
  const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999)

  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(now, { weekStartsOn: 1 })

  const nextWeekStart = addDays(weekStart, 7)
  const nextWeekEnd   = addDays(weekEnd, 7)

  const monthStart = startOfMonth(now)
  const monthEnd   = endOfMonth(now)
  const prevMonthStart = startOfMonth(subMonths(now, 1))
  const prevMonthEnd   = endOfMonth(subMonths(now, 1))

  const [
    employees,
    todayAssignments,
    tomorrowAssignments,
    currentWeekPeriod,
    nextWeekPeriod,
    monthPeriods,
    prevMonthPeriods,
    pendingAbsences,
    todayAbsences,
    activeAbsences,
    upcomingAbsences,
    openIssues,
    blockingIssues,
    monthAbsences,
    coverageSlots,
    recentAuditLogs,
  ] = await Promise.all([
    // Empleados activos con contratos
    prisma.employee.findMany({
      where: { organizationId, isActive: true },
      include: {
        contracts: { where: { isActive: true }, take: 1 },
        skills: { include: { laborRole: true } },
      },
      orderBy: { firstName: 'asc' },
    }),

    // Turnos de HOY
    prisma.scheduleAssignment.findMany({
      where: {
        planningPeriod: { organizationId },
        date: { gte: todayStart, lte: todayEnd },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, color: true } },
        laborRole: { select: { name: true, color: true } },
      },
      orderBy: { startTime: 'asc' },
    }),

    // Turnos de MAÑANA
    prisma.scheduleAssignment.findMany({
      where: {
        planningPeriod: { organizationId },
        date: { gte: addDays(todayStart, 1), lte: addDays(todayEnd, 1) },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, color: true } },
      },
      orderBy: { startTime: 'asc' },
    }),

    // Cuadrante semana actual
    prisma.planningPeriod.findFirst({
      where: { organizationId, locationId, weekStart: { gte: weekStart }, weekEnd: { lte: weekEnd } },
      include: {
        assignments: true,
        validationIssues: { where: { isResolved: false } },
      },
    }),

    // Cuadrante próxima semana
    prisma.planningPeriod.findFirst({
      where: { organizationId, locationId, weekStart: { gte: nextWeekStart }, weekEnd: { lte: nextWeekEnd } },
      include: { assignments: true, validationIssues: { where: { isResolved: false } } },
    }),

    // Todos los periodos del mes
    prisma.planningPeriod.findMany({
      where: { organizationId, locationId, weekStart: { lte: monthEnd }, weekEnd: { gte: monthStart } },
      include: { assignments: true },
      orderBy: { weekStart: 'asc' },
    }),

    // Mes anterior para comparar
    prisma.planningPeriod.findMany({
      where: { organizationId, locationId, weekStart: { lte: prevMonthEnd }, weekEnd: { gte: prevMonthStart } },
      include: { assignments: true },
    }),

    // Ausencias pendientes
    prisma.absenceRequest.findMany({
      where: { organizationId, status: 'PENDING' },
      include: { employee: { select: { id: true, firstName: true, lastName: true, color: true, vacationDaysType: true } } },
      orderBy: { createdAt: 'asc' },
    }),

    // Ausencias HOY
    prisma.absenceRequest.findMany({
      where: {
        organizationId,
        status: 'APPROVED',
        startDate: { lte: todayEnd },
        endDate: { gte: todayStart },
      },
      include: { employee: { select: { firstName: true, lastName: true, color: true } } },
    }),

    // Ausencias activas (próximos 14 días)
    prisma.absenceRequest.findMany({
      where: {
        organizationId,
        status: 'APPROVED',
        startDate: { lte: addDays(todayEnd, 14) },
        endDate: { gte: todayStart },
      },
      include: { employee: { select: { firstName: true, lastName: true, color: true } } },
      orderBy: { startDate: 'asc' },
    }),

    // Próximas ausencias (siguientes 30 días, aún no empezadas)
    prisma.absenceRequest.findMany({
      where: {
        organizationId,
        status: 'APPROVED',
        startDate: { gt: todayEnd, lte: addDays(todayEnd, 30) },
      },
      include: { employee: { select: { firstName: true, lastName: true, color: true } } },
      orderBy: { startDate: 'asc' },
      take: 6,
    }),

    // Issues abiertas
    prisma.validationIssue.count({
      where: { planningPeriod: { organizationId }, isResolved: false },
    }),

    // Issues bloqueantes
    prisma.validationIssue.count({
      where: {
        planningPeriod: { organizationId },
        isResolved: false,
        severity: { in: ['BLOCKING', 'ERROR'] },
      },
    }),

    // Ausencias del mes para gráfica
    prisma.absenceRequest.findMany({
      where: {
        organizationId,
        startDate: { lte: monthEnd },
        endDate:   { gte: monthStart },
      },
      include: { employee: { select: { vacationDaysType: true } } },
    }),

    // Cobertura por día
    prisma.coverageRequirement.findMany({
      where: { locationId },
    }),

    // Últimas acciones (audit log)
    prisma.auditLog.findMany({
      where: { organizationId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  // ── Calcular métricas derivadas ──────────────────────────────────────────

  function timeToMin(t: string) {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  function durationH(s: string, e: string, breakMin = 0) {
    let sm = timeToMin(s), em = timeToMin(e)
    if (em <= sm) em += 24 * 60
    return Math.max(0, (em - sm - breakMin) / 60)
  }

  // Turnos en curso AHORA
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const workingNow = todayAssignments.filter(a => {
    const start = timeToMin(a.startTime)
    let end = timeToMin(a.endTime)
    if (end <= start) end += 24 * 60
    const checkMin = end > 24*60 && nowMin < start ? nowMin + 24*60 : nowMin
    return checkMin >= start && checkMin < end
  })

  // Próximos turnos en entrar (próximas 6h)
  const nextShifts = todayAssignments
    .filter(a => {
      const start = timeToMin(a.startTime)
      return start > nowMin && start <= nowMin + 360
    })
    .slice(0, 5)

  // Horas planificadas mes actual y anterior
  const monthHours = monthPeriods.reduce((acc, p) =>
    acc + p.assignments.reduce((s, a) => s + durationH(a.startTime, a.endTime, a.breakMinutes), 0), 0
  )
  const prevMonthHours = prevMonthPeriods.reduce((acc, p) =>
    acc + p.assignments.reduce((s, a) => s + durationH(a.startTime, a.endTime, a.breakMinutes), 0), 0
  )

  // Horas nocturnas y extras del mes
  const monthNightHours = monthPeriods.reduce((acc, p) =>
    acc + p.assignments.reduce((s, a) => s + a.nightHours, 0), 0
  )
  const monthOvertimeHours = monthPeriods.reduce((acc, p) =>
    acc + p.assignments.reduce((s, a) => s + a.overtimeHours, 0), 0
  )

  // Coste estimado mes
  const monthCost = monthPeriods.reduce((acc, p) =>
    acc + p.assignments.reduce((s, a) => s + (a.estimatedCost ?? 0), 0), 0
  )

  // Horas planificadas semana actual
  const currentWeekHours = currentWeekPeriod?.assignments.reduce(
    (acc, a) => acc + durationH(a.startTime, a.endTime, a.breakMinutes), 0
  ) ?? 0

  // Horas por empleado mes actual con comparación a contrato
  const empMonthHours: Record<string, number> = {}
  for (const p of monthPeriods) {
    for (const a of p.assignments) {
      empMonthHours[a.employeeId] = (empMonthHours[a.employeeId] ?? 0) +
        durationH(a.startTime, a.endTime, a.breakMinutes)
    }
  }

  const employeesWithStats = employees.map(emp => {
    const contract = emp.contracts[0]
    const monthH = empMonthHours[emp.id] ?? 0
    const targetMonthly = (contract?.weeklyHours ?? 40) * 4.33
    const pct = targetMonthly > 0 ? (monthH / targetMonthly) * 100 : 0
    return {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      color: emp.color,
      role: emp.skills[0]?.laborRole?.name ?? 'Camarero',
      weeklyHours: contract?.weeklyHours ?? 0,
      monthHours: Math.round(monthH * 10) / 10,
      monthTarget: Math.round(targetMonthly * 10) / 10,
      monthPct: Math.round(pct),
      isOver: pct > 105,
      isUnder: pct < 90,
    }
  })

  // Top 5 con más horas extra
  const topOvertime = [...employeesWithStats]
    .filter(e => e.monthHours > e.monthTarget)
    .sort((a, b) => (b.monthHours - b.monthTarget) - (a.monthHours - a.monthTarget))
    .slice(0, 5)

  // Empleados con saldo vacaciones crítico
  const year = now.getFullYear()
  const vacBalances = await Promise.all(employees.map(async emp => {
    const yearAbsences = await prisma.absenceRequest.findMany({
      where: {
        employeeId: emp.id,
        type: 'VACACIONES',
        status: 'APPROVED',
        startDate: { gte: new Date(year, 0, 1) },
        endDate:   { lte: new Date(year, 11, 31) },
      },
    })
    const tipo = (emp.vacationDaysType ?? 'NATURALES') as 'NATURALES' | 'LABORABLES'
    const used = yearAbsences.reduce((acc, a) =>
      acc + calcDays(new Date(a.startDate), new Date(a.endDate), tipo), 0
    )
    const total = emp.vacationDaysPerYear ?? 23
    return {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      color: emp.color,
      used,
      total,
      remaining: total - used,
      pct: total > 0 ? (used / total) * 100 : 0,
    }
  }))

  const criticalVac = vacBalances
    .filter(b => b.remaining <= 5 && b.remaining >= 0)
    .sort((a, b) => a.remaining - b.remaining)

  const overVac = vacBalances.filter(b => b.remaining < 0)

  // Cobertura por día del mes — para gráfica simple
  const daysInMonth = getDaysInMonth(now)
  const monthDailyData: Array<{ day: number; hours: number; workers: number }> = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), d, 0, 0, 0)
    const dayEnd   = new Date(now.getFullYear(), now.getMonth(), d, 23, 59, 59)
    let hours = 0
    const workers = new Set<string>()
    for (const p of monthPeriods) {
      for (const a of p.assignments) {
        const ad = new Date(a.date)
        if (ad >= dayStart && ad <= dayEnd) {
          hours += durationH(a.startTime, a.endTime, a.breakMinutes)
          workers.add(a.employeeId)
        }
      }
    }
    monthDailyData.push({ day: d, hours: Math.round(hours * 10) / 10, workers: workers.size })
  }

  // Estado de las 4 semanas del mes
  const monthWeeksStatus = monthPeriods.map(p => ({
    id: p.id,
    weekStart: p.weekStart.toISOString(),
    weekEnd: p.weekEnd.toISOString(),
    status: p.status,
    assignmentsCount: p.assignments.length,
    totalHours: Math.round(p.assignments.reduce((s, a) =>
      s + durationH(a.startTime, a.endTime, a.breakMinutes), 0) * 10) / 10,
  }))

  return {
    employees: employeesWithStats,
    now: now.toISOString(),

    // HOY
    today: {
      totalShifts: todayAssignments.length,
      workingNow: workingNow.map(a => ({
        id: a.id, employeeId: a.employee.id,
        firstName: a.employee.firstName, lastName: a.employee.lastName, color: a.employee.color,
        startTime: a.startTime, endTime: a.endTime, role: a.laborRole?.name ?? null,
      })),
      nextShifts: nextShifts.map(a => ({
        id: a.id, employeeId: a.employee.id,
        firstName: a.employee.firstName, lastName: a.employee.lastName, color: a.employee.color,
        startTime: a.startTime, endTime: a.endTime,
      })),
      absent: todayAbsences.map(a => ({
        firstName: a.employee.firstName, lastName: a.employee.lastName, color: a.employee.color,
        type: a.type,
      })),
      tomorrowCount: tomorrowAssignments.length,
    },

    // Semana actual y próxima
    currentWeek: currentWeekPeriod ? {
      id: currentWeekPeriod.id,
      status: currentWeekPeriod.status,
      assignmentsCount: currentWeekPeriod.assignments.length,
      hours: Math.round(currentWeekHours * 10) / 10,
      issues: currentWeekPeriod.validationIssues.length,
      weekStart: currentWeekPeriod.weekStart.toISOString(),
      weekEnd: currentWeekPeriod.weekEnd.toISOString(),
    } : null,

    nextWeek: nextWeekPeriod ? {
      id: nextWeekPeriod.id,
      status: nextWeekPeriod.status,
      assignmentsCount: nextWeekPeriod.assignments.length,
      issues: nextWeekPeriod.validationIssues.length,
      weekStart: nextWeekPeriod.weekStart.toISOString(),
      weekEnd: nextWeekPeriod.weekEnd.toISOString(),
    } : null,

    // Mes
    month: {
      hours: Math.round(monthHours * 10) / 10,
      hoursPrevMonth: Math.round(prevMonthHours * 10) / 10,
      hoursChangePct: prevMonthHours > 0 ? Math.round(((monthHours - prevMonthHours) / prevMonthHours) * 100) : 0,
      nightHours: Math.round(monthNightHours * 10) / 10,
      overtimeHours: Math.round(monthOvertimeHours * 10) / 10,
      cost: Math.round(monthCost * 100) / 100,
      weeks: monthWeeksStatus,
      daily: monthDailyData,
      absencesCount: monthAbsences.length,
    },

    // Acción inmediata
    actions: {
      pendingAbsences: pendingAbsences.length,
      pendingAbsencesList: pendingAbsences.slice(0, 5).map(a => ({
        id: a.id,
        firstName: a.employee.firstName,
        lastName: a.employee.lastName,
        color: a.employee.color,
        type: a.type,
        startDate: a.startDate.toISOString(),
        endDate: a.endDate.toISOString(),
        totalDays: a.totalDays,
        comment: a.comment,
        createdAt: a.createdAt.toISOString(),
      })),
      openIssues,
      blockingIssues,
    },

    // Ausencias activas/próximas
    absences: {
      active: activeAbsences.map(a => ({
        id: a.id,
        firstName: a.employee.firstName,
        lastName: a.employee.lastName,
        color: a.employee.color,
        type: a.type,
        startDate: a.startDate.toISOString(),
        endDate: a.endDate.toISOString(),
      })),
      upcoming: upcomingAbsences.map(a => ({
        id: a.id,
        firstName: a.employee.firstName,
        lastName: a.employee.lastName,
        color: a.employee.color,
        type: a.type,
        startDate: a.startDate.toISOString(),
        endDate: a.endDate.toISOString(),
      })),
    },

    // Top horas extra
    topOvertime,

    // Vacaciones críticas
    vacationAlerts: {
      critical: criticalVac,
      over: overVac,
    },

    // Actividad reciente
    recentActivity: recentAuditLogs.map(log => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      userName: log.user?.name ?? log.user?.email ?? 'Sistema',
      createdAt: log.createdAt.toISOString(),
    })),
  }
}
