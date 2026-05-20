export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireOrgContext } from '@/lib/session'
import { getMonthData } from '@/server/actions/planningMonth'
import { MonthCalendarClient } from '@/components/planning/month/MonthCalendarClient'

interface PageProps {
  params: { year: string; month: string }
}

export default async function MonthPlanningPage({ params }: PageProps) {
  const year = parseInt(params.year)
  const month = parseInt(params.month)

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    const now = new Date()
    redirect(`/planning/month/${now.getFullYear()}/${now.getMonth() + 1}`)
  }

  const ctx = await requireOrgContext()
  const { organizationId, locationId } = ctx

  const data = await getMonthData(organizationId, locationId, year, month)

  return (
    <MonthCalendarClient
      year={year}
      month={month}
      data={JSON.parse(JSON.stringify(data))}
      organizationId={organizationId}
      locationId={locationId}
    />
  )
}
