export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { addDays } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'
import { PlannerClientPage } from '@/components/planning/PlannerClientPage'
import { ensureWeekCoverage, getWeekCoverage } from '@/server/actions/coverageWeekly'

export default async function PlanningWeekPage({ params }: { params: { id: string } }) {
  const ctx = await requireOrgContext()

  const period = await prisma.planningPeriod.findUnique({
    where: { id: params.id },
    include: {
      assignments: {
        include: {
          employee: {
            include: {
              contracts: { where: { isActive: true }, take: 1 },
              skills: { include: { skill: true, laborRole: true } },
            },
          },
          laborRole: true,
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      },
      validationIssues: { where: { isResolved: false } },
      location: { include: { coverageRequirements: true } },
    },
  })

  if (!period) notFound()
  // Verificar que el cuadrante pertenece a la organización del usuario
  if (period.organizationId !== ctx.organizationId) notFound()

  // Todos los empleados activos de la org
  const employees = await prisma.employee.findMany({
    where: { organizationId: period.organizationId, isActive: true },
    include: {
      contracts: { where: { isActive: true }, take: 1 },
      skills: { include: { skill: true, laborRole: true } },
    },
    orderBy: [{ displayOrder: 'asc' }, { firstName: 'asc' }] as any,
  })

  // Semanas disponibles para el navegador
  const allPeriods = await prisma.planningPeriod.findMany({
    where: { organizationId: period.organizationId, locationId: period.locationId },
    orderBy: { weekStart: 'desc' },
    take: 10,
    select: { id: true, weekStart: true, weekEnd: true, status: true },
  })

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(new Date(period.weekStart), i))
  const weekStartISO = new Date(period.weekStart).toISOString().slice(0, 10)

  // Cobertura de la semana — hereda automáticamente de la semana anterior o de la plantilla
  await ensureWeekCoverage(period.locationId, period.organizationId, weekStartISO)
  const coverageSlots = await getWeekCoverage(period.locationId, weekStartISO)

  // Roles laborales (para el editor de cobertura inline)
  const laborRoles = await prisma.laborRole.findMany({
    where: { organizationId: period.organizationId },
    orderBy: { priority: 'asc' },
  })

  // Ausencias aprobadas que solapan con esta semana (para avisos en el grid)
  const absences = await prisma.absenceRequest.findMany({
    where: {
      organizationId: period.organizationId,
      status: 'APPROVED',
      startDate: { lte: weekDays[6] },
      endDate: { gte: weekDays[0] },
    },
    select: {
      id: true, employeeId: true, type: true,
      startDate: true, endDate: true,
    },
  })

  return (
    <PlannerClientPage
      period={JSON.parse(JSON.stringify(period))}
      employees={JSON.parse(JSON.stringify(employees))}
      weekDays={weekDays.map(d => d.toISOString())}
      allPeriods={JSON.parse(JSON.stringify(allPeriods))}
      absences={JSON.parse(JSON.stringify(absences))}
      coverageSlots={JSON.parse(JSON.stringify(coverageSlots))}
      weekStartISO={weekStartISO}
      laborRoles={JSON.parse(JSON.stringify(laborRoles))}
    />
  )
}
