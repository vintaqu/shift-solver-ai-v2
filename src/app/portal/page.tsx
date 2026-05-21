export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { EmployeePortalClient } from '@/components/portal/EmployeePortalClient'
import { addDays, startOfWeek, endOfWeek, startOfDay, format } from 'date-fns'
import { getActiveClockEntry } from '@/server/actions/timeclock'

export default async function PortalPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const employeeId = (session.user as any).employeeId
  if (!employeeId) redirect('/dashboard')

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const nextWeekStart = addDays(weekStart, 7)
  const nextWeekEnd = addDays(weekEnd, 7)

  const today = startOfDay(now)
  const [employee, currentWeekShifts, nextWeekShifts, absences, activeClockEntry] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        contracts: { where: { isActive: true }, take: 1 },
        skills: { include: { skill: true, laborRole: true } },
        organization: { select: { name: true, logoUrl: true, brandColor: true } },
      },
    }),

    // Turnos semana actual
    prisma.scheduleAssignment.findMany({
      where: {
        employeeId,
        date: { gte: weekStart, lte: weekEnd },
        status: { in: ['DRAFT', 'PUBLISHED'] },
      },
      include: { planningPeriod: { select: { status: true, weekStart: true } } },
      orderBy: { date: 'asc' },
    }),

    // Turnos semana siguiente
    prisma.scheduleAssignment.findMany({
      where: {
        employeeId,
        date: { gte: nextWeekStart, lte: nextWeekEnd },
        status: { in: ['DRAFT', 'PUBLISHED'] },
      },
      include: { planningPeriod: { select: { status: true } } },
      orderBy: { date: 'asc' },
    }),

    // Ausencias del año
    prisma.absenceRequest.findMany({
      where: {
        employeeId,
        startDate: { gte: new Date(now.getFullYear(), 0, 1) },
      },
      orderBy: { startDate: 'asc' },
    }),

    // Fichaje activo hoy
    getActiveClockEntry(employeeId),
  ])

  if (!employee) redirect('/login')

  // Turno de hoy para el widget de fichaje
  const todayAssignment = currentWeekShifts.find(s => {
    const d = new Date(s.date)
    return d.toDateString() === now.toDateString()
  }) ?? null

  // Horas del mes
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const monthShifts = await prisma.scheduleAssignment.findMany({
    where: { employeeId, date: { gte: monthStart, lte: monthEnd } },
  })

  function durationH(s: string, e: string, brk = 0) {
    const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    let sm = toM(s), em = toM(e)
    if (em <= sm) em += 24 * 60
    return Math.max(0, (em - sm - brk) / 60)
  }

  const monthHours = monthShifts.reduce((a, s) => a + durationH(s.startTime, s.endTime, s.breakMinutes), 0)
  const weeklyTarget = employee.contracts[0]?.weeklyHours ?? 40

  return (
    <EmployeePortalClient
      employee={JSON.parse(JSON.stringify(employee))}
      currentWeekShifts={JSON.parse(JSON.stringify(currentWeekShifts))}
      nextWeekShifts={JSON.parse(JSON.stringify(nextWeekShifts))}
      absences={JSON.parse(JSON.stringify(absences))}
      monthHours={Math.round(monthHours * 10) / 10}
      monthTarget={Math.round(weeklyTarget * 4.33 * 10) / 10}
      now={now.toISOString()}
      todayAssignment={todayAssignment ? JSON.parse(JSON.stringify(todayAssignment)) : null}
      activeClockEntry={activeClockEntry ? JSON.parse(JSON.stringify(activeClockEntry)) : null}
    />
  )
}
