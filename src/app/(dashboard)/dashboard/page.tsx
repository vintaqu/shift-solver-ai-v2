export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getDashboardData } from '@/server/actions/dashboard'
import { DashboardClient } from '@/components/dashboard/DashboardClient'
import Link from 'next/link'

export default async function DashboardPage() {
  const location = await prisma.location.findFirst({
    include: { organization: true },
  })

  if (!location) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Bienvenido a Shift Solver AI</h2>
          <p className="text-gray-500 mb-4">Crea tu primera organización para empezar</p>
          <Link href="/settings" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            Crear organización
          </Link>
        </div>
      </div>
    )
  }

  const data = await getDashboardData(location.organizationId, location.id)

  return (
    <DashboardClient
      data={JSON.parse(JSON.stringify(data))}
      organizationName={location.organization.name}
      locationName={location.name}
    />
  )
}
