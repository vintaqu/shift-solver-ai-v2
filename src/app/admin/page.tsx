export const dynamic = 'force-dynamic'

import { requireSuperAdmin } from '@/lib/session'
import { getAdminDashboardData } from '@/server/actions/adminDashboard'
import { AdminDashboardClient } from '@/components/admin/AdminDashboardClient'

export default async function AdminDashboardPage() {
  await requireSuperAdmin()
  const data = await getAdminDashboardData()

  return <AdminDashboardClient data={JSON.parse(JSON.stringify(data))} />
}
