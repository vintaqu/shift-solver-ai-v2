export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'
import { AbsencesClient } from '@/components/absences/AbsencesClient'

export default async function AbsencesPage() {
  const ctx = await requireOrgContext()
  const { organizationId } = ctx

  const [absences, employees] = await Promise.all([
    prisma.absenceRequest.findMany({
      where: { organizationId },
      include: {
        employee: {
          select: {
            id: true, firstName: true, lastName: true, color: true,
            vacationDaysType: true, vacationDaysPerYear: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }],
    }),
    prisma.employee.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true, firstName: true, lastName: true, color: true,
        vacationDaysType: true, vacationDaysPerYear: true,
      },
      orderBy: { firstName: 'asc' },
    }),
  ])

  return (
    <AbsencesClient
      absences={JSON.parse(JSON.stringify(absences))}
      employees={JSON.parse(JSON.stringify(employees))}
      organizationId={organizationId}
    />
  )
}
