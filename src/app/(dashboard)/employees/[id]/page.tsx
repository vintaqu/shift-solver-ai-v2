export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'
import { getLegalFrameworks } from '@/server/actions/legalFrameworks'
import { EmployeeDetailClient } from '@/components/employees/EmployeeDetailClient'

export default async function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireOrgContext()

  const emp = await prisma.employee.findUnique({
    where: { id: params.id },
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
    },
  })

  if (!emp) notFound()
  // Verificar que el empleado pertenece a la organización del usuario
  if (emp.organizationId !== ctx.organizationId) notFound()

  const [skills, roles, legalFrameworks] = await Promise.all([
    prisma.skill.findMany({ where: { organizationId: emp.organizationId } }),
    prisma.laborRole.findMany({ where: { organizationId: emp.organizationId }, orderBy: { priority: 'asc' } }),
    getLegalFrameworks(),
  ])

  return (
    <EmployeeDetailClient
      employee={JSON.parse(JSON.stringify(emp))}
      skills={JSON.parse(JSON.stringify(skills))}
      roles={JSON.parse(JSON.stringify(roles))}
      legalFrameworks={JSON.parse(JSON.stringify(legalFrameworks))}
    />
  )
}
