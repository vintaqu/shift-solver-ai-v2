'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { Search, Users, Eye, EyeOff, Loader2, CheckCircle, X, ToggleLeft, ToggleRight, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toggleUserActive, resetUserPassword } from '@/server/actions/auth'

const ROLE_CFG: Record<string, { label: string; cls: string }> = {
  SUPER_ADMIN: { label: 'Super Admin',  cls: 'bg-red-100 text-red-700 border-red-200' },
  ORG_OWNER:   { label: 'Propietario', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  MANAGER:     { label: 'Manager',     cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  EMPLOYEE:    { label: 'Empleado',    cls: 'bg-gray-100 text-gray-600 border-gray-200' },
}

export function AdminUsersClient({ users }: { users: any[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [resetModal, setResetModal] = useState<any | null>(null)

  const filtered = users.filter(u => {
    const matchSearch = `${u.name ?? ''} ${u.email}`.toLowerCase().includes(search.toLowerCase())
    const matchRole = filterRole === 'all' || u.role === filterRole
    return matchSearch && matchRole
  })

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="p-6 space-y-5 max-w-[1100px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
        <p className="text-sm text-gray-500 mt-0.5">{users.length} usuarios registrados en la plataforma</p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 border border-gray-200">
          {[
            { key: 'all', label: `Todos (${users.length})` },
            { key: 'ORG_OWNER', label: `Propietarios (${roleCounts.ORG_OWNER ?? 0})` },
            { key: 'MANAGER', label: `Managers (${roleCounts.MANAGER ?? 0})` },
          ].map(f => (
            <button key={f.key} onClick={() => setFilterRole(f.key)}
              className={cn('px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                filterRole === f.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-gray-100">
          {filtered.map(user => {
            const roleCfg = ROLE_CFG[user.role] ?? ROLE_CFG.EMPLOYEE
            const org = user.memberships?.[0]?.organization
            const initial = (user.name ?? user.email ?? 'U')[0].toUpperCase()

            return (
              <div key={user.id} className={cn('flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors', !user.isActive && 'opacity-50')}>
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-bold flex-shrink-0',
                  user.role === 'SUPER_ADMIN' ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700')}>
                  {user.role === 'SUPER_ADMIN' ? <Shield size={14} /> : initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-gray-800">{user.name ?? '—'}</span>
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', roleCfg.cls)}>
                      {roleCfg.label}
                    </span>
                    {!user.isActive && <span className="text-[10px] text-red-500 font-semibold">Inactivo</span>}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {user.email}
                    {org && <span className="ml-2">· {org.name}</span>}
                  </div>
                </div>
                <div className="text-[11px] text-gray-400 flex-shrink-0">
                  {format(parseISO(user.createdAt), "d MMM yyyy", { locale: es })}
                </div>
                {user.role !== 'SUPER_ADMIN' && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => setResetModal(user)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                      Reset pwd
                    </button>
                    <button onClick={() => startTransition(async () => {
                      await toggleUserActive(user.id)
                      toast.success(user.isActive ? 'Usuario desactivado' : 'Reactivado')
                      router.refresh()
                    })} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                      {user.isActive
                        ? <ToggleRight size={16} className="text-emerald-500" />
                        : <ToggleLeft size={16} className="text-gray-300" />}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-gray-400 text-[13px]">Sin usuarios que coincidan</div>
          )}
        </div>
      </div>

      {resetModal && (
        <ResetPwdModal user={resetModal} onClose={() => setResetModal(null)}
          onReset={() => { setResetModal(null); toast.success('Contraseña actualizada ✓') }} />
      )}
    </div>
  )
}

function ResetPwdModal({ user, onClose, onReset }: any) {
  const [isPending, startTransition] = useTransition()
  const [pwd, setPwd] = useState('')
  const [show, setShow] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[400px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"
          style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h2 className="text-[15px] font-bold text-gray-900">Reset contraseña</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-[12px] text-gray-500">{user.name} · {user.email}</p>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Nueva contraseña</label>
            <div className="relative">
              <input type={show ? 'text' : 'password'} value={pwd} onChange={e => setPwd(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 pr-10"
                placeholder="Mínimo 8 caracteres" />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100">Cancelar</button>
          <button disabled={isPending || pwd.length < 8} onClick={() => startTransition(async () => {
            try { await resetUserPassword(user.id, pwd); onReset() }
            catch (e: any) { toast.error(e.message) }
          })} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Actualizar
          </button>
        </div>
      </div>
    </div>
  )
}
