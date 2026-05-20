export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

export default function PlanningIndexPage() {
  const now = new Date()
  redirect(`/planning/month/${now.getFullYear()}/${now.getMonth() + 1}`)
}
