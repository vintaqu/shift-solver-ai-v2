export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { EmployeePinLoginClient } from '@/components/auth/EmployeePinLoginClient'

export default async function RestaurantLoginPage({ params }: { params: { slug: string } }) {
  const org = await prisma.organization.findUnique({
    where: { slug: params.slug },
    select: {
      id: true, name: true, logoUrl: true,
      brandColor: true, loginMessage: true, description: true,
    },
  })

  if (!org) notFound()

  // Empleados activos con PIN configurado
  const employees = await prisma.employee.findMany({
    where: { organizationId: org.id, isActive: true, pin: { not: null } },
    select: { id: true, firstName: true, lastName: true, color: true },
    orderBy: { firstName: 'asc' },
  })

  return (
    <EmployeePinLoginClient
      organization={JSON.parse(JSON.stringify(org))}
      employees={JSON.parse(JSON.stringify(employees))}
      slug={params.slug}
    />
  )
}
