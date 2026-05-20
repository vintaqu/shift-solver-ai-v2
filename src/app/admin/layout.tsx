import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0a12' }}>
      <AdminSidebar user={{ name: session.user.name, email: session.user.email }} />
      <main className="flex-1 overflow-auto bg-[#f5f6fa]">
        {children}
      </main>
    </div>
  )
}
