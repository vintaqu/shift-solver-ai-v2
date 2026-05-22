export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SidebarNav } from '@/components/shared/SidebarNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role
  if (role === 'SUPER_ADMIN') redirect('/admin')
  if (role === 'EMPLOYEE') redirect('/portal')

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f6fa]">
      <SidebarNav
        user={{
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
        }}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
