import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SidebarNav } from '@/components/shared/SidebarNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')
  if (session.user.role === 'EMPLOYEE') redirect('/portal')

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
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
