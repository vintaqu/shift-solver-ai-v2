'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Building2, Users, CalendarDays, Sparkles, TrendingUp,
  TrendingDown, Scale, ChevronRight, Activity, Globe,
  BarChart2, Shield, Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ROLE_LABELS: Record<string, string> = {
  ORG_OWNER: 'Propietario',
  MANAGER:   'Manager',
  EMPLOYEE:  'Empleado',
  SUPER_ADMIN: 'Super Admin',
}

const SCOPE_COLORS: Record<string, string> = {
  NACIONAL:   '#6366f1',
  AUTONOMICO: '#0891b2',
  PROVINCIAL: '#10b981',
  EMPRESA:    '#f59e0b',
}

export function AdminDashboardClient({ data }: { data: any }) {
  const { kpis, recentOrgs, recentUsers, legalFrameworks, roleDistribution } = data
  const now = new Date()

  return (
    <div className="p-6 space-y-5 max-w-[1300px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel de control</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">
            {format(now, "EEEE d 'de' MMMM yyyy", { locale: es })} · Vista global de la plataforma
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200">
          <Shield size={14} className="text-red-500" />
          <span className="text-[12px] font-semibold text-red-600">Super Admin</span>
        </div>
      </div>

      {/* ── KPIs principales ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Organizaciones',
            value: kpis.totalOrgs,
            sub: `${kpis.activeOrgs} activas`,
            icon: <Building2 size={18} className="text-indigo-600" />,
            bg: 'bg-indigo-50',
            href: '/admin/organizations',
          },
          {
            label: 'Usuarios totales',
            value: kpis.totalUsers,
            sub: 'en la plataforma',
            icon: <Users size={18} className="text-emerald-600" />,
            bg: 'bg-emerald-50',
            href: '/admin/users',
          },
          {
            label: 'Empleados',
            value: kpis.totalEmployees,
            sub: `${kpis.activeEmployees} activos`,
            icon: <Users size={18} className="text-blue-600" />,
            bg: 'bg-blue-50',
            href: '/admin/organizations',
          },
          {
            label: 'Cuadrantes totales',
            value: kpis.totalPeriods,
            sub: `${kpis.periodsThisWeek} esta semana`,
            icon: <CalendarDays size={18} className="text-violet-600" />,
            bg: 'bg-violet-50',
            href: '/admin/organizations',
          },
        ].map(k => (
          <Link key={k.label} href={k.href}
            className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group">
            <div className="flex items-center justify-between mb-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', k.bg)}>
                {k.icon}
              </div>
              <ChevronRight size={14} className="text-gray-200 group-hover:text-indigo-400 transition-colors" />
            </div>
            <div className="text-[24px] font-bold text-gray-900">{k.value.toLocaleString()}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">{k.label}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{k.sub}</div>
          </Link>
        ))}
      </div>

      {/* ── Métricas de uso ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Uso IA */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-indigo-600" />
            <h3 className="text-[14px] font-bold text-gray-800">Uso de IA (OR-Tools)</h3>
          </div>
          <div className="text-[36px] font-bold text-indigo-600">{kpis.aiUsagePct}%</div>
          <div className="text-[12px] text-gray-500 mb-3">cuadrantes generados con IA</div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${kpis.aiUsagePct}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-[11px] text-gray-400">
            <span>{kpis.aiPeriods} con IA</span>
            <span>{kpis.totalPeriods - kpis.aiPeriods} manuales</span>
          </div>
        </div>

        {/* Cuadrantes este mes */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-emerald-600" />
            <h3 className="text-[14px] font-bold text-gray-800">Actividad mensual</h3>
          </div>
          <div className="text-[36px] font-bold text-emerald-600">{kpis.periodsThisMonth}</div>
          <div className="text-[12px] text-gray-500 mb-3">cuadrantes este mes</div>
          <div className={cn(
            'flex items-center gap-1.5 text-[12px] font-semibold',
            kpis.periodsGrowthPct >= 0 ? 'text-emerald-600' : 'text-red-500'
          )}>
            {kpis.periodsGrowthPct >= 0
              ? <TrendingUp size={14} />
              : <TrendingDown size={14} />}
            {Math.abs(kpis.periodsGrowthPct)}% vs mes anterior
          </div>
          <div className="mt-3 text-[11px] text-gray-400">
            {kpis.assignmentsThisMonth.toLocaleString()} turnos planificados este mes
          </div>
        </div>

        {/* Distribución de roles */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-blue-600" />
            <h3 className="text-[14px] font-bold text-gray-800">Distribución de roles</h3>
          </div>
          <div className="space-y-2.5">
            {roleDistribution.map((r: any) => {
              const total = roleDistribution.reduce((a: number, x: any) => a + x.count, 0)
              const pct = total > 0 ? (r.count / total) * 100 : 0
              const colors: Record<string, string> = {
                ORG_OWNER: '#7c3aed', MANAGER: '#4f46e5', EMPLOYEE: '#0891b2',
              }
              return (
                <div key={r.role}>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="text-gray-600">{ROLE_LABELS[r.role] ?? r.role}</span>
                    <span className="font-bold text-gray-800">{r.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: colors[r.role] ?? '#9ca3af' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Fila: Organizaciones recientes + Usuarios recientes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Organizaciones recientes */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-gray-400" />
              <h3 className="text-[13px] font-bold text-gray-800">Últimas organizaciones</h3>
            </div>
            <Link href="/admin/organizations"
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1">
              Ver todas <ChevronRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentOrgs.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-gray-400">Sin organizaciones aún</div>
            ) : recentOrgs.map((org: any) => (
              <div key={org.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 text-[12px] font-bold flex-shrink-0">
                  {org.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-800 truncate">{org.name}</div>
                  <div className="text-[10px] text-gray-400">
                    {org.employeesCount} empleados · {org.membersCount} usuarios · {org.locationName}
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 flex-shrink-0">
                  {format(parseISO(org.createdAt), "d MMM", { locale: es })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Usuarios recientes */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-gray-400" />
              <h3 className="text-[13px] font-bold text-gray-800">Últimos usuarios</h3>
            </div>
            <Link href="/admin/users"
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1">
              Ver todos <ChevronRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentUsers.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-gray-400">Sin usuarios aún</div>
            ) : recentUsers.map((user: any) => (
              <div key={user.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-[12px] font-bold flex-shrink-0">
                  {(user.name ?? user.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-gray-800 truncate">{user.name ?? '—'}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400">{user.email} · {user.orgName}</div>
                </div>
                <div className="text-[10px] text-gray-400 flex-shrink-0">
                  {format(parseISO(user.createdAt), "d MMM", { locale: es })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Marcos legales ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Scale size={14} className="text-gray-400" />
            <h3 className="text-[13px] font-bold text-gray-800">Marcos legales en uso</h3>
          </div>
          <Link href="/admin/legal"
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1">
            Gestionar <ChevronRight size={11} />
          </Link>
        </div>
        <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
          {legalFrameworks.map((f: any) => (
            <div key={f.id}
              className={cn('rounded-xl border p-3 transition-all', f.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-50')}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SCOPE_COLORS[f.scope] ?? '#9ca3af' }} />
                <span className="text-[12px] font-bold text-gray-800 truncate">{f.name}</span>
                {!f.isActive && <span className="text-[9px] text-gray-400 ml-auto">Inactivo</span>}
              </div>
              <div className="text-[10px] font-mono text-gray-400 mb-2">{f.code}</div>
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
                <span>🏢 {f.orgsCount} org</span>
                <span>👤 {f.employeesCount} emp</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
