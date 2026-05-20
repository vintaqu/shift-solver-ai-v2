'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, Search, Users, ChevronRight, MoreVertical,
  UserCheck, UserX, Clock, Briefcase, X, Loader2,
  AlertCircle, CheckCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { upsertEmployee, toggleEmployeeActive } from '@/server/actions/employees'

const ROLE_LABELS: Record<string, string> = {
  BASIC: 'Camarero básico',
  SEMI_MANAGER: 'Semi-encargado',
  MANAGER: 'Encargado',
  OWNER: 'Dueño',
}

const ROLE_COLORS: Record<string, string> = {
  BASIC: '#6366f1',
  SEMI_MANAGER: '#0891b2',
  MANAGER: '#7c3aed',
  OWNER: '#64748b',
}

const CONTRACT_LABELS: Record<string, string> = {
  FULL_TIME: 'Tiempo completo',
  PART_TIME: 'Tiempo parcial',
  OWNER: 'Propietario',
  EXTRA: 'Extra',
  TEMPORAL: 'Temporal',
}

const EMP_COLORS = [
  '#4f46e5','#059669','#9333ea','#ea580c',
  '#dc2626','#0284c7','#ca8a04','#16a34a',
  '#db2777','#0891b2','#7c3aed','#64748b',
]

interface Props {
  employees: any[]
  skills: any[]
  roles: any[]
  organizationId: string
  locationId: string
}

