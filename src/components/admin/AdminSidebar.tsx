'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard, Building2, Users, Scale,
  Settings, LogOut, Sparkles, Shield, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/admin',               label: 'Dashboard',       icon: LayoutDashboard, exact: true },
  { href: '/admin/organizations', label: 'Organizaciones',  icon: Building2 },
  { href: '/admin/users',         label: 'Usuarios',        icon: Users },
  { href: '/admin/legal',         label: 'Marcos legales',  icon: Scale },
  { href: '/admin/config',        label: 'Configuración',   icon: Settings },
]

export function AdminSidebar({ user }: { user: { name?: string | null; email?: string | null } }) {
  const pathname = usePathname()

  return (
    <aside className="w-[220px] min-w-[220px] flex flex-col h-full border-r border-white/5"
      style={{ background: '#0d0d1a' }}>

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-[56px] border-b border-white/5 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <Sparkles size={14} className="text-white" />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-white tracking-tight leading-none">Shift Solver</div>
          <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">Super Admin</div>
        </div>
      </div>

      {/* Badge SA */}
      <div className="mx-4 mt-4 mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
        <Shield size={12} className="text-red-400 flex-shrink-0" />
        <span className="text-[11px] font-semibold text-red-400">Acceso total · Super Admin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link key={href} href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all group',
                active
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5'
              )}>
              <Icon size={15} className={active ? 'text-indigo-400' : 'text-white/30 group-hover:text-white/60'} />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight size={12} className="text-indigo-400" />}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/5 p-3 flex-shrink-0">
        <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
            {(user.name ?? 'S').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-white/80 truncate">{user.name ?? 'Super Admin'}</div>
            <div className="text-[10px] text-white/30 truncate">{user.email}</div>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          <LogOut size={13} /> Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
