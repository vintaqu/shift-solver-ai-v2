import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'
import { CoverageClient } from '@/components/coverage/CoverageClient'
import { migrateLegacySlotsToDefault, getTemplatesForLocation } from '@/server/actions/coverageTemplates'

export default async function CoveragePage() {
  const ctx = await requireOrgContext()
  const { organizationId, locationId } = ctx

  // Migrar slots legacy si existen (idempotente)
  await migrateLegacySlotsToDefault(locationId, organizationId)

  const [templates, roles, skills] = await Promise.all([
    getTemplatesForLocation(locationId),
    prisma.laborRole.findMany({
      where: { organizationId },
      orderBy: { priority: 'asc' },
    }),
    prisma.skill.findMany({
      where: { organizationId },
    }),
  ])

  // Determinar plantilla actualmente seleccionada (activa o default)
  const activeTemplate = templates.find(t => t.isActive) ?? templates.find(t => t.isDefault) ?? templates[0]

  // Cargar slots de la plantilla activa
  const slots = activeTemplate ? await prisma.coverageRequirement.findMany({
    where: { templateId: activeTemplate.id },
    include: { laborRole: true, skill: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  }) : []

  return (
    <CoverageClient
      templates={JSON.parse(JSON.stringify(templates))}
      initialTemplateId={activeTemplate?.id ?? null}
      initialSlots={JSON.parse(JSON.stringify(slots))}
      roles={JSON.parse(JSON.stringify(roles))}
      skills={JSON.parse(JSON.stringify(skills))}
      locationId={locationId}
      organizationId={organizationId}
    />
  )
}
