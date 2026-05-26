export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { TopNav } from '@/components/layout/TopNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role
  if (role === 'SUPER_ADMIN') redirect('/admin')
  if (role === 'EMPLOYEE') redirect('/portal')

  // Obtener nombre de la organización para el TopNav
  let orgName: string | null = null
  if (session.user.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { name: true },
    })
    orgName = org?.name ?? null
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f5f6fa]">
      <TopNav
        user={{
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
          organizationId: session.user.organizationId,
        }}
        orgName={orgName}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
