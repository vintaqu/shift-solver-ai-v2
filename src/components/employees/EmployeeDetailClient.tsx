'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, User, FileText, Shield, Clock, Calendar,
  AlertTriangle, Pencil, Plus, Trash2, X, Loader2,
  CheckCircle, AlertCircle,
  ChevronDown, Lock, Sun, Moon, Repeat
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { employeeColor, primaryRoleOf } from '@/lib/employee-color'
import { RoleExtraBadge } from './RoleExtraBadge'
import {
  upsertEmployee, upsertContract, setEmployeeSkills,
  upsertAvailability, deleteAvailability, setEmployeeStatus,
  deleteEmployee, getEmployeeDeletionImpact
} from '@/server/actions/employees'
import { updateEmployeeVacationConfig } from '@/server/actions/absences'
import { setEmployeePin, removeEmployeePin, getEmployeeLoginLink } from '@/server/actions/auth'
import { setEmployeeFramework } from '@/server/actions/legalFrameworks'

// ─── Constantes ────────────────────────────────────────────────────────────────
const DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const CONTRACT_TYPES = [
  { value: 'FULL_TIME', label: 'Tiempo completo' },
  { value: 'PART_TIME', label: 'Tiempo parcial' },
  { value: 'OWNER', label: 'Propietario/Dueño' },
  { value: 'EXTRA', label: 'Extra / Eventual' },
  { value: 'TEMPORAL', label: 'Temporal' },
]

const AVAIL_TYPES = [
  { value: 'DAY_OFF',      label: 'No puede trabajar',    icon: '🚫', color: '#dc2626', desc: 'Día o franja completamente bloqueada' },
  { value: 'NOT_BEFORE',   label: 'No antes de...',        icon: '🌅', color: '#f59e0b', desc: 'Ej: no antes de las 08:00' },
  { value: 'NOT_AFTER',    label: 'No después de...',      icon: '🌆', color: '#8b5cf6', desc: 'Ej: no después de las 22:00' },
  { value: 'ONLY_BETWEEN', label: 'Solo entre...',          icon: '⏰', color: '#0891b2', desc: 'Ej: solo de 08:00 a 18:00' },
  { value: 'PREFER',       label: 'Preferencia positiva',  icon: '⭐', color: '#10b981', desc: 'Prefiere trabajar en esta franja' },
]

const ROLE_ORDER = ['BASIC', 'SEMI_MANAGER', 'MANAGER', 'OWNER']
const ROLE_COLORS: Record<string, string> = {
  BASIC: '#6366f1', SEMI_MANAGER: '#0891b2', MANAGER: '#7c3aed', OWNER: '#64748b'
}

