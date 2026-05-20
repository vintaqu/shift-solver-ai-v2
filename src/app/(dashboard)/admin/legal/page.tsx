import { requireSuperAdmin } from '@/lib/session'
import { getLegalFrameworks } from '@/server/actions/legalFrameworks'
import { LegalFrameworksAdmin } from '@/components/admin/LegalFrameworksAdmin'

export default async function AdminLegalPage() {
  await requireSuperAdmin()
  const frameworks = await getLegalFrameworks()

  return (
    <LegalFrameworksAdmin frameworks={JSON.parse(JSON.stringify(frameworks))} />
  )
}
