'use client'

import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, Loader2, CheckCircle, X,
  Trash2, Info, Copy, Save,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  saveWeekCoverage,
  copyWeeksCoverage,
} from '@/server/actions/coverageWeekly'
import { RoleRequirementsEditor, initialRoleRows, sortRoles, type RoleRow } from './RoleRequirementsEditor'

// ─── Constantes ───────────────────────────────────────────────────────────────
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const ALL_TIME_SLOTS_24H: string[] = []
for (let h = 0; h < 24; h++) {
  ALL_TIME_SLOTS_24H.push(`${String(h).padStart(2, '0')}:00`)
  ALL_TIME_SLOTS_24H.push(`${String(h).padStart(2, '0')}:30`)
}

function nextSlot(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const next = h * 60 + m + 30
  if (next >= 24 * 60) return '00:00'
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
}

// Parte un rango horario en franjas de 30 min. "00:00" de fin = medianoche siguiente.
// Opciones de hora en pasos de 30 min: "00:00", "00:30", ... "23:30".
// `includeMidnightEnd` añade "00:00" al final (medianoche del día siguiente) para el campo Fin.
function halfHourOptions(includeMidnightEnd = false): string[] {
  const out: string[] = []
  for (let m = 0; m < 24 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  if (includeMidnightEnd) out.push('00:00') // fin = medianoche
  return out
}

function splitIntoHalfHours(startTime: string, endTime: string): Array<{ start: string; end: string }> {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime === '00:00' ? [24, 0] : endTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  const out: Array<{ start: string; end: string }> = []
  const fmt = (m: number) => {
    const mm = m >= 24 * 60 ? m - 24 * 60 : m
    return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
  }
  for (let cur = startMin; cur < endMin; cur += 30) out.push({ start: fmt(cur), end: fmt(Math.min(cur + 30, endMin)) })
  return out
}

// Duración de un slot en horas. "00:00" como fin = medianoche del día siguiente.
function slotDurationHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime === '00:00' ? [24, 0] : endTime.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins > 0 ? mins / 60 : 0
}

// "880,5 h" — formato español, sin decimales innecesarios.
function fmtHours(h: number): string {
  return `${h.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`
}

function demandColor(min: number): { bg: string; text: string; border: string; bar: string } {
  if (min === 0) return { bg: '#f9fafb', text: '#9ca3af', border: '#f3f4f6', bar: '#e5e7eb' }
  if (min === 1) return { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', bar: '#22c55e' }
  if (min === 2) return { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', bar: '#3b82f6' }
  if (min === 3) return { bg: '#fefce8', text: '#854d0e', border: '#fef08a', bar: '#eab308' }
  if (min === 4) return { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa', bar: '#f97316' }
  return { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', bar: '#ef4444' }
}

// Selector de hora propio — sin <select> nativo para evitar que re-renders
// del componente padre cierren el desplegable antes de que el usuario elija.
function TimeSelect({ value, options, onChange, labelFor }: {
  value: string
  options: string[]
  onChange: (v: string) => void
  labelFor?: (v: string) => string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false)
  }

  function pick(v: string) {
    onChange(v)
    setOpen(false)
  }

  return (
    <div ref={ref} tabIndex={-1} onBlur={handleBlur} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-[13px] font-mono font-medium text-gray-800 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors"
      >
        {labelFor ? labelFor(value) : value}
        <svg className={cn("w-4 h-4 text-gray-400 transition-transform", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-lg border border-gray-200 max-h-52 overflow-y-auto py-1">
          {options.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => pick(t)}
              className={cn(
                "w-full text-left px-3 py-1.5 text-[13px] font-mono hover:bg-indigo-50 hover:text-indigo-700 transition-colors",
                t === value && "bg-indigo-100 text-indigo-700 font-bold"
              )}
            >
              {labelFor ? labelFor(t) : t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


function inputCls(err = false) {
  return cn(
    'w-full border rounded-xl px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:border-transparent',
    err ? 'border-red-300 focus:ring-red-300' : 'border-gray-200 focus:ring-indigo-300'
  )
}

function Field({ label, children }: any) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}

// ─── Helpers de fecha ─────────────────────────────────────────────────────────
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function fmtDayLabel(iso: string): { dayName: string; dayNum: number; month: string } {
  const d = new Date(iso + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7
  return { dayName: DAYS_SHORT[dow], dayNum: d.getUTCDate(), month: MONTHS_ES[d.getUTCMonth()] }
}

function isTodayISO(iso: string): boolean {
  const today = new Date()
  const todayISO = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0, 10)
  return iso === todayISO
}

function weekRangeLabel(weekStartISO: string): string {
  const start = new Date(weekStartISO + 'T00:00:00Z')
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6)
  const sameMonth = start.getUTCMonth() === end.getUTCMonth()
  const sd = start.getUTCDate(), ed = end.getUTCDate()
  const sm = MONTHS_ES[start.getUTCMonth()], em = MONTHS_ES[end.getUTCMonth()]
  const sy = start.getUTCFullYear(), ey = end.getUTCFullYear()
  if (sy !== ey) return `${sd} ${sm} ${sy} — ${ed} ${em} ${ey}`
  if (sameMonth) return `${sd} — ${ed} ${em} ${sy}`
  return `${sd} ${sm} — ${ed} ${em} ${sy}`
}

/** Nº de semana ISO 8601 de una fecha ISO (YYYY-MM-DD) */
function isoWeekNumber(iso: string): number {
  const d = new Date(iso + 'T00:00:00Z')
  const target = new Date(d)
  target.setUTCDate(target.getUTCDate() + 3 - ((target.getUTCDay() + 6) % 7))
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7))
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000))
}

/** Lunes de la semana que contiene una fecha ISO */
function mondayOfISO(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Slot {
  id: string
  date: string
  startTime: string
  endTime: string
  minWorkers: number
  idealWorkers: number
  laborRoleId?: string | null
  skillId?: string | null
  isRequired: boolean
  notes?: string | null
  laborRole?: any
  roleRequirements?: any[]
}

// Panel de detalle que aparece al pasar el ratón sobre un KPI.
// Usa position:fixed + getBoundingClientRect para escapar del overflow:hidden
// del contenedor de la página.
function HoverStat({ children, panel }: { children: React.ReactNode; panel: React.ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  function show() {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(8, Math.min(r.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 320))
    setPos({ top: r.bottom + 8, left })
  }

  return (
    <div ref={ref} onMouseEnter={show} onMouseLeave={() => setPos(null)}
      className="cursor-help border-b border-dashed border-gray-300 leading-none pb-1">
      {children}
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 60 }}
          className="w-[300px] bg-white rounded-2xl border border-gray-200 shadow-xl p-3.5 text-[12px] font-normal cursor-default">
          {panel}
        </div>
      )}
    </div>
  )
}

