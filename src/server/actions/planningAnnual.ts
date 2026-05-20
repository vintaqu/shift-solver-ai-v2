'use server'

import { prisma } from '@/lib/prisma'
import { addDays, startOfYear, endOfYear, startOfMonth, endOfMonth, format } from 'date-fns'
import { calcDays } from '@/lib/absenceUtils'

const MONTHS_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ── Datos anuales completos ────────────────────────────────────────────────
export async function getAnnualData(organizationId: string, locationId: string, year: number) {
  const yearStart = startOfYear(new Date(year, 0, 1))
  const yearEnd   = endOfYear(new Date(year, 11, 31))
  const prevYearStart = startOfYear(new Date(year - 1, 0, 1))
  const prevYearEnd   = endOfYear(new Date(year - 1, 11, 31))

  const [
    employees,
    yearPeriods,
    prevYearPeriods,
    yearAbsences,
    coverageSlots,
  ] = await Promise.all([
    // Empleados con contratos
    prisma.employee.findMany({
      where: { organizationId },
      include: {
        contracts: { where: { isActive: true }, take: 1 },
        skills: { include: { laborRole: true } },
      },
      orderBy: { firstName: 'asc' },
    }),

    // Cuadrantes año actual
    prisma.planningPeriod.findMany({
      where: {
        organizationId,
        locationId,
        weekStart: { lte: yearEnd },
        weekEnd:   { gte: yearStart },
      },
      include: { assignments: true },
    }),

    // Cuadrantes año anterior (para comparativa)
    prisma.planningPeriod.findMany({
      where: {
        organizationId,
        locationId,
        weekStart: { lte: prevYearEnd },
        weekEnd:   { gte: prevYearStart },
      },
      include: { assignments: true },
    }),

    // Todas las ausencias del año
    prisma.absenceRequest.findMany({
      where: {
        organizationId,
        startDate: { lte: yearEnd },
        endDate:   { gte: yearStart },
      },
      include: { employee: { select: { firstName: true, lastName: true, color: true, vacationDaysType: true, vacationDaysPerYear: true } } },
    }),

    prisma.coverageRequirement.findMany({
      where: { locationId },
    }),
  ])

  function timeToMin(t: string) {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  function durationH(s: string, e: string, breakMin = 0) {
    let sm = timeToMin(s), em = timeToMin(e)
    if (em <= sm) em += 24 * 60
    return Math.max(0, (em - sm - breakMin) / 60)
  }

  // ── Métricas por mes ─────────────────────────────────────────────────────
  const monthlyData = Array.from({ length: 12 }, (_, m) => {
    const mStart = startOfMonth(new Date(year, m, 1))
    const mEnd   = endOfMonth(mStart)

    let hours = 0, nightHours = 0, overtimeHours = 0, cost = 0
    const shiftsCount = { total: 0, continuous: 0, split: 0 }
    const employeesInMonth = new Set<string>()

    for (const p of yearPeriods) {
      for (const a of p.assignments) {
        const d = new Date(a.date)
        if (d >= mStart && d <= mEnd) {
          hours += durationH(a.startTime, a.endTime, a.breakMinutes)
          nightHours += a.nightHours
          overtimeHours += a.overtimeHours
          cost += a.estimatedCost ?? 0
          shiftsCount.total++
          if (a.isSplit) shiftsCount.split++
          else shiftsCount.continuous++
          employeesInMonth.add(a.employeeId)
        }
      }
    }

    // Ausencias que tocan el mes
    const monthAbsences = yearAbsences.filter(a => {
      const aStart = new Date(a.startDate)
      const aEnd   = new Date(a.endDate)
      return aStart <= mEnd && aEnd >= mStart && a.status === 'APPROVED'
    })

    return {
      monthIdx: m,
      label: MONTHS_LABELS[m],
      hours: Math.round(hours * 10) / 10,
      nightHours: Math.round(nightHours * 10) / 10,
      overtimeHours: Math.round(overtimeHours * 10) / 10,
      cost: Math.round(cost * 100) / 100,
      shiftsTotal: shiftsCount.total,
      shiftsContinuous: shiftsCount.continuous,
      shiftsSplit: shiftsCount.split,
      employeesActive: employeesInMonth.size,
      absencesCount: monthAbsences.length,
    }
  })

  // Mes pasado año anterior — para comparativa global
  const prevMonthly = Array.from({ length: 12 }, (_, m) => {
    const mStart = startOfMonth(new Date(year - 1, m, 1))
    const mEnd   = endOfMonth(mStart)
    let hours = 0
    for (const p of prevYearPeriods) {
      for (const a of p.assignments) {
        const d = new Date(a.date)
        if (d >= mStart && d <= mEnd) {
          hours += durationH(a.startTime, a.endTime, a.breakMinutes)
        }
      }
    }
    return { monthIdx: m, hours: Math.round(hours * 10) / 10 }
  })

  // ── Totales anuales ──────────────────────────────────────────────────────
  const yearTotals = {
    hours: Math.round(monthlyData.reduce((a, m) => a + m.hours, 0) * 10) / 10,
    nightHours: Math.round(monthlyData.reduce((a, m) => a + m.nightHours, 0) * 10) / 10,
    overtimeHours: Math.round(monthlyData.reduce((a, m) => a + m.overtimeHours, 0) * 10) / 10,
    cost: Math.round(monthlyData.reduce((a, m) => a + m.cost, 0) * 100) / 100,
    shifts: monthlyData.reduce((a, m) => a + m.shiftsTotal, 0),
    continuous: monthlyData.reduce((a, m) => a + m.shiftsContinuous, 0),
    split: monthlyData.reduce((a, m) => a + m.shiftsSplit, 0),
    absences: yearAbsences.length,
    approvedAbsences: yearAbsences.filter(a => a.status === 'APPROVED').length,
    daysAbsenceTotal: yearAbsences.filter(a => a.status === 'APPROVED').reduce((acc, a) => {
      const tipo = (a.employee.vacationDaysType ?? 'NATURALES') as 'NATURALES' | 'LABORABLES'
      return acc + calcDays(new Date(a.startDate), new Date(a.endDate), tipo)
    }, 0),
  }

  const prevYearTotal = Math.round(prevMonthly.reduce((a, m) => a + m.hours, 0) * 10) / 10
  const yearChangePct = prevYearTotal > 0
    ? Math.round(((yearTotals.hours - prevYearTotal) / prevYearTotal) * 100)
    : 0

  // ── Cumplimiento por empleado ─────────────────────────────────────────────
  const employeesAnnual = await Promise.all(employees.map(async emp => {
    const contract = emp.contracts[0]
    const targetAnnual = contract?.annualMaxHours ?? 1791
    const targetWeekly = contract?.weeklyHours ?? 40
    const targetMonthly = targetWeekly * 4.33
    const maxOvertimeYear = 80  // Estatuto Trabajadores

    // Horas por mes de este empleado
    const empMonthly = Array.from({ length: 12 }, (_, m) => {
      const mStart = startOfMonth(new Date(year, m, 1))
      const mEnd   = endOfMonth(mStart)
      let hrs = 0, nightH = 0, otH = 0, shifts = 0
      for (const p of yearPeriods) {
        for (const a of p.assignments) {
          if (a.employeeId !== emp.id) continue
          const d = new Date(a.date)
          if (d >= mStart && d <= mEnd) {
            hrs += durationH(a.startTime, a.endTime, a.breakMinutes)
            nightH += a.nightHours
            otH += a.overtimeHours
            shifts++
          }
        }
      }
      return {
        monthIdx: m,
        label: MONTHS_LABELS[m],
        hours: Math.round(hrs * 10) / 10,
        target: Math.round(targetMonthly * 10) / 10,
        nightHours: Math.round(nightH * 10) / 10,
        overtimeHours: Math.round(otH * 10) / 10,
        shifts,
        pct: Math.round((hrs / targetMonthly) * 100),
      }
    })

    // Totales anuales empleado
    const totalHours = empMonthly.reduce((a, m) => a + m.hours, 0)
    const totalOvertime = empMonthly.reduce((a, m) => a + m.overtimeHours, 0)
    const totalNight = empMonthly.reduce((a, m) => a + m.nightHours, 0)
    const totalShifts = empMonthly.reduce((a, m) => a + m.shifts, 0)
    const totalSplit = yearPeriods.reduce((acc, p) =>
      acc + p.assignments.filter(a => a.employeeId === emp.id && a.isSplit).length, 0)
    const totalCost = yearPeriods.reduce((acc, p) =>
      acc + p.assignments.filter(a => a.employeeId === emp.id).reduce((s, a) => s + (a.estimatedCost ?? 0), 0), 0)

    const pctHours = (totalHours / targetAnnual) * 100
    const pctOvertime = (totalOvertime / maxOvertimeYear) * 100

    // Vacaciones empleado
    const tipo = (emp.vacationDaysType ?? 'NATURALES') as 'NATURALES' | 'LABORABLES'
    const empVacationsApproved = yearAbsences.filter(a =>
      a.employeeId === emp.id && a.type === 'VACACIONES' && a.status === 'APPROVED'
    )
    const empVacationsPending = yearAbsences.filter(a =>
      a.employeeId === emp.id && a.type === 'VACACIONES' && a.status === 'PENDING'
    )
    const empVacationsTaken = empVacationsApproved
      .filter(a => new Date(a.endDate) <= new Date())
      .reduce((acc, a) => acc + calcDays(new Date(a.startDate), new Date(a.endDate), tipo), 0)
    const empVacationsScheduled = empVacationsApproved
      .filter(a => new Date(a.startDate) > new Date())
      .reduce((acc, a) => acc + calcDays(new Date(a.startDate), new Date(a.endDate), tipo), 0)
    const empVacationsPendingDays = empVacationsPending.reduce((acc, a) =>
      acc + calcDays(new Date(a.startDate), new Date(a.endDate), tipo), 0)
    const vacationTotal = emp.vacationDaysPerYear ?? 23
    const vacationUsed = empVacationsTaken + empVacationsScheduled
    const vacationRemaining = vacationTotal - vacationUsed

    // Otras ausencias
    const empOtherAbsences = yearAbsences.filter(a =>
      a.employeeId === emp.id && a.type !== 'VACACIONES' && a.status === 'APPROVED'
    )
    const empOtherAbsencesDays = empOtherAbsences.reduce((acc, a) =>
      acc + calcDays(new Date(a.startDate), new Date(a.endDate), 'NATURALES'), 0)

    // Risk level — semáforo
    let riskLevel: 'green' | 'amber' | 'red' = 'green'
    let riskReason = 'Todo en orden'

    if (totalHours > targetAnnual) {
      riskLevel = 'red'
      riskReason = `Excede ${Math.round(totalHours - targetAnnual)}h del máximo anual`
    } else if (totalOvertime > maxOvertimeYear) {
      riskLevel = 'red'
      riskReason = `Excede ${Math.round(totalOvertime - maxOvertimeYear)}h del máximo de horas extra (80h/año)`
    } else if (vacationRemaining < 0) {
      riskLevel = 'red'
      riskReason = `Exceso de ${Math.abs(vacationRemaining)} días de vacaciones`
    } else if (pctHours > 95) {
      riskLevel = 'amber'
      riskReason = `Al ${Math.round(pctHours)}% del cómputo anual — cerca del límite`
    } else if (pctOvertime > 75) {
      riskLevel = 'amber'
      riskReason = `${Math.round(totalOvertime)}h extras acumuladas (75% del límite anual)`
    } else if (vacationRemaining <= 5 && vacationRemaining >= 0) {
      riskLevel = 'amber'
      riskReason = `Solo ${vacationRemaining} días de vacaciones restantes`
    }

    // Proyección a fin de año (lineal simple)
    const now = new Date()
    const isCurrentYear = year === now.getFullYear()
    let projectedHours: number | null = null
    if (isCurrentYear) {
      const dayOfYear = Math.ceil((now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24))
      const totalDays = 365
      if (dayOfYear > 30) {
        projectedHours = Math.round((totalHours / dayOfYear) * totalDays)
      }
    }

    return {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      color: emp.color,
      role: emp.skills[0]?.laborRole?.name ?? 'Camarero',
      contractType: contract?.contractType ?? 'FULL_TIME',
      weeklyHours: targetWeekly,
      isActive: emp.isActive,
      // Horas
      totalHours: Math.round(totalHours * 10) / 10,
      targetHours: targetAnnual,
      pctHours: Math.round(pctHours),
      projectedHours,
      // Horas extra
      totalOvertime: Math.round(totalOvertime * 10) / 10,
      maxOvertime: maxOvertimeYear,
      pctOvertime: Math.round(pctOvertime),
      // Nocturnas
      totalNight: Math.round(totalNight * 10) / 10,
      // Turnos
      totalShifts,
      totalSplit,
      pctSplit: totalShifts > 0 ? Math.round((totalSplit / totalShifts) * 100) : 0,
      // Coste
      totalCost: Math.round(totalCost * 100) / 100,
      // Vacaciones
      vacationType: tipo,
      vacationTotal,
      vacationTaken: empVacationsTaken,
      vacationScheduled: empVacationsScheduled,
      vacationUsed,
      vacationRemaining,
      vacationPending: empVacationsPendingDays,
      // Otras ausencias
      otherAbsencesCount: empOtherAbsences.length,
      otherAbsencesDays: empOtherAbsencesDays,
      // Riesgo
      riskLevel,
      riskReason,
      // Monthly detail
      monthly: empMonthly,
    }
  }))

  // Ordenar: riesgo rojo primero, luego amber, luego verde
  const riskOrder = { red: 0, amber: 1, green: 2 }
  employeesAnnual.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel])

  // Cobertura media (slots cubiertos / slots demandados por semana)
  const coverageStats = {
    avgWeeklyCoverage: 0,
    weeksAnalyzed: yearPeriods.length,
  }

  return {
    year,
    employees: employeesAnnual,
    monthly: monthlyData,
    prevMonthly,
    yearTotals,
    prevYearTotal,
    yearChangePct,
    coverageStats,
    isCurrentYear: year === new Date().getFullYear(),
  }
}
