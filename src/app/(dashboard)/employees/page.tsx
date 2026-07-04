export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'
import { getLegalFrameworks } from '@/server/actions/legalFrameworks'
import { EmployeesSplitClient } from '@/components/employees/EmployeesSplitClient'

export default async function EmployeesPage() {
  const ctx = await requireOrgContext()
  const { organizationId } = ctx

  const [employees, skills, roles, legalFrameworks] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId },
      include: {
        contracts: { orderBy: { startDate: 'desc' } },
        skills: { include: { skill: true, laborRole: true } },
        availabilities: { orderBy: { dayOfWeek: 'asc' } },
        absences: { orderBy: { startDate: 'desc' }, take: 10 },
        assignments: {
          where: { date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          include: { planningPeriod: true },
          orderBy: { date: 'desc' },
          take: 20,
        },
        _count: { select: { assignments: true, absences: true } },
      },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }] as any,
    }),
    prisma.skill.findMany({ where: { organizationId } }),
    prisma.laborRole.findMany({ where: { organizationId }, orderBy: { priority: 'asc' } }),
    getLegalFrameworks(),
  ])

  return (
    <EmployeesSplitClient
      employees={JSON.parse(JSON.stringify(employees))}
      skills={JSON.parse(JSON.stringify(skills))}
      roles={JSON.parse(JSON.stringify(roles))}
      legalFrameworks={JSON.parse(JSON.stringify(legalFrameworks))}
      organizationId={organizationId}
    />
  )
}
