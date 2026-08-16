export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'
import { getWeekCoverage } from '@/server/actions/coverageWeekly'
import { CoverageWeeklyClient } from '@/components/coverage/CoverageWeeklyClient'

// Lunes de la semana ISO que contiene `d`
function mondayOf(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7 // 0=Lun ... 6=Dom
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - day)
  return monday
}

export default async function CoveragePage({ searchParams }: { searchParams: { week?: string } }) {
  const ctx = await requireOrgContext()
  const { organizationId, locationId } = ctx

  const weekStart = searchParams.week
    ? mondayOf(new Date(searchParams.week + 'T00:00:00Z'))
    : mondayOf(new Date())
  const weekStartISO = weekStart.toISOString().slice(0, 10)

  // Modelo "lienzo en blanco": cada semana parte vacía; el usuario pinta a mano.
  const [slots, roles, skills, staff] = await Promise.all([
    getWeekCoverage(locationId, weekStartISO),
    prisma.laborRole.findMany({ where: { organizationId }, orderBy: { priority: 'asc' } }),
    prisma.skill.findMany({ where: { organizationId } }),
    // Plantilla activa + contrato vigente — alimenta el KPI de capacidad semanal.
    prisma.employee.findMany({
      where: { organizationId, status: 'ACTIVE' as any },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        contracts: {
          where: { isActive: true },
          take: 1,
          select: { weeklyHours: true, minWeeklyHours: true, maxWeeklyHours: true },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { firstName: 'asc' }] as any,
    }),
  ])

  return (
    <CoverageWeeklyClient
      weekStartISO={weekStartISO}
      slots={JSON.parse(JSON.stringify(slots))}
      roles={JSON.parse(JSON.stringify(roles))}
      skills={JSON.parse(JSON.stringify(skills))}
      staff={JSON.parse(JSON.stringify(staff))}
      locationId={locationId}
      organizationId={organizationId}
    />
  )
}
