'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard, CalendarDays, Users, ClipboardList,
  UserX, Settings, LogOut, Sparkles, Clock, ChevronDown,
  Bell, Search
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Cuadro de mando', icon: LayoutDashboard },
  { href: '/planning',   label: 'Planificación',   icon: CalendarDays    },
  { href: '/employees',  label: 'Empleados',        icon: Users           },
  { href: '/timeclock',  label: 'Control horario',  icon: Clock           },
  { href: '/absences',   label: 'Ausencias',        icon: UserX           },
  { href: '/coverage',   label: 'Cobertura',        icon: ClipboardList   },
]

interface Props {
  user: {
    name?: string | null
    email?: string | null
    role: string
    organizationId?: string | null
  }
  orgName?: string | null
}

export function TopNav({ user, orgName }: Props) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/planning') return pathname.startsWith('/planning')
    if (href === '/employees') return pathname.startsWith('/employees')
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <header className="sticky top-0 z-50 h-[52px] bg-white border-b border-gray-200 flex items-center px-4 gap-0">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 mr-6 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Sparkles size={14} className="text-white" />
        </div>
        <span className="text-[13px] font-bold text-gray-900 tracking-tight">Shift Solver</span>
      </Link>

      {/* Org selector */}
      {orgName && (
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 text-[12px] text-gray-600 font-medium border border-gray-200 mr-4 flex-shrink-0 transition-colors">
          <div className="w-4 h-4 rounded bg-indigo-100 flex items-center justify-center text-indigo-700 text-[9px] font-bold">
            {orgName[0]}
          </div>
          <span className="max-w-[120px] truncate">{orgName}</span>
          <ChevronDown size={11} className="text-gray-400" />
        </button>
      )}

      {/* Nav links */}
      <nav className="flex items-center gap-0.5 flex-1">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all whitespace-nowrap',
                active
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              )}
            >
              {label}
              {active && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-indigo-600 rounded-full -mb-[11px]" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
          <Search size={15} />
        </button>
        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors relative">
          <Bell size={15} />
        </button>

        <Link href="/settings" className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
          pathname.startsWith('/settings') ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
        )}>
          <Settings size={15} />
        </Link>

        {/* Avatar + dropdown */}
        <div className="flex items-center gap-2 ml-1 pl-2 border-l border-gray-200">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[11px] font-bold cursor-pointer"
            onClick={() => signOut({ callbackUrl: '/login' })}
            title="Cerrar sesión">
            {(user.name ?? user.email ?? 'U')[0].toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  )
}
