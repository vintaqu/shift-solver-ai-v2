export const dynamic = 'force-dynamic'

import { requireSuperAdmin } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { AdminOrgsClient } from '@/components/admin/AdminOrgsClient'

export default async function AdminOrgsPage() {
  await requireSuperAdmin()

  const organizations = await prisma.organization.findMany({
    include: {
      locations: { take: 1 },
      members: { include: { user: { select: { name: true, email: true, role: true, isActive: true } } } },
      _count: { select: { employees: true, members: true, locations: true } },
      legalFrameworks: { include: { legalFramework: { select: { name: true, code: true } } }, where: { isDefault: true }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  })

  return <AdminOrgsClient organizations={JSON.parse(JSON.stringify(organizations))} />
}
