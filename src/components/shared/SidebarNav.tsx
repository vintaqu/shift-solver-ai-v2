'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CalendarDays, Users, ClipboardList,
  UserX, Settings, LogOut, Sparkles, BarChart2, Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from 'next-auth/react'

// Items visibles por rol
const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Dashboard',    icon: LayoutDashboard, roles: ['SUPER_ADMIN','ORG_OWNER','MANAGER'] },
  { href: '/planning',   label: 'Planificador', icon: CalendarDays,    roles: ['SUPER_ADMIN','ORG_OWNER','MANAGER'] },
  { href: '/employees',  label: 'Empleados',    icon: Users,           roles: ['SUPER_ADMIN','ORG_OWNER','MANAGER'] },
  { href: '/coverage',   label: 'Cobertura',    icon: ClipboardList,   roles: ['SUPER_ADMIN','ORG_OWNER','MANAGER'] },
  { href: '/absences',   label: 'Ausencias',    icon: UserX,           roles: ['SUPER_ADMIN','ORG_OWNER','MANAGER'] },
  { href: '/reports',    label: 'Informes',     icon: BarChart2,       roles: ['SUPER_ADMIN','ORG_OWNER','MANAGER'] },
  { href: '/settings',   label: 'Ajustes',      icon: Settings,        roles: ['SUPER_ADMIN','ORG_OWNER'] },
  { href: '/admin',      label: 'Super Admin',  icon: Shield,          roles: ['SUPER_ADMIN'] },
]

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ORG_OWNER:   'Propietario',
  MANAGER:     'Manager',
  EMPLOYEE:    'Empleado',
}

interface Props {
  user: {
    name?: string | null
    email?: string | null
    role?: string | null
    image?: string | null
  }
}

export function SidebarNav({ user }: Props) {
  const pathname = usePathname()
  const role = user.role ?? 'MANAGER'
  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(role))
  const initial = (user.name ?? user.email ?? 'U').charAt(0).toUpperCase()

  return (
    <aside className="w-[200px] min-w-[200px] border-r border-gray-200 bg-white flex flex-col h-full">

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-[52px] border-b border-gray-100 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <Sparkles size={14} className="text-white" />
        </div>
        <span className="text-[14px] font-semibold text-gray-900 tracking-tight">Shift Solver</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors',
                active
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <Icon size={15} className={active ? 'text-indigo-600' : 'text-gray-400'} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-100 p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-[11px] font-bold flex-shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-gray-800 truncate">
              {user.name ?? 'Usuario'}
            </div>
            <div className="text-[9px] text-gray-400 truncate font-medium uppercase tracking-wide">
              {ROLE_LABELS[role] ?? role}
            </div>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <LogOut size={13} /> Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