function inputCls(err = false) {
  return cn(
    'w-full border rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:border-transparent',
    err ? 'border-red-300 focus:ring-red-300' : 'border-gray-200 focus:ring-indigo-300'
  )
}
function Field({ label, hint, error, children }: any) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      {hint && <p className="text-[11px] text-gray-400 mb-1.5">{hint}</p>}
      {children}
      {error && <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={10} />{error}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export function EmployeeDetailClient({ employee: emp, skills: allSkills, roles: allRoles, legalFrameworks = [], onUpdated }: any) {
  const router = useRouter()
  const [showDelete, setShowDelete] = useState(false)
  const [tab, setTab] = useState<'info' | 'contract' | 'roles' | 'restrictions' | 'history'>('info')
  const [editInfo, setEditInfo] = useState(false)
  const [editContract, setEditContract] = useState(false)
  const [editRoles, setEditRoles] = useState(false)
  const [restrictionModal, setRestrictionModal] = useState<null | 'create' | any>(null)
  const [isPending, startTransition] = useTransition()

  const contract = emp.contracts?.find((c: any) => c.isActive) || emp.contracts?.[0]
  // El rol principal se identifica por ID. Con los grupos ya no vale el `level`:
  // varios roles comparten nivel (Camarero y Cocinero son ambos BASIC) y se
  // confundirían entre sí.
  const mainRole = emp.skills?.find((s: any) => s.laborRole)?.laborRole ?? null
  const mainRoleId: string | null = mainRole?.id ?? null
  const mainRoleLevel = mainRole?.level || 'BASIC'

  // Cadena del grupo al que pertenece, de menor a mayor rango.
  const rolesOfMainGroup = useMemo(() => {
    const gid = mainRole?.groupId ?? mainRole?.group?.id ?? null
    if (!gid) return mainRole ? [mainRole] : []
    return allRoles
      .filter((r: any) => (r.groupId ?? r.group?.id) === gid)
      .sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0) || a.name.localeCompare(b.name))
  }, [allRoles, mainRole])
  const empSkillIds = Array.from(new Set(emp.skills?.map((s: any) => s.skill?.id).filter(Boolean))) as string[]
  const initials = `${emp.firstName?.[0] || ''}${emp.lastName?.[0] || ''}`.toUpperCase()

  // Preferencias de jornada. Ya son columnas reales del contrato; el fallback
  // al texto de `notes` cubre los contratos guardados antes de la migración.
  const contractNotes = contract?.notes || ''
  const preferContinuous = contract?.preferContinuous ?? !contractNotes.includes('preferContinuous:false')
  const allowSplit = contract?.allowSplit ?? contractNotes.includes('allowSplit:true')

  const TABS = [
    { id: 'info', label: 'Información', icon: <User size={14} /> },
    { id: 'contract', label: 'Contrato', icon: <FileText size={14} /> },
    { id: 'roles', label: 'Roles y etiquetas', icon: <Shield size={14} /> },
    { id: 'restrictions', label: 'Restricciones', icon: <Clock size={14} /> },
    { id: 'history', label: 'Historial', icon: <Calendar size={14} /> },
  ]

  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">

      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-[20px] font-bold shadow-md flex-shrink-0"
            style={{ backgroundColor: employeeColor(emp, allRoles) }}
          >
            {initials}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[20px] font-bold text-gray-900">{emp.firstName} {emp.lastName}</h1>
              {(emp as any).status === 'INACTIVE' && <span className="text-[11px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-semibold">Inactivo</span>}
              {(emp as any).status === 'ARCHIVED' && <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">Archivado</span>}
              {mainRoleLevel && (
                <span className="text-[11px] text-white font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ backgroundColor: ROLE_COLORS[mainRoleLevel] }}>
                  {allRoles.find((r: any) => r.level === mainRoleLevel)?.name || mainRoleLevel}
                </span>
              )}
              <RoleExtraBadge employee={emp} />
            </div>
            <div className="flex items-center gap-4 mt-1 text-[12px] text-gray-500">
              {emp.email && <span>{emp.email}</span>}
              {emp.phone && <span>{emp.phone}</span>}
              {contract && <span className="font-medium text-gray-700">{contract.weeklyHours}h/sem</span>}
            </div>
          </div>

          {/* Acciones header */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDelete(true)}
              title="Borrar empleado definitivamente"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-white text-red-600 text-[13px] font-medium hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} /> Borrar
            </button>
            <StatusSelector
              currentStatus={(emp as any).status ?? 'ACTIVE'}
              onSelect={async (s: string) => {
                startTransition(async () => {
                  await setEmployeeStatus(emp.id, s as any)
                  toast.success(`Estado cambiado a ${s === 'ACTIVE' ? 'Activo' : s === 'INACTIVE' ? 'Inactivo' : 'Archivado'}`)
                  router.refresh()
                })
              }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-4 border-b border-gray-200 -mb-4">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all -mb-px',
                tab === t.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenido tabs ── */}
      <div className="flex-1 overflow-auto p-6">

        {/* ══ TAB: INFORMACIÓN PERSONAL ══ */}
        {tab === 'info' && (
          <div className="max-w-2xl space-y-4">
            <SectionCard
              title="Datos personales"
              action={<EditBtn onClick={() => setEditInfo(true)} />}
            >
              <InfoGrid rows={[
                { label: 'Nombre completo', value: `${emp.firstName} ${emp.lastName}` },
                { label: 'Email', value: emp.email || '—' },
                { label: 'Teléfono', value: emp.phone || '—' },
                { label: 'Fecha de alta', value: emp.hireDate ? new Date(emp.hireDate).toLocaleDateString('es-ES') : '—' },
                { label: 'Fecha de baja', value: (emp as any).terminationDate ? new Date((emp as any).terminationDate).toLocaleDateString('es-ES') : '—' },
                { label: 'Estado', value: (emp as any).status === 'ACTIVE' ? '✅ Activo' : (emp as any).status === 'INACTIVE' ? '⏸️ Inactivo' : '🗄️ Archivado' },
              ]} />
              {emp.notes && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[12px] text-amber-800">
                  📝 {emp.notes}
                </div>
              )}
            </SectionCard>

            {/* Color */}
            <PinCard emp={emp} onSaved={() => router.refresh()} />

            <SectionCard title="Color en el cuadrante">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl shadow-md" style={{ backgroundColor: employeeColor(emp, allRoles) }} />
                <div className="flex flex-col">
                  <span className="text-[13px] text-gray-700 font-medium">
                    {primaryRoleOf(emp)?.name ?? 'Sin rol asignado'}
                  </span>
                  <span className="text-[12px] text-gray-400">
                    El color se hereda del rol del empleado
                  </span>
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        {/* ══ TAB: CONTRATO ══ */}
        {tab === 'contract' && (
          <div className="max-w-2xl space-y-4">
            {contract ? (
              <>
                <SectionCard
                  title="Contrato activo"
                  action={<EditBtn onClick={() => setEditContract(true)} />}
                >
                  <InfoGrid rows={[
                    { label: 'Tipo de contrato', value: CONTRACT_TYPES.find(c => c.value === contract.contractType)?.label || contract.contractType },
                    { label: 'Horas semanales', value: `${contract.weeklyHours}h/sem` },
                    { label: 'Horquilla horaria', value: contract.minWeeklyHours && contract.maxWeeklyHours ? `${contract.minWeeklyHours}h – ${contract.maxWeeklyHours}h` : 'Sin horquilla' },
                    { label: 'Máx. horas/día', value: `${contract.maxDailyHours}h (convenio: 9h)` },
                    { label: 'Descanso mínimo entre jornadas', value: `${contract.minRestBetweenShifts}h (convenio: 12h)` },
                    { label: 'Máx. días consecutivos', value: `${contract.maxConsecutiveDays} días` },
                    { label: 'Horas anuales máximas', value: `${contract.annualMaxHours}h (convenio: 1.791h)` },
                    { label: 'Convenio aplicable', value: contract.collectiveAgreement || 'Hostelería Tarragona' },
                    { label: 'Coste/hora', value: contract.hourlyWage ? `${contract.hourlyWage}€/h` : '—' },
                    { label: 'Vigencia', value: `Desde ${new Date(contract.startDate).toLocaleDateString('es-ES')}${contract.endDate ? ` hasta ${new Date(contract.endDate).toLocaleDateString('es-ES')}` : ' (indefinido)'}` },
                  ]} />
                </SectionCard>

                <VacationConfigCard emp={emp} onSaved={() => router.refresh()} />

                <LegalFrameworkCard emp={emp} allRoles={allRoles} legalFrameworks={legalFrameworks} onSaved={() => router.refresh()} />

                <SectionCard title="Preferencias de jornada">
                  <div className="space-y-3">
                    <PreferencePill
                      active={preferContinuous}
                      icon="🔄"
                      label="Preferencia por jornada continua"
                      desc="Se intentará asignar turnos sin partir siempre que sea posible"
                    />
                    <PreferencePill
                      active={allowSplit}
                      icon="✂️"
                      label="Acepta jornadas partidas"
                      desc="Puede trabajar en dos tramos (3–5h por tramo, 3–5h de descanso entre ellos). Si se desactiva, el solver nunca le partirá la jornada."
                    />
                    <div className="text-[11px] text-gray-400 bg-gray-50 rounded-xl p-3 border border-gray-200">
                      📋 <strong>Convenio hostelería Tarragona:</strong> Jornada partida → mínimo 3h por tramo, máximo 5h por tramo, descanso entre tramos entre 3h y 5h, total diario ≤ 9h ordinarias.
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Horas extras y nocturnidad">
                  <InfoGrid rows={[
                    { label: 'Horas extra', value: 'Máximo 80h/año (Estatuto Trabajadores)' },
                    { label: 'Nocturnidad', value: 'Tramos entre 22:00 y 06:00 computan como nocturno' },
                    { label: 'Descanso semanal', value: '2 días consecutivos obligatorios (convenio)' },
                  ]} />
                </SectionCard>
              </>
            ) : (
              <EmptyState
                icon={<FileText size={32} className="text-gray-200" />}
                title="Sin contrato configurado"
                desc="Define el contrato para que el planificador respete las horas y restricciones legales"
                action={<EditBtn label="Crear contrato" onClick={() => setEditContract(true)} />}
              />
            )}
          </div>
        )}

        {/* ══ TAB: ROLES Y ETIQUETAS ══ */}
        {tab === 'roles' && (
          <div className="max-w-2xl space-y-4">
            <SectionCard
              title="Rol laboral"
              action={<EditBtn onClick={() => setEditRoles(true)} />}
            >
              {/* Jerarquía visual — solo la del grupo al que pertenece */}
              <div className="mb-4">
                {mainRole ? (
                  <>
                    <p className="text-[12px] text-gray-500 mb-3">
                      Dentro de <strong>{mainRole.group?.name ?? 'su grupo'}</strong> los roles son acumulativos:
                      puede ejercer el suyo y todos los de rango inferior. Nunca cubre demanda de otro grupo.
                    </p>
                    <div className="flex items-center gap-0 flex-wrap">
                      {rolesOfMainGroup.map((role: any, i: number) => {
                        const isActive = (role.rank ?? 0) <= (mainRole.rank ?? 0)
                        return (
                          <div key={role.id} className="flex items-center">
                            <div className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
                              isActive ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-400'
                            )}
                              style={isActive ? { backgroundColor: role.color } : {}}>
                              {isActive && <CheckCircle size={10} />}
                              {role.name}
                            </div>
                            {i < rolesOfMainGroup.length - 1 && (
                              <div className={cn('w-6 h-0.5 mx-0.5',
                                (role.rank ?? 0) < (mainRole.rank ?? 0) ? 'bg-gray-400' : 'bg-gray-200')} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-[12px] text-gray-400">
                    Sin rol asignado. El solver no podrá planificarle hasta que le asignes uno.
                  </p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Etiquetas / habilidades">
              <p className="text-[12px] text-gray-500 mb-3">
                Las etiquetas determinan en qué slots puede estar este empleado. Basta con que <strong>1 persona</strong> en el turno tenga la etiqueta requerida.
              </p>
              <div className="flex flex-wrap gap-2">
                {allSkills.map((skill: any) => {
                  const has = empSkillIds.includes(skill.id)
                  return (
                    <div
                      key={skill.id}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-[12px] font-semibold border-2 transition-all',
                        has ? 'text-white border-transparent shadow-sm' : 'bg-white border-gray-200 text-gray-400'
                      )}
                      style={has ? { backgroundColor: skill.color, borderColor: skill.color } : {}}
                    >
                      {has && '✓ '}{skill.name}
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ══ TAB: RESTRICCIONES ══ */}
        {tab === 'restrictions' && (
          <div className="max-w-3xl space-y-4">

            {/* Visual semanal de disponibilidad */}
            <SectionCard title="Vista semanal de disponibilidad">
              <p className="text-[12px] text-gray-500 mb-3">
                Verde = disponible · Rojo = no disponible · Gris = sin restricción específica
              </p>
              <WeekAvailabilityGrid availabilities={emp.availabilities || []} />
            </SectionCard>

            {/* Lista restricciones */}
            <SectionCard
              title="Restricciones configuradas"
              action={
                <button
                  onClick={() => setRestrictionModal('create')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors"
                >
                  <Plus size={13} /> Añadir
                </button>
              }
            >
              {emp.availabilities?.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <Clock size={28} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-[13px]">Sin restricciones — puede trabajar en cualquier franja</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {emp.availabilities.map((av: any) => {
                    const type = AVAIL_TYPES.find(t => t.value === av.type) || AVAIL_TYPES[0]
                    const dayLabel = av.dayOfWeek !== null && av.dayOfWeek !== undefined
                      ? DAYS_ES[av.dayOfWeek]
                      : 'Todos los días'
                    return (
                      <div
                        key={av.id}
                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors"
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[16px] flex-shrink-0"
                          style={{ backgroundColor: type.color + '20' }}
                        >
                          {type.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-gray-800">
                            {type.label}
                            <span className="ml-2 text-[11px] font-normal text-gray-500">
                              {dayLabel}
                              {av.startTime && ` · ${av.startTime}`}
                              {av.endTime && ` – ${av.endTime}`}
                            </span>
                          </div>
                          {av.notes && <div className="text-[11px] text-gray-400 mt-0.5">{av.notes}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setRestrictionModal(av)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => {
                              startTransition(async () => {
                                await deleteAvailability(av.id, emp.id)
                                toast.success('Restricción eliminada')
                                router.refresh()
                              })
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>

            {/* Ejemplos rápidos */}
            <SectionCard title="Restricciones frecuentes">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'No trabaja fines de semana', type: 'DAY_OFF', days: [5, 6], icon: '🏠' },
                  { label: 'No trabaja L-J', type: 'DAY_OFF', days: [0,1,2,3], icon: '📚' },
                  { label: 'Solo hasta las 22:00', type: 'NOT_AFTER', time: '22:00', icon: '🌙' },
                  { label: 'Solo desde las 08:00', type: 'NOT_BEFORE', time: '08:00', icon: '☀️' },
                  { label: 'Solo mañanas (8-16)', type: 'ONLY_BETWEEN', start: '08:00', end: '16:00', icon: '⏰' },
                  { label: 'Domingo libre', type: 'DAY_OFF', days: [6], icon: '🙏' },
                ].map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => setRestrictionModal('create')}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-gray-300 text-[12px] text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all text-left"
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ══ TAB: HISTORIAL ══ */}
        {tab === 'history' && (
          <div className="max-w-2xl space-y-4">
            <SectionCard title="Últimos 30 días">
              {emp.assignments?.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-[13px]">Sin turnos en los últimos 30 días</div>
              ) : (
                <div className="space-y-2">
                  {emp.assignments.map((a: any) => {
                    const h = (() => {
                      const s = a.startTime.split(':').map(Number)
                      let e = a.endTime.split(':').map(Number)
                      const sm = s[0]*60+s[1], em = e[0]*60+e[1]
                      return Math.max(0, ((em <= sm ? em+24*60 : em) - sm - a.breakMinutes) / 60)
                    })()
                    return (
                      <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
                        <div className="text-center w-12">
                          <div className="text-[11px] font-bold text-indigo-600">
                            {new Date(a.date).toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase()}
                          </div>
                          <div className="text-[13px] font-bold text-gray-800">
                            {new Date(a.date).getDate()}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-[13px] font-semibold text-gray-800">
                            {a.startTime} – {a.endTime}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {h.toFixed(1)}h · {a.origin === 'AUTOMATIC' ? '🤖 Auto' : '✏️ Manual'}
                            {a.isSplit && ' · Partido'}
                          </div>
                        </div>
                        <div className={cn(
                          'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                          a.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        )}>
                          {a.status === 'PUBLISHED' ? 'Publicado' : 'Borrador'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </div>

      {/* ══ MODALES ══ */}

      {showDelete && (
        <DeleteEmployeeModal
          emp={emp}
          onClose={() => setShowDelete(false)}
          onArchive={() => {
            startTransition(async () => {
              await setEmployeeStatus(emp.id, 'ARCHIVED' as any)
              toast.success('Empleado archivado')
              setShowDelete(false)
              router.refresh()
            })
          }}
          onDeleted={() => router.push('/employees')}
        />
      )}

      {editInfo && (
        <EditInfoModal
          emp={emp}
          onClose={() => setEditInfo(false)}
          onSaved={() => { setEditInfo(false); router.refresh() }}
        />
      )}

      {editContract && (
        <EditContractModal
          emp={emp}
          contract={contract}
          preferContinuous={preferContinuous}
          allowSplit={allowSplit}
          onClose={() => setEditContract(false)}
          onSaved={() => { setEditContract(false); router.refresh() }}
        />
      )}

      {editRoles && (
        <EditRolesModal
          emp={emp}
          allSkills={allSkills}
          allRoles={allRoles}
          currentRoleId={mainRoleId}
          currentSkillIds={empSkillIds}
          onClose={() => setEditRoles(false)}
          onSaved={() => { setEditRoles(false); router.refresh() }}
        />
      )}

      {restrictionModal !== null && (
        <EditRestrictionModal
          employeeId={emp.id}
          restriction={restrictionModal === 'create' ? null : restrictionModal}
          onClose={() => setRestrictionModal(null)}
          onSaved={() => { setRestrictionModal(null); router.refresh() }}
        />
      )}
    </div>
  )
}

// ═══ CARD: PIN de acceso al portal de empleado ═══════════════════════════════════════════
function PinCard({ emp, onSaved }: { emp: any; onSaved: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [showPinForm, setShowPinForm] = useState(false)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [linkData, setLinkData] = useState<any | null>(null)
  const hasPin = !!emp.pin

  function handleSetPin() {
    setError('')
    if (!/^\d{4,6}$/.test(pin)) { setError('PIN debe ser 4-6 dígitos numéricos'); return }
    if (pin !== confirmPin) { setError('Los PINs no coinciden'); return }
    startTransition(async () => {
      try {
        await setEmployeePin(emp.id, pin)
        toast.success('PIN configurado ✓')
        setShowPinForm(false)
        setPin(''); setConfirmPin('')
        onSaved()
      } catch (e: any) { setError(e.message) }
    })
  }

  function handleGetLink() {
    startTransition(async () => {
      try {
        const baseUrl = window.location.origin
        const data = await getEmployeeLoginLink(emp.id, baseUrl)
        setLinkData(data)
      } catch (e: any) { toast.error(e.message) }
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <h3 className="text-[13px] font-bold text-gray-800">Portal de empleado</h3>
        <div className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', hasPin ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200')}>
          {hasPin ? '✓ PIN configurado' : 'Sin acceso'}
        </div>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-[12px] text-gray-500">
          El empleado accede al portal con un PIN de 4-6 dígitos en la URL del restaurante. Solo tú (el manager) puedes asignar o cambiar el PIN.
        </p>

        {!showPinForm ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPinForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              <Pencil size={12} /> {hasPin ? 'Cambiar PIN' : 'Asignar PIN'}
            </button>
            {hasPin && (
              <>
                <button onClick={handleGetLink} disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  🔗 Generar link de invitación
                </button>
                <button onClick={() => startTransition(async () => {
                  if (!confirm('¿Quitar el acceso al portal de este empleado?')) return
                  await removeEmployeePin(emp.id)
                  toast.success('Acceso eliminado')
                  onSaved()
                })} className="p-1.5 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">PIN (4-6 dígitos)</label>
                <input type="password" inputMode="numeric" maxLength={6}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-center tracking-widest"
                  value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Confirmar PIN</label>
                <input type="password" inputMode="numeric" maxLength={6}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-center tracking-widest"
                  value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••" />
              </div>
            </div>
            {error && <p className="text-[11px] text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setShowPinForm(false); setPin(''); setConfirmPin(''); setError('') }}
                className="px-3 py-1.5 rounded-lg text-[12px] text-gray-500 hover:bg-gray-100 transition-colors">Cancelar</button>
              <button onClick={handleSetPin} disabled={isPending || !pin || !confirmPin}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                Guardar PIN
              </button>
            </div>
          </div>
        )}

        {/* Link de invitación generado */}
        {linkData && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
            <div className="text-[11px] font-bold text-emerald-700">Link listo para compartir</div>
            <code className="block text-[11px] text-emerald-800 bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5 break-all">
              {linkData.url}
            </code>
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard.writeText(linkData.url); toast.success('Link copiado ✓') }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 transition-colors">
                📋 Copiar link
              </button>
              <button onClick={() => {
                const msg = `Hola ${emp.firstName}! 👋

Accede a tu portal de turnos aquí:
${linkData.url}

Tu PIN de acceso es el que te he dado en persona.

${linkData.organizationName}`
                navigator.clipboard.writeText(msg)
                toast.success('Mensaje copiado — pega en WhatsApp ✓')
              }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-50 transition-colors">
                💬 Copiar mensaje WhatsApp
              </button>
            </div>
            <p className="text-[10px] text-emerald-600">Recuerda: comunica el PIN al empleado en persona o por WhatsApp.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══ CARD: Marco legal del empleado ═══════════════════════════════════════════
function LegalFrameworkCard({ emp, allRoles, legalFrameworks, onSaved }: { emp: any; allRoles: any[]; legalFrameworks: any[]; onSaved: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [skipValidation, setSkipValidation] = useState(emp.skipLegalValidation ?? false)
  const [frameworkId, setFrameworkId] = useState(emp.legalFrameworkId ?? '')
  const [saved, setSaved] = useState(false)

  const hasChanges = skipValidation !== emp.skipLegalValidation || frameworkId !== (emp.legalFrameworkId ?? '')

  function handleSave() {
    startTransition(async () => {
      try {
        await setEmployeeFramework(emp.id, frameworkId || null, skipValidation)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        onSaved()
      } catch (e: any) { toast.error((e as Error).message) }
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <h3 className="text-[13px] font-bold text-gray-800">Marco legal aplicable</h3>
        {hasChanges && (
          <button onClick={handleSave} disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isPending ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
          </button>
        )}
      </div>
      <div className="p-5 space-y-4">

        {/* Toggle: sin validación */}
        <div
          className={cn('flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all',
            skipValidation ? 'border-amber-300 bg-amber-50' : 'border-gray-200')}
          onClick={() => setSkipValidation(!skipValidation)}>
          <div className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0 mt-0.5', skipValidation ? 'bg-amber-500' : 'bg-gray-200')}>
            <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', skipValidation ? 'left-5' : 'left-0.5')} />
          </div>
          <div>
            <div className="text-[13px] font-medium text-gray-700">
              {skipValidation ? '⚠️ Sin validación legal' : 'Aplicar validación legal'}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              Útil para socios, propietarios o figuras que no son trabajadores al uso. Desactiva todos los avisos legales para este empleado.
            </div>
          </div>
        </div>

        {/* Selector de marco */}
        {!skipValidation && (
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Marco legal específico
            </label>
            <p className="text-[11px] text-gray-400 mb-2">
              Si no seleccionas ninguno, se aplicará el marco por defecto de la organización.
            </p>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={frameworkId}
              onChange={e => setFrameworkId(e.target.value)}>
              <option value="">— Usar el marco de la organización —</option>
              {legalFrameworks.filter((f: any) => f.isActive).map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.name} {f.province ? `· ${f.province}` : ''} {f.scope === 'NACIONAL' ? '(Nacional)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1.5">
              Los marcos legales disponibles los gestiona el Super Admin en el panel de administración.
            </p>
          </div>
        )}

        {/* Estado actual */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-[11px] text-gray-600">
          <span className="font-semibold">Estado actual: </span>
          {emp.skipLegalValidation
            ? '⚠️ Sin validación — este empleado no genera alertas legales'
            : emp.legalFrameworkId
              ? `Marco individual asignado: ${emp.legalFramework?.name ?? emp.legalFrameworkId}`
              : '✓ Usando el marco por defecto de la organización'}
        </div>
      </div>
    </div>
  )
}

// ═══ CARD: Configuración de vacaciones ═══════════════════════════════════════════
function VacationConfigCard({ emp, onSaved }: { emp: any; onSaved: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [tipo, setTipo] = useState<'NATURALES' | 'LABORABLES'>(emp.vacationDaysType ?? 'NATURALES')
  const [dias, setDias] = useState(emp.vacationDaysPerYear ?? 23)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    startTransition(async () => {
      try {
        await updateEmployeeVacationConfig(emp.id, tipo, dias)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        onSaved()
      } catch (e: any) {
        console.error(e)
      }
    })
  }

  const hasChanges = tipo !== emp.vacationDaysType || dias !== emp.vacationDaysPerYear

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <h3 className="text-[13px] font-bold text-gray-800">Configuración de vacaciones</h3>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? <span className="text-[11px]">Guardando...</span> : saved ? '✓ Guardado' : 'Guardar cambios'}
          </button>
        )}
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Tipo de cómputo
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { val: 'NATURALES', label: '🌿 Días naturales', desc: 'Incluye sábados, domingos y festivos. Convenio estándar hostelería Tarragona: 23 días.' },
              { val: 'LABORABLES', label: '💼 Días laborables', desc: 'Solo cuenta días de lunes a viernes. Más días efectivos de descanso.' },
            ] as const).map(opt => (
              <button
                key={opt.val}
                onClick={() => setTipo(opt.val)}
                className={cn(
                  'flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all',
                  tipo === opt.val ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'
                )}
              >
                <div className={cn('text-[13px] font-bold', tipo === opt.val ? 'text-indigo-700' : 'text-gray-700')}>
                  {opt.label}
                </div>
                <div className="text-[11px] text-gray-500">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Días de vacaciones anuales
          </label>
          <div className="flex items-center gap-3">
            <button onClick={() => setDias((d: number) => Math.max(1, d - 1))}
              className="w-9 h-9 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors text-[18px]">
              −
            </button>
            <div className="text-center">
              <div className="text-[28px] font-bold text-gray-900">{dias}</div>
              <div className="text-[11px] text-gray-400">{tipo === 'NATURALES' ? 'días naturales' : 'días laborables'}</div>
            </div>
            <button onClick={() => setDias((d: any) => Math.min(60, d + 1))}
              className="w-9 h-9 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors text-[18px]">
              +
            </button>
            <div className="ml-4 flex flex-col gap-1">
              <button onClick={() => setDias(23)} className={cn('text-[11px] px-2.5 py-1 rounded-lg border transition-colors', dias === 23 ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'text-gray-500 border-gray-200 hover:border-gray-300')}>23d convenio</button>
              <button onClick={() => setDias(30)} className={cn('text-[11px] px-2.5 py-1 rounded-lg border transition-colors', dias === 30 ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'text-gray-500 border-gray-200 hover:border-gray-300')}>30d estándar</button>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Convenio hostelería Tarragona: <strong>23 días naturales</strong> por año de antigüedad.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-componentes reutilizables ─────────────────────────────────────────────
function SectionCard({ title, action, children }: any) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <h3 className="text-[13px] font-bold text-gray-800">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function EditBtn({ onClick, label = 'Editar' }: any) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-600 transition-all">
      <Pencil size={12} /> {label}
    </button>
  )
}

function InfoGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-0 divide-y divide-gray-100">
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between py-2.5">
          <span className="text-[12px] text-gray-500">{r.label}</span>
          <span className="text-[13px] font-medium text-gray-800">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function PreferencePill({ active, icon, label, desc }: any) {
  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-xl border', active ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200')}>
      <span className="text-[18px] mt-0.5">{icon}</span>
      <div>
        <div className={cn('text-[13px] font-semibold', active ? 'text-emerald-800' : 'text-gray-400')}>
          {active ? '✓ ' : '✗ '}{label}
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">{desc}</div>
      </div>
    </div>
  )
}

function EmptyState({ icon, title, desc, action }: any) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
      <div className="flex justify-center mb-3">{icon}</div>
      <h3 className="text-[14px] font-semibold text-gray-700 mb-1">{title}</h3>
      <p className="text-[12px] text-gray-400 mb-4">{desc}</p>
      {action}
    </div>
  )
}

function WeekAvailabilityGrid({ availabilities }: { availabilities: any[] }) {
  const hours = ['06', '08', '10', '12', '14', '16', '18', '20', '22', '00']
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr>
            <th className="text-left font-medium text-gray-400 pb-2 w-16"></th>
            {hours.map(h => <th key={h} className="text-center font-medium text-gray-400 pb-2">{h}:00</th>)}
          </tr>
        </thead>
        <tbody>
          {[0,1,2,3,4,5,6].map(day => {
            const dayAvails = availabilities.filter((a: any) =>
              a.dayOfWeek === day || a.dayOfWeek === null
            )
            const isFullOff = dayAvails.some((a: any) => a.type === 'DAY_OFF' && !a.startTime)
            return (
              <tr key={day}>
                <td className="pr-2 py-1 font-semibold text-gray-600 whitespace-nowrap">
                  {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][day]}
                </td>
                {hours.map((h, hi) => {
                  const bg = isFullOff ? 'bg-red-100' : 'bg-emerald-50'
                  return (
                    <td key={h} className="px-0.5 py-1">
                      <div className={cn('h-6 rounded', bg, 'border border-white')} />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ═══ MODAL: Editar info personal ═════════════════════════════════════════════
function EditInfoModal({ emp, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    firstName: emp.firstName || '',
    lastName: emp.lastName || '',
    email: emp.email || '',
    phone: emp.phone || '',
    hireDate: emp.hireDate ? new Date(emp.hireDate).toISOString().split('T')[0] : '',
    terminationDate: emp.terminationDate ? new Date(emp.terminationDate).toISOString().split('T')[0] : '',
    notes: emp.notes || '',
  })

  return (
    <Modal title="Editar información personal" onClose={onClose}>
      <div className="space-y-4">
        {/* Avatar (el color se hereda del rol, no es editable aquí) */}
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
          <div className="w-12 h-12 rounded-xl shadow-md text-white font-bold flex items-center justify-center text-[15px]"
            style={{ backgroundColor: employeeColor(emp) }}>
            {form.firstName?.[0]}{form.lastName?.[0]}
          </div>
          <div className="text-[12px] text-gray-500">
            El color se asigna automáticamente según el rol del empleado
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre *"><input className={inputCls()} value={form.firstName} onChange={e => setForm((f: any) => ({ ...f, firstName: e.target.value }))} /></Field>
          <Field label="Apellidos *"><input className={inputCls()} value={form.lastName} onChange={e => setForm((f: any) => ({ ...f, lastName: e.target.value }))} /></Field>
        </div>
        <Field label="Email"><input type="email" className={inputCls()} value={form.email} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono"><input className={inputCls()} value={form.phone} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} /></Field>
          <Field label="Fecha alta"><input type="date" className={inputCls()} value={form.hireDate} onChange={e => setForm((f: any) => ({ ...f, hireDate: e.target.value }))} /></Field>
        </div>
        <Field label="Fecha de baja">
          <input type="date" className={inputCls()} value={form.terminationDate}
            onChange={e => setForm((f: any) => ({ ...f, terminationDate: e.target.value }))} />
          <p className="mt-1 text-[11px] text-gray-400">
            Déjalo vacío si sigue de alta. Fuera de este rango el empleado no cuenta en cobertura,
            no se le pueden asignar turnos y el solver lo ignora — pero su histórico se conserva.
          </p>
        </Field>
        <Field label="Notas internas"><textarea className={inputCls() + ' resize-none h-20'} value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} placeholder="Observaciones sobre el empleado..." /></Field>
      </div>
      <ModalFooter onClose={onClose} onSave={() => startTransition(async () => {
        try {
          await upsertEmployee({ id: emp.id, organizationId: emp.organizationId, ...form })
          toast.success('Datos actualizados ✓')
          onSaved()
        } catch (e: any) { toast.error(e.message) }
      })} isPending={isPending} />
    </Modal>
  )
}

// ═══ MODAL: Editar contrato ═══════════════════════════════════════════════════
function EditContractModal({ emp, contract, preferContinuous: pc, allowSplit: as_, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    contractType: contract?.contractType || 'FULL_TIME',
    weeklyHours: contract?.weeklyHours || 40,
    hasRange: !!(contract?.minWeeklyHours),
    minWeeklyHours: contract?.minWeeklyHours || 36,
    maxWeeklyHours: contract?.maxWeeklyHours || 44,
    maxDailyHours: contract?.maxDailyHours || 9,
    maxConsecutiveDays: contract?.maxConsecutiveDays || 6,
    minRestBetweenShifts: contract?.minRestBetweenShifts || 12,
    annualMaxHours: contract?.annualMaxHours || 1791,
    preferContinuous: pc,
    allowSplit: as_,
    hourlyWage: contract?.hourlyWage || '',
    collectiveAgreement: contract?.collectiveAgreement || 'Hostelería Tarragona',
    startDate: contract?.startDate ? new Date(contract.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    endDate: contract?.endDate ? new Date(contract.endDate).toISOString().split('T')[0] : '',
  })

  function Toggle({ label, desc, value, onChange }: any) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer hover:border-indigo-300 transition-colors" onClick={() => onChange(!value)}>
        <div className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0 mt-0.5', value ? 'bg-indigo-600' : 'bg-gray-300')}>
          <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', value ? 'left-5' : 'left-0.5')} />
        </div>
        <div>
          <div className="text-[13px] font-medium text-gray-700">{label}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{desc}</div>
        </div>
      </div>
    )
  }

  return (
    <Modal title={contract ? 'Editar contrato' : 'Crear contrato'} wide onClose={onClose}>
      <div className="space-y-5">

        {/* Tipo y horas */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo de contrato">
            <select className={inputCls()} value={form.contractType} onChange={e => setForm((f: any) => ({ ...f, contractType: e.target.value }))}>
              {CONTRACT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Horas semanales" hint="Horas del contrato">
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={48} className={inputCls()} value={form.weeklyHours}
                onChange={e => setForm((f: any) => ({ ...f, weeklyHours: +e.target.value }))} />
              <span className="text-[12px] text-gray-400 whitespace-nowrap">h/sem</span>
            </div>
          </Field>
        </div>

        {/* Horquilla */}
        <div>
          <Toggle
            label="Horquilla horaria (horas variables)"
            desc="Permite que el sistema use más o menos horas que las del contrato para ajustar el cuadrante"
            value={form.hasRange}
            onChange={(v: boolean) => setForm((f: any) => ({ ...f, hasRange: v }))}
          />
          {form.hasRange && (
            <div className="grid grid-cols-2 gap-3 mt-3 pl-3 border-l-2 border-indigo-200">
              <Field label="Mínimo obligatorio">
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={48} className={inputCls()} value={form.minWeeklyHours}
                    onChange={e => setForm((f: any) => ({ ...f, minWeeklyHours: +e.target.value }))} />
                  <span className="text-[12px] text-gray-400">h</span>
                </div>
              </Field>
              <Field label="Máximo utilizable">
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={48} className={inputCls()} value={form.maxWeeklyHours}
                    onChange={e => setForm((f: any) => ({ ...f, maxWeeklyHours: +e.target.value }))} />
                  <span className="text-[12px] text-gray-400">h</span>
                </div>
              </Field>
            </div>
          )}
        </div>

        {/* Límites legales */}
        <div>
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Límites legales (convenio)</div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Máx. horas/día" hint="Convenio: 9h">
              <input type="number" min={4} max={12} className={inputCls()} value={form.maxDailyHours}
                onChange={e => setForm((f: any) => ({ ...f, maxDailyHours: +e.target.value }))} />
            </Field>
            <Field label="Descanso entre jornadas" hint="Convenio: 12h">
              <input type="number" min={10} max={24} className={inputCls()} value={form.minRestBetweenShifts}
                onChange={e => setForm((f: any) => ({ ...f, minRestBetweenShifts: +e.target.value }))} />
            </Field>
            <Field label="Máx. días seguidos" hint="Recomendado: 6">
              <input type="number" min={1} max={7} className={inputCls()} value={form.maxConsecutiveDays}
                onChange={e => setForm((f: any) => ({ ...f, maxConsecutiveDays: +e.target.value }))} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Horas anuales máximas" hint="Convenio hostelería Tarragona: 1.791h">
              <input type="number" className={inputCls()} value={form.annualMaxHours}
                onChange={e => setForm((f: any) => ({ ...f, annualMaxHours: +e.target.value }))} />
            </Field>
          </div>
        </div>

        {/* Preferencias jornada */}
        <div>
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Preferencias de jornada</div>
          <div className="space-y-2">
            <Toggle
              label="Preferir jornada continua"
              desc="El sistema intentará no partir su jornada cuando sea posible"
              value={form.preferContinuous}
              onChange={(v: boolean) => setForm((f: any) => ({ ...f, preferContinuous: v }))}
            />
            <Toggle
              label="Acepta jornadas partidas"
              desc="Tramos 3–5h, ≥1.5h de descanso entre ellos, total ≤9h/día"
              value={form.allowSplit}
              onChange={(v: boolean) => setForm((f: any) => ({ ...f, allowSplit: v }))}
            />
          </div>
        </div>

        {/* Datos económicos */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Coste/hora (€)" hint="Para estimaciones de coste">
            <input type="number" step="0.01" className={inputCls()} value={form.hourlyWage}
              onChange={e => setForm((f: any) => ({ ...f, hourlyWage: e.target.value }))} placeholder="Ej: 12.50" />
          </Field>
          <Field label="Convenio colectivo">
            <input className={inputCls()} value={form.collectiveAgreement}
              onChange={e => setForm((f: any) => ({ ...f, collectiveAgreement: e.target.value }))} />
          </Field>
        </div>

        {/* Vigencia */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha inicio"><input type="date" className={inputCls()} value={form.startDate} onChange={e => setForm((f: any) => ({ ...f, startDate: e.target.value }))} /></Field>
          <Field label="Fecha fin (opcional)"><input type="date" className={inputCls()} value={form.endDate} onChange={e => setForm((f: any) => ({ ...f, endDate: e.target.value }))} /></Field>
        </div>
      </div>

      <ModalFooter onClose={onClose} onSave={() => startTransition(async () => {
        try {
          await upsertContract({
            id: contract?.id,
            employeeId: emp.id,
            ...form,
            minWeeklyHours: form.hasRange ? form.minWeeklyHours : null,
            maxWeeklyHours: form.hasRange ? form.maxWeeklyHours : null,
            hourlyWage: form.hourlyWage ? +form.hourlyWage : null,
            endDate: form.endDate || null,
          })
          toast.success('Contrato guardado ✓')
          onSaved()
        } catch (e: any) { toast.error(e.message) }
      })} isPending={isPending} />
    </Modal>
  )
}

// ═══ MODAL: Editar roles y skills ══════════════════════════════════════════════
function EditRolesModal({ emp, allSkills, allRoles, currentRoleId, currentSkillIds, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  // Se selecciona por ID. Antes se guardaba el `level`, y como varios roles
  // comparten nivel (Camarero y Cocinero son ambos BASIC) se seleccionaban
  // todos a la vez y los roles nuevos no se distinguían.
  const [roleId, setRoleId] = useState<string | null>(currentRoleId ?? null)
  const [skillIds, setSkillIds] = useState<string[]>(currentSkillIds)

  function toggleSkill(id: string) {
    setSkillIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  // Roles agrupados por familia, cada una ordenada de menor a mayor rango.
  const grouped = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string; roles: any[] }>()
    for (const r of allRoles) {
      const gid = r.groupId ?? r.group?.id ?? '__none__'
      const prev = map.get(gid) ?? {
        id: gid,
        name: r.group?.name ?? 'Sin grupo',
        color: r.group?.color ?? '#9ca3af',
        roles: [],
      }
      prev.roles.push(r)
      map.set(gid, prev)
    }
    const out = Array.from(map.values())
    out.sort((a, b) => a.name.localeCompare(b.name))
    for (const g of out) {
      g.roles.sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0) || a.name.localeCompare(b.name))
    }
    return out
  }, [allRoles])

  /** Qué puede cubrir este rol: él mismo y los inferiores DE SU GRUPO. */
  function coverageDesc(role: any, groupRoles: any[]): string {
    const below = groupRoles.filter((r: any) => (r.rank ?? 0) < (role.rank ?? 0))
    if (below.length === 0) return 'Nivel base del grupo — solo su propio rol'
    return `También puede ejercer como ${below.map((r: any) => r.name).join(', ')}`
  }

  return (
    <Modal title="Roles y etiquetas" wide onClose={onClose}>
      <div className="space-y-5">
        {/* Rol */}
        <div>
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Rol principal</div>
          <p className="text-[12px] text-gray-500 mb-3">
            Cada empleado pertenece a <strong>un solo grupo</strong>. Dentro de su grupo los roles son
            acumulativos, pero nunca puede cubrir demanda de otro grupo.
          </p>

          {grouped.length === 0 && (
            <p className="text-[12px] text-gray-400 py-3">
              No hay roles configurados. Créalos en Ajustes → Etiquetas y roles.
            </p>
          )}

          <div className="space-y-4">
            {grouped.map(group => (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                  <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">{group.name}</span>
                  <span className="text-[10px] text-gray-400">
                    · {group.roles.length} rol{group.roles.length === 1 ? '' : 'es'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.roles.map((role: any) => {
                    const selected = roleId === role.id
                    return (
                      <button
                        key={role.id}
                        onClick={() => setRoleId(role.id)}
                        className={cn(
                          'flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all',
                          selected
                            ? 'border-transparent text-white shadow-md'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        )}
                        style={selected ? { backgroundColor: role.color } : {}}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-bold">{role.name}</div>
                          <div className={cn('text-[11px] mt-0.5', selected ? 'opacity-80' : 'text-gray-400')}>
                            {coverageDesc(role, group.roles)}
                          </div>
                        </div>
                        {selected && <CheckCircle size={16} className="flex-shrink-0 mt-0.5 opacity-80" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Skills */}
        <div>
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Etiquetas / habilidades</div>
          <p className="text-[12px] text-gray-500 mb-3">
            Selecciona todas las funciones que puede desempeñar. El planificador lo usará para cubrir los slots que requieran etiquetas específicas.
          </p>
          <div className="flex flex-wrap gap-2">
            {allSkills.map((skill: any) => {
              const selected = skillIds.includes(skill.id)
              return (
                <button
                  key={skill.id}
                  onClick={() => toggleSkill(skill.id)}
                  className={cn(
                    'px-3 py-2 rounded-xl text-[12px] font-semibold border-2 transition-all',
                    selected ? 'text-white border-transparent shadow-sm scale-105' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  )}
                  style={selected ? { backgroundColor: skill.color, borderColor: skill.color } : {}}
                >
                  {selected ? '✓ ' : ''}{skill.name}
                </button>
              )
            })}
          </div>
          <div className="mt-2 text-[11px] text-gray-400">{skillIds.length} etiquetas seleccionadas</div>
        </div>
      </div>

      <ModalFooter onClose={onClose} onSave={() => startTransition(async () => {
        try {
          await setEmployeeSkills(emp.id, skillIds, roleId || null)
          toast.success('Roles y etiquetas guardados ✓')
          onSaved()
        } catch (e: any) { toast.error(e.message) }
      })} isPending={isPending} />
    </Modal>
  )
}

// ═══ MODAL: Editar restricción ════════════════════════════════════════════════
function EditRestrictionModal({ employeeId, restriction, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    type: (restriction?.type as any) || 'DAY_OFF',
    allDays: restriction?.dayOfWeek === null || restriction?.dayOfWeek === undefined,
    dayOfWeek: restriction?.dayOfWeek ?? 6,
    selectedDays: [] as number[],
    startTime: restriction?.startTime || '',
    endTime: restriction?.endTime || '',
    notes: restriction?.notes || '',
    isRecurring: restriction?.isRecurring ?? true,
  })

  const selectedType = AVAIL_TYPES.find(t => t.value === form.type)!
  const needsTime = ['NOT_BEFORE', 'NOT_AFTER', 'ONLY_BETWEEN'].includes(form.type)

  function toggleDay(d: number) {
    setForm((f: any) => ({
      ...f,
      selectedDays: f.selectedDays.includes(d) ? f.selectedDays.filter(x => x !== d) : [...f.selectedDays, d]
    }))
  }

  async function handleSave() {
    const days = form.allDays ? [null] : form.selectedDays.length > 0 ? form.selectedDays : [form.dayOfWeek]
    // Si son varios días, crear una restricción por día
    for (const day of days) {
      await upsertAvailability({
        id: days.length === 1 ? restriction?.id : undefined,
        employeeId,
        type: form.type,
        dayOfWeek: day,
        startTime: needsTime && form.startTime ? form.startTime : null,
        endTime: needsTime && ['NOT_AFTER', 'ONLY_BETWEEN'].includes(form.type) && form.endTime ? form.endTime : null,
        isRecurring: form.isRecurring,
        notes: form.notes,
      })
    }
  }

  return (
    <Modal title={restriction ? 'Editar restricción' : 'Nueva restricción'} onClose={onClose}>
      <div className="space-y-4">

        {/* Tipo */}
        <div>
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Tipo de restricción</div>
          <div className="space-y-1.5">
            {AVAIL_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setForm((f: any) => ({ ...f, type: t.value }))}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all',
                  form.type === t.value ? 'border-transparent text-white' : 'border-gray-200 bg-white hover:border-gray-300'
                )}
                style={form.type === t.value ? { backgroundColor: t.color } : {}}
              >
                <span className="text-[16px]">{t.icon}</span>
                <div>
                  <div className={cn('text-[13px] font-semibold', form.type !== t.value && 'text-gray-700')}>{t.label}</div>
                  <div className={cn('text-[11px]', form.type === t.value ? 'opacity-80' : 'text-gray-400')}>{t.desc}</div>
                </div>
                {form.type === t.value && <CheckCircle size={15} className="ml-auto flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Días */}
        <div>
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Días de la semana</div>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input type="checkbox" checked={form.allDays} onChange={e => setForm((f: any) => ({ ...f, allDays: e.target.checked }))}
              className="w-4 h-4 rounded accent-indigo-600" />
            <span className="text-[13px] text-gray-700">Todos los días</span>
          </label>
          {!form.allDays && (
            <div className="flex gap-2">
              {DAYS_SHORT.map((d, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={cn(
                    'w-9 h-9 rounded-xl text-[12px] font-bold transition-all',
                    form.selectedDays.includes(i)
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Horas (si aplica) */}
        {needsTime && (
          <div className="grid grid-cols-2 gap-3">
            {form.type !== 'NOT_AFTER' && (
              <Field label={form.type === 'NOT_BEFORE' ? 'No antes de' : 'Desde'}>
                <input type="time" className={inputCls()} value={form.startTime} onChange={e => setForm((f: any) => ({ ...f, startTime: e.target.value }))} />
              </Field>
            )}
            {['NOT_AFTER', 'ONLY_BETWEEN'].includes(form.type) && (
              <Field label={form.type === 'NOT_AFTER' ? 'No después de' : 'Hasta'}>
                <input type="time" className={inputCls()} value={form.endTime} onChange={e => setForm((f: any) => ({ ...f, endTime: e.target.value }))} />
              </Field>
            )}
          </div>
        )}

        {/* Notas */}
        <Field label="Notas (opcional)">
          <input className={inputCls()} value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))}
            placeholder="Ej: Recoge a los niños a las 17h" />
        </Field>
      </div>

      <ModalFooter onClose={onClose} onSave={() => startTransition(async () => {
        try {
          await handleSave()
          toast.success('Restricción guardada ✓')
          onSaved()
        } catch (e: any) { toast.error(e.message) }
      })} isPending={isPending} />
    </Modal>
  )
}

// ─── Modal wrapper genérico ────────────────────────────────────────────────────
function Modal({ title, wide, onClose, children }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div
        className={cn('relative bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]', wide ? 'w-full max-w-[620px]' : 'w-full max-w-[480px]')}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function ModalFooter({ onClose, onSave, isPending, saveLabel = 'Guardar cambios' }: any) {
  return (
    <div className="flex justify-between items-center pt-4 mt-2 border-t border-gray-100">
      <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">
        Cancelar
      </button>
      <button
        onClick={onSave}
        disabled={isPending}
        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
        {saveLabel}
      </button>
    </div>
  )
}

// ─── Selector de estado (Activo / Inactivo / Archivado) ───────────────────────
const STATUS_CONFIG = {
  ACTIVE:   { label: 'Activo',    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  INACTIVE: { label: 'Inactivo',  color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-400'  },
  ARCHIVED: { label: 'Archivado', color: 'text-gray-500',    bg: 'bg-gray-50',    border: 'border-gray-200',    dot: 'bg-gray-400'   },
}

function StatusSelector({ currentStatus, onSelect }: { currentStatus: string; onSelect: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CONFIG[currentStatus as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.ACTIVE
  const options = ['ACTIVE', 'INACTIVE', 'ARCHIVED'].filter(s => s !== currentStatus)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold border transition-colors',
          cfg.bg, cfg.border, cfg.color
        )}
      >
        <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
        {cfg.label}
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-20">
          {options.map(s => {
            const c = STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]
            return (
              <button
                key={s}
                onClick={() => { setOpen(false); onSelect(s) }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] font-medium hover:bg-gray-50 transition-colors',
                  c.color
                )}
              >
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', c.dot)} />
                {c.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Modal de borrado definitivo ──────────────────────────────────────────────
// Doble barrera: primero se enseña el histórico real que se va a destruir, y
// después hay que escribir el nombre completo para habilitar el botón. Es
// deliberadamente incómodo porque la acción no tiene vuelta atrás.
function DeleteEmployeeModal({
  emp, onClose, onArchive, onDeleted,
}: {
  emp: any
  onClose: () => void
  onArchive: () => void
  onDeleted: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [impact, setImpact] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmText, setConfirmText] = useState('')

  const fullName = `${emp.firstName} ${emp.lastName}`.trim()
  const matches = confirmText.trim().toLowerCase() === fullName.toLowerCase()

  useEffect(() => {
    let cancelled = false
    getEmployeeDeletionImpact(emp.id)
      .then(r => { if (!cancelled) { setImpact(r); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [emp.id])

  function handleDelete() {
    if (!matches) return
    startTransition(async () => {
      try {
        await deleteEmployee(emp.id)
        toast.success(`${fullName} borrado definitivamente`)
        onDeleted()
      } catch (err: any) {
        toast.error(err?.message || 'No se pudo borrar el empleado')
      }
    })
  }

  const rows = impact ? [
    { label: 'Turnos asignados', value: impact.assignments },
    { label: 'Fichajes', value: impact.timeClock },
    { label: 'Ausencias y vacaciones', value: impact.absences },
    { label: 'Restricciones de disponibilidad', value: impact.availabilities },
    { label: 'Contratos', value: impact.contracts },
    { label: 'Roles y habilidades', value: impact.skills },
  ].filter(r => r.value > 0) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] overflow-hidden">

        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-gray-900">¿Borrar a {fullName}?</h3>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Esta acción es permanente y no se puede deshacer.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-gray-400 py-2">
              <Loader2 size={14} className="animate-spin" /> Comprobando su histórico…
            </div>
          ) : rows.length > 0 ? (
            <div className="rounded-xl border border-red-100 bg-red-50/60 p-3">
              <p className="text-[12px] font-semibold text-red-800 mb-2">
                Se borrará también todo esto:
              </p>
              <div className="space-y-1">
                {rows.map(r => (
                  <div key={r.label} className="flex items-center justify-between text-[12px]">
                    <span className="text-red-700">{r.label}</span>
                    <span className="font-bold text-red-800 tabular-nums">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-gray-500">
              No tiene histórico asociado, así que el borrado no afectará a ningún cuadrante.
            </p>
          )}

          {rows.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[12px] text-amber-800 leading-snug">
                Si solo quieres que deje de aparecer, <strong>archívalo</strong>: desaparece de
                cuadrantes y métricas pero conserva el histórico para informes y nóminas.
              </p>
              <button
                onClick={onArchive}
                className="mt-2 text-[12px] font-semibold text-amber-800 underline hover:text-amber-900"
              >
                Archivar en su lugar
              </button>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1.5">
              Escribe <strong className="text-gray-900">{fullName}</strong> para confirmar
            </label>
            <input
              autoFocus
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && matches) handleDelete() }}
              placeholder={fullName}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-xl text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={!matches || isPending || loading}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors',
              matches && !isPending && !loading
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Borrar definitivamente
          </button>
        </div>
      </div>
    </div>
  )
}