export function EmployeeListClient({ employees: initial, skills, roles, organizationId, locationId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active')
  const [showCreate, setShowCreate] = useState(false)

  // Filter
  const filtered = initial.filter(e => {
    const matchSearch = `${e.firstName} ${e.lastName} ${e.email || ''}`.toLowerCase().includes(search.toLowerCase())
    const empRole = e.skills?.[0]?.laborRole?.level || ''
    const matchRole = filterRole === 'all' || empRole === filterRole
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? e.isActive : !e.isActive)
    return matchSearch && matchRole && matchStatus
  })

  const stats = {
    total: initial.length,
    active: initial.filter(e => e.isActive).length,
    fullTime: initial.filter(e => e.contracts?.[0]?.contractType === 'FULL_TIME').length,
    totalWeeklyHours: initial.reduce((acc, e) => acc + (e.contracts?.[0]?.weeklyHours || 0), 0),
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f5f6fa' }}>

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Empleados</h1>
            <p className="text-sm text-gray-500 mt-0.5">{stats.active} activos · {stats.total} total</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={15} /> Nuevo empleado
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Empleados activos', value: stats.active, icon: <UserCheck size={16} className="text-emerald-600" />, bg: 'bg-emerald-50' },
            { label: 'Tiempo completo', value: stats.fullTime, icon: <Briefcase size={16} className="text-indigo-600" />, bg: 'bg-indigo-50' },
            { label: 'Tiempo parcial', value: stats.active - stats.fullTime, icon: <Clock size={16} className="text-amber-600" />, bg: 'bg-amber-50' },
            { label: 'Horas totales/sem', value: `${stats.totalWeeklyHours}h`, icon: <Users size={16} className="text-violet-600" />, bg: 'bg-violet-50' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', s.bg)}>{s.icon}</div>
              <div>
                <div className="text-[18px] font-bold text-gray-900">{s.value}</div>
                <div className="text-[11px] text-gray-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar empleado..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
            />
          </div>
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="all">Todos los roles</option>
            {roles.map((r: any) => <option key={r.id} value={r.level}>{r.name}</option>)}
          </select>
          <div className="flex bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
            {(['all', 'active', 'inactive'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  'px-3 py-2 text-[12px] font-medium transition-colors',
                  filterStatus === s ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {s === 'all' ? 'Todos' : s === 'active' ? 'Activos' : 'Inactivos'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={40} className="text-gray-200 mb-4" />
            <p className="text-gray-500 font-medium">No hay empleados</p>
            <p className="text-gray-400 text-sm mt-1">Crea el primer empleado pulsando "+ Nuevo empleado"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((emp: any) => {
              const contract = emp.contracts?.[0]
              const mainRole = emp.skills?.[0]?.laborRole
              const empSkills = Array.from(new Map(emp.skills?.map((s: any) => [s.skill?.id, s.skill]).filter((s: any) => s[1])).values()) as any[]
              const weekH = contract?.weeklyHours || 0
              const initials = `${emp.firstName?.[0] || ''}${emp.lastName?.[0] || ''}`.toUpperCase()

              return (
                <div
                  key={emp.id}
                  className={cn(
                    'bg-white border rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all group',
                    !emp.isActive && 'opacity-60'
                  )}
                  onClick={() => router.push(`/employees/${emp.id}`)}
                >
                  {/* Avatar */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-[14px] flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: emp.color || '#4f46e5' }}
                  >
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[14px] font-bold text-gray-900">
                        {emp.firstName} {emp.lastName}
                      </span>
                      {!emp.isActive && (
                        <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactivo</span>
                      )}
                      {mainRole && (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: ROLE_COLORS[mainRole.level] || '#6366f1' }}
                        >
                          {mainRole.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-gray-500">
                      {emp.email && <span>{emp.email}</span>}
                      {contract && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {weekH}h/sem · {CONTRACT_LABELS[contract.contractType] || contract.contractType}
                          {contract.minWeeklyHours && contract.maxWeeklyHours && (
                            <span className="text-gray-400">({contract.minWeeklyHours}–{contract.maxWeeklyHours}h)</span>
                          )}
                        </span>
                      )}
                    </div>
                    {/* Skills */}
                    {empSkills.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {empSkills.slice(0, 6).map((s: any) => (
                          <span
                            key={s.id}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: s.color + '22', color: s.color }}
                          >
                            {s.name}
                          </span>
                        ))}
                        {empSkills.length > 6 && (
                          <span className="text-[10px] text-gray-400">+{empSkills.length - 6}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6 text-center flex-shrink-0">
                    <div>
                      <div className="text-[16px] font-bold text-gray-800">{emp._count?.assignments || 0}</div>
                      <div className="text-[10px] text-gray-400">turnos</div>
                    </div>
                    <div>
                      <div className="text-[16px] font-bold text-gray-800">{emp._count?.absences || 0}</div>
                      <div className="text-[10px] text-gray-400">ausencias</div>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-indigo-400 transition-colors" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal crear empleado */}
      {showCreate && (
        <CreateEmployeeModal
          organizationId={organizationId}
          locationId={locationId}
          usedColors={initial.map((e: any) => e.color)}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false)
            router.push(`/employees/${id}`)
          }}
        />
      )}
    </div>
  )
}

// ─── Modal crear empleado ──────────────────────────────────────────────────────
function CreateEmployeeModal({ organizationId, locationId, usedColors, onClose, onCreated }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    color: EMP_COLORS.find(c => !usedColors.includes(c)) || EMP_COLORS[0],
    hireDate: new Date().toISOString().split('T')[0],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate() {
    const e: Record<string, string> = {}
    if (!form.firstName.trim()) e.firstName = 'Nombre obligatorio'
    if (!form.lastName.trim()) e.lastName = 'Apellido obligatorio'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email inválido'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSave() {
    if (!validate()) return
    startTransition(async () => {
      try {
        const emp = await upsertEmployee({ ...form, organizationId, locationId })
        toast.success(`${form.firstName} ${form.lastName} creado ✓`)
        onCreated(emp.id)
      } catch (e: any) {
        toast.error(e.message)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[480px]" onClick={e => e.stopPropagation()}>

        <div className="px-6 py-5 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-gray-900">Nuevo empleado</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white transition-colors">
              <X size={16} />
            </button>
          </div>
          <p className="text-[12px] text-gray-500 mt-1">Después podrás configurar contrato, restricciones y roles.</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Preview avatar */}
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-[18px] font-bold shadow-md"
              style={{ backgroundColor: form.color }}
            >
              {form.firstName?.[0] || '?'}{form.lastName?.[0] || ''}
            </div>
            <div>
              <div className="text-[12px] font-semibold text-gray-500 mb-1.5">Color en el cuadrante</div>
              <div className="flex gap-1.5 flex-wrap">
                {EMP_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={cn('w-6 h-6 rounded-lg transition-all', form.color === c ? 'ring-2 ring-offset-1 ring-gray-800 scale-110' : 'hover:scale-105')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre *" error={errors.firstName}>
              <input
                className={inputCls(!!errors.firstName)}
                placeholder="Ej: Sara"
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
              />
            </Field>
            <Field label="Apellidos *" error={errors.lastName}>
              <input
                className={inputCls(!!errors.lastName)}
                placeholder="Ej: López"
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Email" error={errors.email}>
            <input
              type="email"
              className={inputCls(!!errors.email)}
              placeholder="sara@restaurante.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono">
              <input
                className={inputCls(false)}
                placeholder="+34 666 000 000"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </Field>
            <Field label="Fecha alta">
              <input
                type="date"
                className={inputCls(false)}
                value={form.hireDate}
                onChange={e => setForm(f => ({ ...f, hireDate: e.target.value }))}
              />
            </Field>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Crear y configurar →
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children?: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {error && <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={10} />{error}</p>}
    </div>
  )
}

function inputCls(hasError: boolean) {
  return cn(
    'w-full border rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
    hasError ? 'border-red-300 focus:ring-red-300' : 'border-gray-200 focus:ring-indigo-300'
  )
}
