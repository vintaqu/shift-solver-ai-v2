'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Search, Plus, UserX, ChevronRight, Clock,
  Briefcase, AlertCircle, Filter
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmployeeDetailClient } from './EmployeeDetailClient'
import { upsertEmployee } from '@/server/actions/employees'

const ROLE_COLORS: Record<string, string> = {
  OWNER:        'bg-gray-800 text-white',
  MANAGER:      'bg-violet-100 text-violet-700',
  SEMI_MANAGER: 'bg-cyan-100 text-cyan-700',
  BASIC:        'bg-indigo-100 text-indigo-700',
}

interface Props {
  employees: any[]
  skills: any[]
  roles: any[]
  legalFrameworks: any[]
  organizationId: string
}

export function EmployeesSplitClient({ employees: initial, skills, roles, legalFrameworks, organizationId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [employees, setEmployees] = useState(initial)
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [filterStatus, setFilterStatus] = useState<'active' | 'inactive' | 'all'>('active')
  const [showCreate, setShowCreate] = useState(false)

  const filtered = useMemo(() => employees.filter(e => {
    const matchSearch = `${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase())
    const roleLevel = e.skills?.[0]?.laborRole?.level ?? ''
    const matchRole = filterRole === 'all' || roleLevel === filterRole
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? e.isActive : !e.isActive)
    return matchSearch && matchRole && matchStatus
  }), [employees, search, filterRole, filterStatus])

  const selectedEmployee = employees.find(e => e.id === selectedId) ?? null

  // KPIs
  const active = employees.filter(e => e.isActive).length
  const fullTime = employees.filter(e => e.isActive && (e.contracts?.[0]?.contractType === 'FULL_TIME')).length
  const partTime = employees.filter(e => e.isActive && (e.contracts?.[0]?.contractType === 'PART_TIME')).length
  const totalH = employees.filter(e => e.isActive).reduce((s, e) => s + (e.contracts?.[0]?.weeklyHours ?? 0), 0)

  return (
    <div className="flex h-[calc(100vh-52px)] overflow-hidden bg-[#F7F8FA]">

      {/* ── COLUMNA IZQUIERDA — lista de empleados ── */}
      <div className="w-[280px] min-w-[280px] flex flex-col bg-white border-r border-gray-200 overflow-hidden">

        {/* Header lista */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-[15px] font-bold text-gray-900">Empleados</h1>
              <p className="text-[11px] text-gray-400">{active} activos · {employees.length} total</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center transition-colors"
            >
              <Plus size={14} className="text-white" />
            </button>
          </div>

          {/* Búsqueda */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar empleado..."
              className="w-full pl-7 pr-3 py-1.5 text-[12px] border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          {/* Filtros */}
          <div className="flex gap-1 mt-2">
            {[
              { key: 'active', label: 'Activos' },
              { key: 'inactive', label: 'Inactivos' },
              { key: 'all', label: 'Todos' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key as any)}
                className={cn(
                  'flex-1 py-1 rounded-md text-[11px] font-medium transition-colors',
                  filterStatus === f.key
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <UserX size={24} className="mb-2 opacity-40" />
              <span className="text-[12px]">Sin empleados</span>
            </div>
          ) : (
            <div className="py-1">
              {filtered.map(emp => {
                const role = emp.skills?.[0]?.laborRole
                const contract = emp.contracts?.[0]
                const isSelected = emp.id === selectedId
                const initials = `${emp.firstName?.[0] ?? ''}${emp.lastName?.[0] ?? ''}`.toUpperCase()

                return (
                  <button
                    key={emp.id}
                    onClick={() => setSelectedId(emp.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-l-2',
                      isSelected
                        ? 'bg-indigo-50 border-l-indigo-600'
                        : 'border-l-transparent hover:bg-gray-50',
                      !emp.isActive && 'opacity-50'
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                      style={{ backgroundColor: emp.color || '#6366f1' }}
                    >
                      {initials}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('text-[13px] font-medium truncate', isSelected ? 'text-indigo-700' : 'text-gray-800')}>
                          {emp.firstName} {emp.lastName}
                        </span>
                        {!emp.isActive && (
                          <span className="text-[9px] text-red-400 flex-shrink-0">Inactivo</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {role && (
                          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', ROLE_COLORS[role.level] ?? 'bg-gray-100 text-gray-600')}>
                            {role.name}
                          </span>
                        )}
                        {contract && (
                          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                            <Clock size={9} /> {contract.weeklyHours}h
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && <ChevronRight size={12} className="text-indigo-400 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* KPIs footer */}
        <div className="border-t border-gray-100 px-3 py-2.5 bg-gray-50 grid grid-cols-2 gap-x-2 gap-y-1">
          {[
            { label: 'Tiempo completo', value: fullTime },
            { label: 'Tiempo parcial', value: partTime },
            { label: 'Horas/sem total', value: `${totalH}h` },
            { label: 'Activos', value: active },
          ].map(k => (
            <div key={k.label}>
              <div className="text-[10px] text-gray-400">{k.label}</div>
              <div className="text-[12px] font-bold text-gray-700">{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── COLUMNA DERECHA — detalle del empleado ── */}
      <div className="flex-1 overflow-y-auto">
        {selectedEmployee ? (
          <EmployeeDetailClient
            employee={selectedEmployee}
            skills={skills}
            roles={roles}
            legalFrameworks={legalFrameworks}
            onUpdated={(updated: any) => {
              setEmployees(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e))
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-300">
            <Briefcase size={48} className="mb-3" />
            <p className="text-[14px] font-medium">Selecciona un empleado</p>
            <p className="text-[12px] mt-1">para ver su ficha</p>
          </div>
        )}
      </div>

      {/* Modal crear empleado */}
      {showCreate && (
        <CreateEmployeeModal
          organizationId={organizationId}
          onClose={() => setShowCreate(false)}
          onCreated={(emp: any) => {
            setEmployees(prev => [emp, ...prev])
            setSelectedId(emp.id)
            setShowCreate(false)
            toast.success(`${emp.firstName} ${emp.lastName} creado ✓`)
          }}
        />
      )}
    </div>
  )
}

// ── Modal crear empleado ──────────────────────────────────────────────────────
function CreateEmployeeModal({ organizationId, onClose, onCreated }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    color: '#6366f1',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#0891b2','#ec4899','#f97316','#84cc16','#14b8a6']

  function validate() {
    const e: Record<string, string> = {}
    if (!form.firstName.trim()) e.firstName = 'Nombre obligatorio'
    if (!form.lastName.trim()) e.lastName = 'Apellido obligatorio'
    return e
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[480px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h2 className="text-[15px] font-bold text-gray-900">Nuevo empleado</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Rellena los datos básicos. Podrás configurar contrato y roles desde la ficha.</p>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Nombre y apellido */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'firstName', label: 'Nombre *' },
              { key: 'lastName', label: 'Apellido *' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{f.label}</label>
                <input
                  className={cn('w-full border rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300',
                    errors[f.key] ? 'border-red-300' : 'border-gray-200')}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(f2 => ({ ...f2, [f.key]: e.target.value }))}
                />
                {errors[f.key] && <p className="text-[10px] text-red-500 mt-1">{errors[f.key]}</p>}
              </div>
            ))}
          </div>

          {/* Email y teléfono */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'email', label: 'Email', type: 'email' },
              { key: 'phone', label: 'Teléfono', type: 'tel' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{f.label}</label>
                <input
                  type={f.type}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={(form as any)[f.key]}
                  onChange={e => setForm(f2 => ({ ...f2, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          {/* Color */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Color en el cuadrante</label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={cn('w-6 h-6 rounded-full transition-all', form.color === c ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : 'hover:scale-110')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100">Cancelar</button>
          <button
            disabled={isPending}
            onClick={() => {
              const e = validate()
              if (Object.keys(e).length) { setErrors(e); return }
              startTransition(async () => {
                try {
                  const emp = await upsertEmployee({
                    organizationId,
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    email: form.email.trim() || undefined,
                    phone: form.phone.trim() || undefined,
                    color: form.color,
                  })
                  onCreated(emp)
                } catch (err: any) { toast.error(err.message) }
              })
            }}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isPending ? 'Creando...' : 'Crear empleado'}
          </button>
        </div>
      </div>
    </div>
  )
}
