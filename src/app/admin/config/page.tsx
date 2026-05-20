import { requireSuperAdmin } from '@/lib/session'
import { AdminConfigClient } from '@/components/admin/AdminConfigClient'

export default async function AdminConfigPage() {
  await requireSuperAdmin()
  return <AdminConfigClient />
}
