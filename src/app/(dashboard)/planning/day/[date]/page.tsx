export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'
import { ensureWeekCoverage, getWeekCoverage } from '@/server/actions/coverageWeekly'
import { DayPlannerClient } from '@/components/planning/day/DayPlannerClient'

// Lunes de la semana que contiene la fecha (UTC)
function mondayOf(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - day)
  return monday
}

export default async function DayPlanningPage({ params }: { params: { date: string } }) {
  const ctx = await requireOrgContext()
  const { organizationId, locationId } = ctx

  // Normalizar fecha (YYYY-MM-DD)
  const dateObj = new Date(params.date + 'T00:00:00Z')
  if (isNaN(dateObj.getTime())) {
    return <div className="p-8 text-gray-500">Fecha no válida.</div>
  }
  const dateISO = dateObj.toISOString().slice(0, 10)
  const weekStart = mondayOf(dateObj)
  const weekStartISO = weekStart.toISOString().slice(0, 10)
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)

  // Periodo de planificación que contiene esta fecha (si existe)
  const period = await prisma.planningPeriod.findFirst({
    where: {
      organizationId,
      locationId,
      weekStart: { lte: dateObj },
      weekEnd: { gte: dateObj },
    },
    include: {
      assignments: {
        include: { employee: true },
      },
    },
  })

  // Turnos SOLO de esta fecha
  const dayAssignments = (period?.assignments ?? []).filter((a: any) => {
    const aDate = new Date(a.date).toISOString().slice(0, 10)
    return aDate === dateISO
  })

  // Empleados activos (mismo orden que el planificador semanal)
  const employees = await prisma.employee.findMany({
    where: { organizationId, isActive: true },
    include: {
      contracts: { where: { isActive: true }, take: 1 },
      skills: { include: { skill: true, laborRole: true } },
    },
    orderBy: [{ displayOrder: 'asc' }, { firstName: 'asc' }] as any,
  })

  // Roles laborales (para el editor de cobertura)
  const laborRoles = await prisma.laborRole.findMany({
    where: { organizationId },
    orderBy: { priority: 'asc' },
  })

  // Cobertura de la fecha — garantizando herencia semanal
  await ensureWeekCoverage(locationId, organizationId, weekStartISO)
  const weekCoverage = await getWeekCoverage(locationId, weekStartISO)
  const dayCoverage = weekCoverage.filter((s: any) =>
    new Date(s.date).toISOString().slice(0, 10) === dateISO
  )

  return (
    <DayPlannerClient
      dateISO={dateISO}
      periodId={period?.id ?? null}
      periodStatus={period?.status ?? null}
      assignments={JSON.parse(JSON.stringify(dayAssignments))}
      employees={JSON.parse(JSON.stringify(employees))}
      coverageSlots={JSON.parse(JSON.stringify(dayCoverage))}
      locationId={locationId}
      organizationId={organizationId}
      laborRoles={JSON.parse(JSON.stringify(laborRoles))}
    />
  )
}
