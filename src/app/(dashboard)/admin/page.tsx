import { requireSuperAdmin } from '@/lib/session'
import { getAllOrganizations } from '@/server/actions/onboarding'
import { AdminClient } from '@/components/admin/AdminClient'

export default async function AdminPage() {
  await requireSuperAdmin()
  const organizations = await getAllOrganizations()

  return (
    <AdminClient organizations={JSON.parse(JSON.stringify(organizations))} />
  )
}
