export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'
import { ensureWeekCoverage, getWeekCoverage } from '@/server/actions/coverageWeekly'
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

  // Garantiza que la semana tiene cobertura (hereda de la anterior o de la plantilla)
  const inheritance = await ensureWeekCoverage(locationId, organizationId, weekStartISO)

  const [slots, roles, skills, activeTemplate] = await Promise.all([
    getWeekCoverage(locationId, weekStartISO),
    prisma.laborRole.findMany({ where: { organizationId }, orderBy: { priority: 'asc' } }),
    prisma.skill.findMany({ where: { organizationId } }),
    prisma.coverageTemplate.findFirst({ where: { locationId, isActive: true } }),
  ])

  return (
    <CoverageWeeklyClient
      weekStartISO={weekStartISO}
      slots={JSON.parse(JSON.stringify(slots))}
      roles={JSON.parse(JSON.stringify(roles))}
      skills={JSON.parse(JSON.stringify(skills))}
      locationId={locationId}
      organizationId={organizationId}
      inheritance={inheritance}
      activeTemplateName={activeTemplate?.name ?? null}
    />
  )
}
