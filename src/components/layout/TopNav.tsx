'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard, CalendarDays, Users, ClipboardList,
  UserX, Settings, LogOut, Sparkles, Clock, ChevronDown,
  Bell, BarChart2, Shield, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_MAIN = [
  { href: '/dashboard',  label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/planning',   label: 'Planificador', icon: CalendarDays    },
  { href: '/employees',  label: 'Empleados',    icon: Users           },
  { href: '/coverage',   label: 'Cobertura',    icon: ClipboardList   },
  { href: '/absences',   label: 'Ausencias',    icon: UserX           },
]

const NAV_SECONDARY = [
  { href: '/timeclock',  label: 'Fichajes',     icon: Clock     },
  { href: '/reports',    label: 'Informes',     icon: BarChart2 },
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
    role: string
    organizationId?: string | null
  }
  orgName?: string | null
}

export function TopNav({ user, orgName }: Props) {
  const pathname = usePathname()
  const initial = (user.name ?? user.email ?? 'U')[0].toUpperCase()
  const roleLabel = ROLE_LABELS[user.role] ?? user.role

  const isActive = (href: string) =>
    href === '/planning'
      ? pathname.startsWith('/planning')
      : pathname === href || pathname.startsWith(href + '/')

  return (
    <header className="sticky top-0 z-50 h-[52px] bg-white border-b border-gray-200 flex items-center px-4 gap-0 shrink-0">

      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 mr-6 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Sparkles size={14} className="text-white" />
        </div>
        <span className="text-[13px] font-bold text-gray-900 tracking-tight">Shift Solver</span>
      </Link>

      {/* Nav principal */}
      <nav className="flex items-center gap-0.5 flex-1" aria-label="Navegación principal">
        {NAV_MAIN.map(({ href, label }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all whitespace-nowrap',
                active
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              )}
            >
              {label}
            </Link>
          )
        })}

        {/* Separador */}
        <div className="w-px h-4 bg-gray-200 mx-1.5 flex-shrink-0" aria-hidden="true" />

        {NAV_SECONDARY.map(({ href, label }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all whitespace-nowrap',
                active
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              )}
            >
              {label}
            </Link>
          )
        })}

        {/* Super Admin — solo visible si aplica (se filtra en layout) */}
        {user.role === 'SUPER_ADMIN' && (
          <>
            <div className="w-px h-4 bg-gray-200 mx-1.5 flex-shrink-0" aria-hidden="true" />
            <Link
              href="/admin"
              className={cn(
                'px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5',
                pathname.startsWith('/admin')
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              )}
            >
              <Shield size={13} />
              Super Admin
            </Link>
          </>
        )}
      </nav>

      {/* Acciones derecha */}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">

        {/* Org selector */}
        {orgName && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-600 font-medium cursor-pointer hover:bg-gray-50 transition-colors select-none">
            <Building2 size={13} className="text-gray-400" />
            <span className="max-w-[120px] truncate">{orgName}</span>
            <ChevronDown size={11} className="text-gray-400" />
          </div>
        )}

        {/* Notificaciones */}
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors relative"
          aria-label="Notificaciones"
        >
          <Bell size={15} />
        </button>

        {/* Ajustes */}
        <Link
          href="/settings"
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-gray-100 text-gray-700'
              : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
          )}
          aria-label="Ajustes"
        >
          <Settings size={15} />
        </Link>

        {/* Separador + Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200 ml-1">
          <div className="flex items-center gap-2 group relative cursor-pointer">
            <div className="text-right hidden sm:block">
              <div className="text-[11px] font-semibold text-gray-700 leading-none">
                {user.name ?? user.email ?? 'Usuario'}
              </div>
              <div className="text-[10px] text-gray-400 leading-none mt-0.5">
                {roleLabel}
              </div>
            </div>
            <div
              className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[11px] font-bold"
              title={`${user.name ?? user.email} · ${roleLabel}`}
            >
              {initial}
            </div>
            {/* Dropdown logout */}
            <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-gray-200 rounded-xl shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 py-1.5">
              <div className="px-3 py-1.5 border-b border-gray-100 mb-1">
                <div className="text-[12px] font-semibold text-gray-800 truncate">
                  {user.name ?? user.email}
                </div>
                <div className="text-[10px] text-gray-400">{roleLabel}</div>
              </div>
              <Link
                href="/settings"
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Settings size={13} /> Ajustes
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut size={13} /> Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