// Fila etiqueta/valor dentro de un panel de detalle.
function StatRow({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="flex items-center gap-1.5 text-gray-500 min-w-0">
        {color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
        <span className="truncate">{label}</span>
      </span>
      <span className={cn('flex-shrink-0 tabular-nums', strong ? 'font-bold text-gray-900' : 'text-gray-700')}>{value}</span>
    </div>
  )
}

// Empleado activo con su contrato vigente — se usa solo para calcular la
// capacidad semanal de la plantilla (KPI de horas).
interface StaffMember {
  id: string
  firstName: string
  lastName: string
  contracts?: Array<{
    weeklyHours: number
    minWeeklyHours?: number | null
    maxWeeklyHours?: number | null
  }>
}

interface Props {
  weekStartISO: string
  slots: Slot[]
  roles: any[]
  skills: any[]
  locationId: string
  organizationId: string
  staff?: StaffMember[]
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function CoverageWeeklyClient({
  weekStartISO, slots: initialSlots, roles, skills, locationId, organizationId,
  staff = [],
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null)
  const [addingSlot, setAddingSlot] = useState<{ date: string; time: string } | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showCopyWeeks, setShowCopyWeeks] = useState(false)
  const [showGearMenu, setShowGearMenu] = useState(false)

  // El menú del engranaje se cierra con onBlur del propio botón/menú —
  // sin listener global que provoque re-renders al hacer click en el modal.

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartISO, i)), [weekStartISO])

  // ── Borrador local ──────────────────────────────────────────────────────
  // `serverVersion` sube explícitamente solo después de guardar con éxito.
  // Así evitamos re-renders espurios por el array nuevo que llega en cada
  // render del server component (que cerrarían los <select> abiertos).
  const [serverVersion, setServerVersion] = useState(0)

  const serverSlots = useMemo(() => initialSlots.map((s: any) => ({
    ...s,
    date: (s.date as any as string).slice(0, 10),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [weekStartISO, serverVersion])

  const [draftSlots, setDraftSlots] = useState<Slot[]>(serverSlots)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraftSlots(initialSlots.map((s: any) => ({
      ...s,
      date: (s.date as any as string).slice(0, 10),
    })))
    setDirty(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartISO, serverVersion])

  const normalizedSlots = draftSlots

  const slotMap = useMemo(() => {
    const map = new Map<string, Slot>()
    for (const s of normalizedSlots) map.set(`${s.date}|${s.startTime}`, s)
    return map
  }, [normalizedSlots])

  // Color actual de cada rol (por id). El render de las barras usa SIEMPRE este
  // mapa en vez del color embebido en el slot, de modo que si se cambia el color
  // de un rol en configuración, las barras y la leyenda se actualizan solas.
  const roleColorById = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of roles) m.set(r.id, r.color)
    return m
  }, [roles])
  const roleColor = (rr: any) => roleColorById.get(rr.laborRoleId) ?? rr.laborRole?.color ?? '#9ca3af'
  const roleNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of roles) m.set(r.id, r.name)
    return m
  }, [roles])
  const roleName = (rr: any) => roleNameById.get(rr.laborRoleId) ?? rr.laborRole?.name ?? 'Rol'

  // ── Mutaciones del borrador (solo estado local; nada al backend) ──────────

  // Construye un objeto Slot local a partir de los datos del editor.
  function buildLocalSlot(date: string, startTime: string, endTime: string, roleRows: any[], isRequired: boolean, notes: string): Slot {
    const minWorkers = roleRows.reduce((a, r) => a + r.minWorkers, 0)
    const idealWorkers = roleRows.reduce((a, r) => a + r.idealWorkers, 0)
    return {
      id: `draft-${date}-${startTime}-${Math.random().toString(36).slice(2, 8)}`,
      date, startTime, endTime, minWorkers, idealWorkers,
      isRequired, notes,
      roleRequirements: roleRows.map(r => ({
        laborRoleId: r.laborRoleId,
        minWorkers: r.minWorkers,
        idealWorkers: r.idealWorkers,
        laborRole: roles.find((x: any) => x.id === r.laborRoleId) ?? null,
      })),
    } as any
  }

  // Aplica un slot (crear/editar) sobre una o varias fechas.
  function applyDraftSlot(dates: string[], startTime: string, endTime: string, roleRows: any[], isRequired: boolean, notes: string, replaceId?: string) {
    setDraftSlots(prev => {
      let next = replaceId ? prev.filter(s => (s as any).id !== replaceId) : [...prev]
      for (const date of dates) {
        // Sobrescribir cualquier slot existente con misma fecha+inicio.
        next = next.filter(s => !(s.date === date && s.startTime === startTime))
        next.push(buildLocalSlot(date, startTime, endTime, roleRows, isRequired, notes))
      }
      return next
    })
    setDirty(true)
  }

  // Aplica un rango horario (masivo) partido en franjas de 30 min a varias fechas.
  function applyDraftBulk(dates: string[], startTime: string, endTime: string, roleRows: any[], isRequired: boolean, notes: string) {
    const franjas = splitIntoHalfHours(startTime, endTime)
    setDraftSlots(prev => {
      let next = [...prev]
      for (const date of dates) {
        for (const f of franjas) {
          next = next.filter(s => !(s.date === date && s.startTime === f.start))
          next.push(buildLocalSlot(date, f.start, f.end, roleRows, isRequired, notes))
        }
      }
      return next
    })
    setDirty(true)
  }

  function deleteDraftSlot(id: string) {
    setDraftSlots(prev => prev.filter(s => (s as any).id !== id))
    setDirty(true)
  }

  function clearDraft() {
    setDraftSlots([])
    setDirty(true)
  }

  // Persistir el borrador completo de la semana.
  function saveDraft() {
    startTransition(async () => {
      try {
        const payload = draftSlots.map(s => ({
          startTime: s.startTime,
          endTime: s.endTime,
          isRequired: s.isRequired,
          notes: s.notes ?? null,
          dateISO: s.date,
          roles: ((s as any).roleRequirements ?? []).map((rr: any) => ({
            laborRoleId: rr.laborRoleId,
            minWorkers: rr.minWorkers,
            idealWorkers: rr.idealWorkers,
          })),
        }))
        const r = await saveWeekCoverage({ locationId, organizationId, weekStartISO, slots: payload })
        toast.success(`Semana guardada · ${r.saved} slots ✓`)
        setDirty(false)
        router.refresh()
        setServerVersion(v => v + 1)
      } catch (e: any) { toast.error(e.message) }
    })
  }

  // Rango horario visible: min/max de los slots existentes, o 06:00-23:30 por defecto
  const visibleTimes = useMemo(() => {
    if (normalizedSlots.length === 0) return ALL_TIME_SLOTS_24H.filter(t => t >= '06:00' && t < '24:00')
    const times = normalizedSlots.map(s => s.startTime).sort()
    const min = times[0]
    const max = times[times.length - 1]
    return ALL_TIME_SLOTS_24H.filter(t => t >= min && t <= max)
  }, [normalizedSlots])

  // KPIs
  const kpis = useMemo(() => {
    const daysWithSlots = new Set(normalizedSlots.map(s => s.date)).size
    const maxDemand = normalizedSlots.reduce((m, s) => Math.max(m, s.minWorkers), 0)
    const required = normalizedSlots.filter(s => s.isRequired).length
    return { total: normalizedSlots.length, daysWithSlots, maxDemand, required }
  }, [normalizedSlots])

  // ── Horas de cobertura necesarias ────────────────────────────────────────
  // Cada slot aporta (personas × su duración). El desglose por rol usa
  // roleRequirements; si un slot no lo tiene, cae en "Sin rol asignado".
  const coverageHours = useMemo(() => {
    let minHours = 0
    let idealHours = 0
    const byRole = new Map<string, { name: string; color: string; min: number; ideal: number }>()

    for (const s of normalizedSlots) {
      const dur = slotDurationHours(s.startTime, s.endTime)
      if (dur === 0) continue
      minHours += (s.minWorkers ?? 0) * dur
      idealHours += (s.idealWorkers ?? s.minWorkers ?? 0) * dur

      const rrs = ((s as any).roleRequirements ?? []) as any[]
      if (rrs.length === 0) {
        const prev = byRole.get('__none__') ?? { name: 'Sin rol asignado', color: '#9ca3af', min: 0, ideal: 0 }
        prev.min += (s.minWorkers ?? 0) * dur
        prev.ideal += (s.idealWorkers ?? s.minWorkers ?? 0) * dur
        byRole.set('__none__', prev)
        continue
      }
      for (const rr of rrs) {
        const key = rr.laborRoleId ?? '__none__'
        const prev = byRole.get(key) ?? { name: roleName(rr), color: roleColor(rr), min: 0, ideal: 0 }
        prev.min += (rr.minWorkers ?? 0) * dur
        prev.ideal += (rr.idealWorkers ?? rr.minWorkers ?? 0) * dur
        byRole.set(key, prev)
      }
    }

    const roleRows = Array.from(byRole.values()).sort((a, b) => b.min - a.min)
    return { minHours, idealHours, roleRows }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedSlots, roleColorById, roleNameById])

  // ── Capacidad semanal de la plantilla ────────────────────────────────────
  // contracted = suma de horas de contrato. min/max = horquillas (el máximo
  // marca el techo con horas extra). Sin horquilla se usa la hora contratada.
  const capacity = useMemo(() => {
    let contracted = 0
    let minHours = 0
    let maxHours = 0
    let withContract = 0

    for (const e of staff) {
      const c = e.contracts?.[0]
      if (!c) continue
      withContract++
      const w = c.weeklyHours ?? 0
      contracted += w
      minHours += c.minWeeklyHours ?? w
      maxHours += c.maxWeeklyHours ?? w
    }

    return {
      total: staff.length,
      withContract,
      withoutContract: staff.length - withContract,
      contracted,
      minHours,
      maxHours,
    }
  }, [staff])

  // ── Balance cobertura vs capacidad ───────────────────────────────────────
  const balance = useMemo(() => {
    const need = coverageHours.minHours
    const diff = capacity.contracted - need
    let status: 'empty' | 'ok' | 'extras' | 'deficit' = 'ok'
    if (capacity.withContract === 0 || need === 0) status = 'empty'
    else if (need > capacity.maxHours) status = 'deficit'
    else if (need > capacity.contracted) status = 'extras'
    return {
      diff,
      status,
      // Horas extra necesarias por encima de lo contratado.
      extraNeeded: Math.max(0, need - capacity.contracted),
      // Horas que no se pueden cubrir ni con el máximo de la plantilla.
      uncovered: Math.max(0, need - capacity.maxHours),
      usagePct: capacity.contracted > 0 ? (need / capacity.contracted) * 100 : 0,
    }
  }, [coverageHours.minHours, capacity])

  function goToWeek(newWeekStartISO: string) {
    router.push(`/coverage?week=${newWeekStartISO}`)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-52px)] overflow-hidden bg-[#F7F8FA]">

      {/* ── Header con navegador de semanas ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">Necesidades de cobertura</h1>
          <p className="text-[12px] text-gray-400">Define cuántas personas necesitas cada día</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => goToWeek(addDaysISO(weekStartISO, -7))}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <div className="px-4 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[13px] font-semibold text-gray-700 min-w-[220px] text-center">
            {weekRangeLabel(weekStartISO)}
          </div>
          <button onClick={() => goToWeek(addDaysISO(weekStartISO, 7))}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => goToWeek(new Date().toISOString().slice(0, 10))}
            className="ml-1 px-3 py-1.5 rounded-lg text-[12px] font-medium text-indigo-600 hover:bg-indigo-50 transition-colors">
            Hoy
          </button>
        </div>

        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-[11px] font-medium text-amber-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Cambios sin guardar
            </span>
          )}

          <button onClick={() => setAddingSlot({ date: weekDates[0], time: '09:00' })}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-[12px] font-semibold hover:bg-gray-50 transition-colors">
            <Plus size={14} /> Añadir slot
          </button>

          <button onClick={() => setShowCopyWeeks(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-[12px] font-semibold hover:bg-gray-50 transition-colors">
            <Copy size={14} /> Copiar semanas
          </button>

          <button onClick={saveDraft} disabled={isPending || !dirty}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar
          </button>

          {/* ── Menú de acciones (engranaje) ── */}
          <div className="relative" tabIndex={-1}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setShowGearMenu(false) }}>
            <button onClick={() => setShowGearMenu(v => !v)}
              className={cn('w-9 h-9 rounded-xl border flex items-center justify-center transition-colors',
                showGearMenu ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}>
              <Settings size={15} />
            </button>

            {showGearMenu && (
              <div className="absolute right-0 top-11 z-30 w-[260px] bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden py-1.5">
                <MenuItem icon={<Trash2 size={14} />} label="Vaciar la semana" desc="Borra el borrador de esta semana" danger
                  onClick={() => { setShowGearMenu(false); setShowClearConfirm(true) }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="flex-shrink-0 flex items-center gap-5 px-6 py-2.5 bg-white border-b border-gray-100 text-[12px] flex-wrap">
        <span><strong className="text-indigo-600 text-[14px]">{kpis.total}</strong> <span className="text-gray-400">slots totales</span></span>
        <span><strong className="text-emerald-600 text-[14px]">{kpis.daysWithSlots}/7</strong> <span className="text-gray-400">días configurados</span></span>
        <span><strong className="text-amber-600 text-[14px]">{kpis.maxDemand}</strong> <span className="text-gray-400">demanda máxima</span></span>
        <span><strong className="text-red-500 text-[14px]">{kpis.required}</strong> <span className="text-gray-400">slots obligatorios</span></span>

        <span className="w-px h-5 bg-gray-200" />

        {/* Horas necesarias para cubrir toda la demanda de la semana */}
        <HoverStat
          panel={
            <>
              <div className="text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-2">Horas de cobertura</div>
              <StatRow label="Mínimo obligatorio" value={fmtHours(coverageHours.minHours)} strong />
              <StatRow label="Ideal (con refuerzo)" value={fmtHours(coverageHours.idealHours)} />
              {coverageHours.roleRows.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Desglose por rol (mínimo)</div>
                  {coverageHours.roleRows.map((r, i) => (
                    <StatRow key={i} label={r.name} value={fmtHours(r.min)} color={r.color} />
                  ))}
                </div>
              )}
              <p className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-400 leading-snug">
                Suma de personas × duración de cada slot de la semana.
              </p>
            </>
          }
        >
          <span>
            <strong className="text-violet-600 text-[14px]">{fmtHours(coverageHours.minHours)}</strong>{' '}
            <span className="text-gray-400">de cobertura</span>
          </span>
        </HoverStat>

        {/* Capacidad de la plantilla */}
        <HoverStat
          panel={
            <>
              <div className="text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-2">Capacidad de la plantilla</div>
              <StatRow label={`Empleados activos`} value={String(capacity.total)} />
              <StatRow label="Horas mínimas (horquilla)" value={fmtHours(capacity.minHours)} />
              <StatRow label="Horas contratadas" value={fmtHours(capacity.contracted)} strong />
              <StatRow label="Horas máximas (con extras)" value={fmtHours(capacity.maxHours)} />
              {capacity.withoutContract > 0 && (
                <p className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-amber-600 leading-snug">
                  {capacity.withoutContract} empleado(s) sin contrato activo no cuentan en la capacidad.
                </p>
              )}
              {capacity.withContract > 0 && (
                <p className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-400 leading-snug">
                  Ocupación de la plantilla: {Math.round(balance.usagePct)}% de las horas contratadas.
                </p>
              )}
            </>
          }
        >
          <span>
            <strong className="text-sky-600 text-[14px]">{capacity.total}</strong>{' '}
            <span className="text-gray-400">empleados ·</span>{' '}
            <strong className="text-sky-600 text-[14px]">{fmtHours(capacity.contracted)}</strong>{' '}
            <span className="text-gray-400">contratadas</span>
          </span>
        </HoverStat>

        {/* Balance */}
        {balance.status !== 'empty' && (
          <span className={cn('ml-auto px-3 py-1 rounded-full text-[11px] font-semibold',
            balance.status === 'ok' && 'bg-emerald-50 text-emerald-700',
            balance.status === 'extras' && 'bg-amber-50 text-amber-700',
            balance.status === 'deficit' && 'bg-red-50 text-red-700',
          )}>
            {balance.status === 'ok' && `Encaja · ${fmtHours(balance.diff)} de margen`}
            {balance.status === 'extras' && `Necesitas ${fmtHours(balance.extraNeeded)} extra`}
            {balance.status === 'deficit' && `Déficit de ${fmtHours(balance.uncovered)} — falta plantilla`}
          </span>
        )}
      </div>

      {/* ── Glosario de roles (colores) ── */}
      {roles.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-3 px-6 py-2 bg-white border-b border-gray-100 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Roles</span>
          {sortRoles(roles).map((r: any) => (
            <span key={r.id} className="flex items-center gap-1.5" title={r.name}>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-[11px] text-gray-600 font-medium">{r.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── Grid ── */}
      <div className="flex-1 overflow-auto px-5 py-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-w-[900px]">

          {/* Cabecera días */}
          <div className="grid border-b border-gray-200 sticky top-0 z-10 bg-white" style={{ gridTemplateColumns: '80px repeat(7, 1fr)' }}>
            <div className="px-3 py-3 bg-gray-50 border-r border-gray-200">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Hora</span>
            </div>
            {weekDates.map(dateISO => {
              const { dayName, dayNum } = fmtDayLabel(dateISO)
              const today = isTodayISO(dateISO)
              const count = normalizedSlots.filter(s => s.date === dateISO).length
              return (
                <div key={dateISO} className={cn('px-2 py-3 border-r border-gray-200 text-center', today ? 'bg-indigo-50' : 'bg-gray-50')}>
                  <div className={cn('text-[12px] font-semibold', today ? 'text-indigo-600' : 'text-gray-700')}>{dayName}</div>
                  <div className={cn('text-[13px] font-bold mx-auto w-7 h-7 flex items-center justify-center rounded-full mt-0.5', today ? 'bg-indigo-600 text-white' : 'text-gray-500')}>
                    {dayNum}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{count} slots</div>
                </div>
              )
            })}
          </div>

          {/* Filas de franjas horarias */}
          {visibleTimes.map(time => (
            <div key={time} className="grid border-b border-gray-100 hover:bg-gray-50/40 transition-colors" style={{ gridTemplateColumns: '80px repeat(7, 1fr)' }}>
              <div className="px-3 py-2 text-[11px] text-gray-400 font-mono border-r border-gray-100 flex items-center">{time}</div>
              {weekDates.map(dateISO => {
                const slot = slotMap.get(`${dateISO}|${time}`)
                const colors = slot ? demandColor(slot.minWorkers) : null
                return (
                  <div key={dateISO}
                    className="border-r border-gray-100 p-1 cursor-pointer group/cell min-h-[44px]"
                    style={{ backgroundColor: slot ? colors!.bg : undefined }}
                    onClick={() => slot ? setEditingSlot(slot) : setAddingSlot({ date: dateISO, time })}>
                    {slot ? (
                      <div className="rounded-lg px-2 py-1.5 min-h-[38px] flex flex-col justify-between relative border h-full"
                        style={{ borderColor: colors!.border }}>
                        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ backgroundColor: colors!.bar }} />
                        <div className="pl-1.5 flex items-center justify-between gap-1">
                          <span className="text-[15px] font-bold leading-none" style={{ color: colors!.text }}>{slot.minWorkers}</span>
                          {slot.idealWorkers > slot.minWorkers && (
                            <span className="text-[12px] font-semibold" style={{ color: colors!.text, opacity: 0.7 }}>/{slot.idealWorkers}</span>
                          )}
                          {slot.notes && <span className="text-[9px] text-gray-400 ml-auto" title={slot.notes}>📝</span>}
                        </div>

                        {/* Barra segmentada por rol: anchura ∝ mínimo de cada rol, color del rol. */}
                        {slot.roleRequirements && slot.roleRequirements.length > 0 ? (
                          <div className="pl-1.5 mt-1 flex h-[14px] rounded overflow-hidden">
                            {(() => {
                              const reqs = slot.roleRequirements.filter((rr: any) => (rr.minWorkers ?? 0) > 0)
                              const totalMin = reqs.reduce((a: number, rr: any) => a + (rr.minWorkers ?? 0), 0) || 1
                              return reqs.map((rr: any) => {
                                const pct = (rr.minWorkers / totalMin) * 100
                                return (
                                  <div key={rr.laborRoleId ?? rr.id}
                                    className="relative group/seg flex items-center justify-center text-white text-[9px] font-bold leading-none"
                                    style={{ width: `${pct}%`, backgroundColor: roleColor(rr) }}>
                                    {pct > 14 ? rr.minWorkers : ''}
                                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-gray-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover/seg:opacity-100 transition-opacity z-50">
                                      {roleName(rr)}: mín {rr.minWorkers} / ideal {rr.idealWorkers}
                                    </div>
                                  </div>
                                )
                              })
                            })()}
                          </div>
                        ) : slot.laborRole ? (
                          <div className="pl-1.5 mt-1 flex h-[14px] rounded overflow-hidden">
                            <div className="flex-1 flex items-center justify-center text-white text-[9px] font-bold"
                              style={{ backgroundColor: slot.laborRole.color }}
                              title={slot.laborRole.name}>{slot.minWorkers}</div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="w-full h-full min-h-[38px] rounded-lg flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                        <Plus size={13} className="text-gray-300" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Modal crear/editar slot ── */}
      {(editingSlot || addingSlot) && (
        <SlotModal
          slot={editingSlot}
          defaultDate={addingSlot?.date}
          defaultTime={addingSlot?.time}
          weekDates={weekDates}
          roles={roles}
          onClose={() => { setEditingSlot(null); setAddingSlot(null) }}
          onApplyOne={(dates: string[], startTime: string, endTime: string, roleRows: any[], isRequired: boolean, notes: string) => {
            applyDraftSlot(dates, startTime, endTime, roleRows, isRequired, notes, editingSlot ? (editingSlot as any).id : undefined)
            setEditingSlot(null); setAddingSlot(null)
          }}
          onApplyBulk={(dates: string[], startTime: string, endTime: string, roleRows: any[], isRequired: boolean, notes: string) => {
            applyDraftBulk(dates, startTime, endTime, roleRows, isRequired, notes)
            setEditingSlot(null); setAddingSlot(null)
          }}
          onDeleteSlot={() => {
            if (editingSlot) deleteDraftSlot((editingSlot as any).id)
            setEditingSlot(null); setAddingSlot(null)
          }}
        />
      )}

      {showCopyWeeks && (
        <CopyWeeksModal
          weekStartISO={weekStartISO}
          locationId={locationId}
          organizationId={organizationId}
          dirty={dirty}
          onClose={() => setShowCopyWeeks(false)}
          onCopied={() => { setShowCopyWeeks(false); router.refresh() }}
        />
      )}

      {/* ── Confirmar borrar semana ── */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowClearConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[400px] p-6">
            <h3 className="text-[15px] font-bold text-gray-900 mb-2">¿Vaciar la cobertura de esta semana?</h3>
            <p className="text-[13px] text-gray-500 mb-5">
              Se quitarán <strong>{kpis.total} slots</strong> del borrador de la semana del {weekRangeLabel(weekStartISO)}. El cambio no se guarda hasta que pulses «Guardar».
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100">Cancelar</button>
              <button
                onClick={() => { clearDraft(); setShowClearConfirm(false) }}
                className="px-5 py-2 rounded-xl bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700">
                Sí, vaciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal: crear/editar slot ──────────────────────────────────────────────────
function SlotModal({ slot, defaultDate, defaultTime, weekDates, roles, onClose, onApplyOne, onApplyBulk, onDeleteSlot }: any) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isEdit = !!slot
  const [form, setForm] = useState({
    dates: isEdit ? [slot.date] : [defaultDate],
    startTime: slot?.startTime ?? defaultTime,
    endTime: slot?.endTime ?? nextSlot(defaultTime),
    isRequired: slot?.isRequired ?? true,
    notes: slot?.notes ?? '',
  })
  // Desglose por rol — fuente de verdad de la demanda del slot.
  const [roleRows, setRoleRows] = useState<RoleRow[]>(() => initialRoleRows(slot, roles))

  // Total derivado (para el color de la cabecera y validación).
  const totals = useMemo(() => {
    let min = 0, ideal = 0
    for (const r of roleRows) { min += r.minWorkers; ideal += r.idealWorkers }
    return { min, ideal }
  }, [roleRows])
  const colors = demandColor(totals.min)

  const franjas = useMemo(() => {
    const [sh, sm] = form.startTime.split(':').map(Number)
    const [eh, em] = form.endTime === '00:00' ? [24, 0] : form.endTime.split(':').map(Number)
    return Math.max(0, Math.ceil(((eh * 60 + em) - (sh * 60 + sm)) / 30))
  }, [form.startTime, form.endTime])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[520px] flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h2 className="text-[15px] font-bold text-gray-900">{isEdit ? 'Editar slot de cobertura' : 'Nuevo slot de cobertura'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white transition-colors"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <Field label={isEdit ? 'Fecha' : 'Días de esta semana'}>
            {!isEdit && (
              <div className="flex gap-1.5 mb-2">
                <button onClick={() => setForm(f => ({ ...f, dates: weekDates.slice(0, 5) }))}
                  className="text-[10px] font-medium px-2 py-1 rounded-lg bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 transition-colors">Lun–Vie</button>
                <button onClick={() => setForm(f => ({ ...f, dates: weekDates.slice(5, 7) }))}
                  className="text-[10px] font-medium px-2 py-1 rounded-lg bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 transition-colors">Fin de semana</button>
                <button onClick={() => setForm(f => ({ ...f, dates: weekDates }))}
                  className="text-[10px] font-medium px-2 py-1 rounded-lg bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 transition-colors">Todos</button>
              </div>
            )}
            <div className="grid grid-cols-7 gap-1">
              {weekDates.map((dateISO: string) => {
                const { dayName, dayNum } = fmtDayLabel(dateISO)
                const active = isEdit ? slot.date === dateISO : form.dates.includes(dateISO)
                return (
                  <button key={dateISO} disabled={isEdit}
                    onClick={() => {
                      if (isEdit) return
                      setForm(f => ({ ...f, dates: f.dates.includes(dateISO) ? f.dates.filter((d: string) => d !== dateISO) : [...f.dates, dateISO] }))
                    }}
                    className={cn('py-2 rounded-xl text-[11px] font-bold transition-all leading-tight',
                      active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                      isEdit && !active && 'opacity-40 cursor-default')}>
                    {dayName}<div className="text-[10px] font-normal opacity-80">{dayNum}</div>
                  </button>
                )
              })}
            </div>
            {!isEdit && form.dates.length > 0 && franjas > 0 && (
              <p className="text-[10px] text-indigo-600 mt-1.5">
                Se aplicará a {franjas * form.dates.length} franjas de 30 min ({form.dates.length} día{form.dates.length !== 1 ? 's' : ''} × {franjas} franja{franjas !== 1 ? 's' : ''}). Las existentes se actualizarán.
              </p>
            )}
          </Field>

          <Field label="Horario">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-gray-400 mb-1">Inicio</div>
                <TimeSelect
                  value={form.startTime}
                  onChange={v => setForm(f => ({ ...f, startTime: v, endTime: nextSlot(v) }))}
                  options={halfHourOptions()}
                />
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-1">Fin</div>
                <TimeSelect
                  value={form.endTime}
                  onChange={v => setForm(f => ({ ...f, endTime: v }))}
                  options={halfHourOptions(true).filter(t => t === '00:00' || t > form.startTime)}
                  labelFor={t => t === '00:00' ? '00:00 (medianoche)' : t}
                />
              </div>
            </div>
          </Field>

          <Field label="Necesidades por rol">
            <RoleRequirementsEditor
              value={roleRows}
              onChange={setRoleRows}
              roles={roles}
            />
          </Field>

          <div className={cn('flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all', form.isRequired ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white')}
            onClick={() => setForm(f => ({ ...f, isRequired: !f.isRequired }))}>
            <div className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0 mt-0.5', form.isRequired ? 'bg-red-500' : 'bg-gray-300')}>
              <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', form.isRequired ? 'left-5' : 'left-0.5')} />
            </div>
            <div>
              <div className={cn('text-[13px] font-semibold', form.isRequired ? 'text-red-800' : 'text-gray-600')}>
                {form.isRequired ? '🔴 Slot obligatorio' : 'Slot opcional'}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {form.isRequired ? 'El sistema lo priorizará — no puede quedar sin cubrir' : 'Puede quedar sin cubrir si no hay personal disponible'}
              </div>
            </div>
          </div>

          <Field label="Notas (opcional)">
            <input className={inputCls()} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ej: Necesita barista, hora pico desayunos…" />
          </Field>
        </div>

        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-[12px] text-red-600 font-medium">¿Eliminar este slot?</span>
                <button onClick={() => { onDeleteSlot(); setConfirmDelete(false) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] bg-red-600 text-white hover:bg-red-700 transition-colors">
                  Sí, eliminar
                </button>
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-[12px] text-gray-500 hover:bg-gray-100 transition-colors">Cancelar</button>
              </>
            ) : (
              <>
                <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">Cancelar</button>
                {isEdit && (
                  <button onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] text-red-500 hover:bg-red-50 border border-red-200 transition-colors">
                    <Trash2 size={13} /> Eliminar slot
                  </button>
                )}
              </>
            )}
          </div>
          <button
            disabled={(!isEdit && form.dates.length === 0) || roleRows.length === 0 || totals.ideal === 0}
            onClick={() => {
              const rolesPayload = roleRows.map(r => ({
                laborRoleId: r.laborRoleId,
                minWorkers: r.minWorkers,
                idealWorkers: r.idealWorkers,
              }))
              if (isEdit) {
                onApplyOne([slot.date], form.startTime, form.endTime, rolesPayload, form.isRequired, form.notes)
              } else {
                onApplyBulk(form.dates, form.startTime, form.endTime, rolesPayload, form.isRequired, form.notes)
              }
            }}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            <CheckCircle size={14} />
            {isEdit ? 'Aplicar cambios' : 'Añadir slots'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MenuItem del engranaje ────────────────────────────────────────────────────
function MenuItem({ icon, label, desc, danger, onClick }: any) {
  return (
    <button onClick={onClick}
      className={cn('w-full flex items-start gap-2.5 px-3.5 py-2 text-left transition-colors',
        danger ? 'hover:bg-red-50' : 'hover:bg-gray-50')}>
      <span className={cn('mt-0.5 flex-shrink-0', danger ? 'text-red-400' : 'text-gray-400')}>{icon}</span>
      <span className="min-w-0">
        <span className={cn('block text-[12px] font-semibold', danger ? 'text-red-600' : 'text-gray-700')}>{label}</span>
        {desc && <span className="block text-[10px] text-gray-400 truncate">{desc}</span>}
      </span>
    </button>
  )
}

// ─── Calendario mensual (dos meses lado a lado) para copiar semanas ────────────
// Selección POR SEMANAS: al clicar cualquier día se marca su semana entera.
const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Devuelve la matriz de semanas (cada una: 7 fechas ISO lun→dom) que cubren
// visualmente el mes dado (incluye días de meses vecinos para cuadrar la rejilla).
function monthWeeks(year: number, month: number): string[][] {
  const first = new Date(Date.UTC(year, month, 1))
  const dow = (first.getUTCDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setUTCDate(gridStart.getUTCDate() - dow) // lunes de la 1ª semana visible
  const weeks: string[][] = []
  const cur = new Date(gridStart)
  for (let w = 0; w < 6; w++) {
    const week: string[] = []
    for (let d = 0; d < 7; d++) {
      week.push(cur.toISOString().slice(0, 10))
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    weeks.push(week)
    // parar si la siguiente semana ya no pertenece al mes
    if (new Date(week[6] + 'T00:00:00Z').getUTCMonth() !== month && w >= 3) {
      const nextMonday = new Date(week[6] + 'T00:00:00Z'); nextMonday.setUTCDate(nextMonday.getUTCDate() + 1)
      if (nextMonday.getUTCMonth() !== month) break
    }
  }
  return weeks
}

interface MonthCalProps {
  year: number
  month: number
  // Estado por semana (clave = lunes ISO): 'source' | 'target' | null
  weekState: (mondayISO: string) => 'source' | 'target' | null
  onWeekClick: (mondayISO: string) => void
  targetIndex?: (mondayISO: string) => number | null
}

function MonthCalendar({ year, month, weekState, onWeekClick, targetIndex }: MonthCalProps) {
  const weeks = monthWeeks(year, month)
  return (
    <div className="flex-1 min-w-0">
      <div className="text-center text-[13px] font-bold text-gray-800 mb-2 capitalize">{MONTH_NAMES[month]} {year}</div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-gray-400">{d}</div>
        ))}
      </div>
      <div className="space-y-0.5">
        {weeks.map((week, wi) => {
          const monday = week[0]
          const st = weekState(monday)
          const tIdx = st === 'target' && targetIndex ? targetIndex(monday) : null
          return (
            <div
              key={wi}
              onClick={() => onWeekClick(monday)}
              className={cn(
                'grid grid-cols-7 gap-0.5 rounded-lg cursor-pointer transition-all py-0.5 relative',
                st === 'source' && 'bg-indigo-100 ring-1 ring-indigo-300',
                st === 'target' && 'bg-emerald-100 ring-1 ring-emerald-300',
                !st && 'hover:bg-gray-50'
              )}
            >
              {week.map(iso => {
                const d = new Date(iso + 'T00:00:00Z')
                const inMonth = d.getUTCMonth() === month
                return (
                  <div key={iso} className={cn(
                    'text-center text-[11px] py-1 rounded',
                    !inMonth && 'text-gray-300',
                    inMonth && st === 'source' && 'text-indigo-700 font-semibold',
                    inMonth && st === 'target' && 'text-emerald-700 font-semibold',
                    inMonth && !st && 'text-gray-600'
                  )}>
                    {d.getUTCDate()}
                  </div>
                )
              })}
              {tIdx != null && (
                <span className="absolute -right-1 -top-1 w-4 h-4 rounded-full bg-emerald-500 text-white text-[8px] font-bold flex items-center justify-center">{tIdx + 1}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Modal: copiar semanas (dos calendarios, selección visual por semanas) ─────
function CopyWeeksModal({ weekStartISO, locationId, organizationId, dirty, onClose, onCopied }: any) {
  const [pending, setPending] = useState(false)
  const [phase, setPhase] = useState<'source' | 'target'>('source')
  const [selectedSources, setSelectedSources] = useState<string[]>([]) // lunes ISO
  const [target, setTarget] = useState<string | null>(null)            // lunes ISO destino

  // Par de meses visibles (el izquierdo). El derecho es el siguiente.
  const initial = new Date(weekStartISO + 'T00:00:00Z')
  const [viewYear, setViewYear] = useState(initial.getUTCFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getUTCMonth())

  function prevMonths() {
    setViewMonth(m => { if (m === 0) { setViewYear(y => y - 1); return 11 } return m - 1 })
  }
  function nextMonths() {
    setViewMonth(m => { if (m === 11) { setViewYear(y => y + 1); return 0 } return m + 1 })
  }
  const rightMonth = viewMonth === 11 ? 0 : viewMonth + 1
  const rightYear = viewMonth === 11 ? viewYear + 1 : viewYear

  const sortedSources = useMemo(() => [...selectedSources].sort(), [selectedSources])

  // Semanas destino (consecutivas desde el target, tantas como orígenes).
  const targetWeeks = useMemo(() => {
    if (!target || sortedSources.length === 0) return []
    const out: string[] = []
    let cur = target
    for (let i = 0; i < sortedSources.length; i++) { out.push(cur); cur = addDaysISO(cur, 7) }
    return out
  }, [target, sortedSources])

  function toggleSource(monday: string) {
    setSelectedSources(prev => prev.includes(monday) ? prev.filter(m => m !== monday) : [...prev, monday])
  }

  function weekStateSource(monday: string): 'source' | 'target' | null {
    return selectedSources.includes(monday) ? 'source' : null
  }
  function weekStateTarget(monday: string): 'source' | 'target' | null {
    if (targetWeeks.includes(monday)) return 'target'
    return null
  }
  function targetIndexOf(monday: string): number | null {
    const i = targetWeeks.indexOf(monday)
    return i >= 0 ? i : null
  }

  function fmtWeek(monday: string): string {
    const d = new Date(monday + 'T00:00:00Z')
    const end = new Date(d); end.setUTCDate(end.getUTCDate() + 6)
    return `${d.getUTCDate()} ${MONTHS_ES[d.getUTCMonth()]} – ${end.getUTCDate()} ${MONTHS_ES[end.getUTCMonth()]}`
  }

  function handleCopy() {
    if (sortedSources.length === 0 || !target) return
    setPending(true)
    ;(async () => {
      try {
        const r = await copyWeeksCoverage({
          locationId, organizationId,
          sourceWeekMondaysISO: sortedSources,
          targetWeekMondayISO: target,
        })
        toast.success(`${r.weeksCopied} semana(s) copiadas · ${r.slotsCopied} slots ✓`)
        onCopied()
      } catch (e: any) { toast.error(e.message) }
      finally { setPending(false) }
    })()
  }

  const activeWeekState = phase === 'source' ? weekStateSource : weekStateTarget
  const onWeekClick = phase === 'source' ? toggleSource : (m: string) => setTarget(m)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[720px] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h3 className="text-[15px] font-bold text-gray-900">Copiar semanas</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {phase === 'source'
              ? 'Haz clic en cualquier día para seleccionar su semana entera. Puedes elegir varias.'
              : 'Elige la semana destino: se pegarán consecutivas a partir de ahí.'}
          </p>
        </div>

        {dirty && (
          <div className="mx-6 mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-100">
            <Info size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <span className="text-[11px] text-amber-700">Tienes cambios sin guardar en la semana actual. Copiar recarga desde el servidor y se perderán.</span>
          </div>
        )}

        {/* Navegador + dos meses */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonths} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={16} /></button>
            <span className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-full',
              phase === 'source' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600')}>
              {phase === 'source' ? 'Seleccionando origen' : 'Seleccionando destino'}
            </span>
            <button onClick={nextMonths} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={16} /></button>
          </div>
          <div className="flex gap-6">
            <MonthCalendar year={viewYear} month={viewMonth}
              weekState={activeWeekState} onWeekClick={onWeekClick}
              targetIndex={phase === 'target' ? targetIndexOf : undefined} />
            <MonthCalendar year={rightYear} month={rightMonth}
              weekState={activeWeekState} onWeekClick={onWeekClick}
              targetIndex={phase === 'target' ? targetIndexOf : undefined} />
          </div>

          {/* Resumen de selección */}
          {sortedSources.length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="text-[11px] font-semibold text-gray-500 mb-1.5">
                {sortedSources.length} semana(s) seleccionada(s){phase === 'target' && target ? ` → destino desde ${fmtWeek(target)}` : ''}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sortedSources.map(m => (
                  <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium">{fmtWeek(m)}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">Cancelar</button>
          <div className="flex gap-2">
            {phase === 'target' && (
              <button onClick={() => { setPhase('source'); setTarget(null) }}
                className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">Atrás</button>
            )}
            {phase === 'source' ? (
              <button
                disabled={sortedSources.length === 0}
                onClick={() => setPhase('target')}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                Siguiente ({sortedSources.length})
              </button>
            ) : (
              <button
                disabled={!target || pending}
                onClick={handleCopy}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                Copiar aquí
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
