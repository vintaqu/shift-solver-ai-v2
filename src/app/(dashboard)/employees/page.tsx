export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'
import { EmployeeListClient } from '@/components/employees/EmployeeListClient'

export default async function EmployeesPage() {
  const ctx = await requireOrgContext()
  const { organizationId, locationId } = ctx

  const [employees, skills, roles] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId },
      include: {
        contracts: { where: { isActive: true }, take: 1 },
        skills: { include: { skill: true, laborRole: true } },
        _count: { select: { assignments: true, absences: true } },
      },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
    }),
    prisma.skill.findMany({ where: { organizationId } }),
    prisma.laborRole.findMany({ where: { organizationId }, orderBy: { priority: 'asc' } }),
  ])

  return (
    <EmployeeListClient
      employees={JSON.parse(JSON.stringify(employees))}
      skills={JSON.parse(JSON.stringify(skills))}
      roles={JSON.parse(JSON.stringify(roles))}
      organizationId={organizationId}
      locationId={locationId}
    />
  )
}
