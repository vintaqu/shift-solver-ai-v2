import { requireSuperAdmin } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { AdminUsersClient } from '@/components/admin/AdminUsersClient'

export default async function AdminUsersPage() {
  await requireSuperAdmin()

  const users = await prisma.user.findMany({
    include: {
      memberships: {
        include: { organization: { select: { id: true, name: true, slug: true } } },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return <AdminUsersClient users={JSON.parse(JSON.stringify(users))} />
}
