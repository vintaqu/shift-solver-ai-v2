import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'
import { getAnnualData } from '@/server/actions/planningAnnual'
import { AnnualClient } from '@/components/planning/annual/AnnualClient'

export default async function AnnualPage({ params }: { params: { year: string } }) {
  const year = parseInt(params.year)
  if (isNaN(year)) redirect(`/planning/annual/${new Date().getFullYear()}`)

  const ctx = await requireOrgContext()
  const { organizationId, locationId } = ctx

  const data = await getAnnualData(organizationId, locationId, year)

  return (
    <AnnualClient
      data={JSON.parse(JSON.stringify(data))}
      organizationId={organizationId}
      locationId={locationId}
    />
  )
}
