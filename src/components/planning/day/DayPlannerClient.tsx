'use client'

import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Users, Loader2, CheckCircle, X,
  CalendarDays, Calendar, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { upsertDateSlot, deleteDateSlot } from '@/server/actions/coverageWeekly'

// ─── Constantes ───────────────────────────────────────────────────────────────
const DAYS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const EMP_COLORS = [
  { bg: '#eef2ff', border: '#818cf8', text: '#3730a3', dot: '#4f46e5' },
  { bg: '#ecfdf5', border: '#34d399', text: '#065f46', dot: '#059669' },
  { bg: '#fdf4ff', border: '#c084fc', text: '#6b21a8', dot: '#9333ea' },
  { bg: '#fff7ed', border: '#fb923c', text: '#9a3412', dot: '#ea580c' },
  { bg: '#fef2f2', border: '#f87171', text: '#991b1b', dot: '#dc2626' },
  { bg: '#f0f9ff', border: '#38bdf8', text: '#0c4a6e', dot: '#0284c7' },
  { bg: '#fefce8', border: '#facc15', text: '#713f12', dot: '#ca8a04' },
  { bg: '#f0fdf4', border: '#4ade80', text: '#14532d', dot: '#16a34a' },
]

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function minToTime(m: number): string {
  const mm = m >= 24 * 60 ? m - 24 * 60 : m
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
}
function endMin(t: string): number {
  return t === '00:00' ? 24 * 60 : timeToMin(t)
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7
  return `${DAYS_FULL[dow]} ${d.getUTCDate()} ${MONTHS_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
function isTodayISO(iso: string): boolean {
  const t = new Date()
  return iso === new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())).toISOString().slice(0, 10)
}
function demandColor(min: number): { bg: string; text: string } {
  if (min === 0) return { bg: '#f9fafb', text: '#9ca3af' }
  if (min === 1) return { bg: '#f0fdf4', text: '#166534' }
  if (min === 2) return { bg: '#eff6ff', text: '#1e40af' }
  if (min === 3) return { bg: '#fefce8', text: '#854d0e' }
  if (min === 4) return { bg: '#fff7ed', text: '#9a3412' }
  return { bg: '#fef2f2', text: '#991b1b' }
}

interface Props {
  dateISO: string
  periodId: string | null
  periodStatus: string | null
  assignments: any[]
  employees: any[]
  coverageSlots: any[]
  locationId: string
  organizationId: string
  laborRoles?: any[]
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function DayPlannerClient({
  dateISO, periodId, periodStatus, assignments: allAssignments, employees: allEmployees, coverageSlots: allCoverageSlots,
  locationId, organizationId, laborRoles = [],
}: Props) {
  const router = useRouter()
  const [quickEdit, setQuickEdit] = useState<{ time: string; slot: any | null } | null>(null)
  const [hoverFranja, setHoverFranja] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string[]>([])

  // Filtro por roles: empleados, turnos y cobertura de los roles seleccionados
  const employees = useMemo(() => {
    if (roleFilter.length === 0) return allEmployees
    return allEmployees.filter((e: any) => roleFilter.includes(e.skills?.[0]?.laborRole?.id))
  }, [allEmployees, roleFilter])

  const assignments = useMemo(() => {
    if (roleFilter.length === 0) return allAssignments
    const visibleIds = new Set(employees.map((e: any) => e.id))
    return allAssignments.filter((a: any) => visibleIds.has(a.employeeId))
  }, [allAssignments, employees, roleFilter])

  const coverageSlots = useMemo(() => {
    if (roleFilter.length === 0) return allCoverageSlots
    return allCoverageSlots.filter((s: any) => roleFilter.includes(s.laborRoleId))
  }, [allCoverageSlots, roleFilter])

  const empColorMap = useMemo(() => Object.fromEntries(
    allEmployees.map((e: any, i: number) => [e.id, EMP_COLORS[i % EMP_COLORS.length]])
  ), [allEmployees])

  // ── Rango horario del día: min/max entre cobertura y turnos; fallback 08–24 ──
  const range = useMemo(() => {
    const starts: number[] = []
    const ends: number[] = []
    for (const s of coverageSlots) { starts.push(timeToMin(s.startTime)); ends.push(endMin(s.endTime)) }
    for (const a of assignments) { starts.push(timeToMin(a.startTime)); ends.push(endMin(a.endTime)) }
    if (starts.length === 0) return { start: 8 * 60, end: 24 * 60 }
    // Redondear a hora completa hacia fuera
    const s = Math.floor(Math.min(...starts) / 60) * 60
    const e = Math.ceil(Math.max(...ends) / 60) * 60
    return { start: s, end: Math.max(e, s + 60) }
  }, [coverageSlots, assignments])

  const totalMin = range.end - range.start
  const hours = useMemo(() => {
    const out: number[] = []
    for (let m = range.start; m <= range.end; m += 60) out.push(m)
    return out
  }, [range])

  // ── Franjas de 30 min con cobertura requerida vs planificada ──
  const franjas = useMemo(() => {
    const out: Array<{ time: string; required: number; planned: number; slots: any[] }> = []
    for (let m = range.start; m < range.end; m += 30) {
      const time = minToTime(m)
      const slotsHere = coverageSlots.filter((s: any) => s.startTime === time)
      const required = slotsHere.reduce((acc: number, s: any) => acc + s.minWorkers, 0)
      const planned = assignments.filter((a: any) => {
        const aS = timeToMin(a.startTime), aE = endMin(a.endTime)
        return m >= aS && m < aE
      }).length
      out.push({ time, required, planned, slots: slotsHere })
    }
    return out
  }, [range, coverageSlots, assignments])

  const maxBar = Math.max(1, ...franjas.map(f => Math.max(f.required, f.planned)))

  // Empleados con turno hoy primero, luego el resto
  const sortedEmployees = useMemo(() => {
    const withShift = employees.filter((e: any) => assignments.some((a: any) => a.employeeId === e.id))
    const without = employees.filter((e: any) => !assignments.some((a: any) => a.employeeId === e.id))
    return [...withShift, ...without]
  }, [employees, assignments])

  const pct = (m: number) => ((m - range.start) / totalMin) * 100

  return (
    <div className="flex flex-col h-[calc(100vh-52px)] overflow-hidden bg-[#F7F8FA]">

      {/* ══════════ HEADER ══════════ */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Tabs de temporalidad */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 border border-gray-200">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-white text-indigo-600 shadow-sm">
              <Clock size={13} /> Día
            </button>
            <button
              onClick={() => router.push('/planning')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              <CalendarDays size={13} /> Semana
            </button>
            <button
              onClick={() => {
                const d = new Date(dateISO + 'T00:00:00Z')
                router.push(`/planning/month/${d.getUTCFullYear()}/${d.getUTCMonth() + 1}`)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              <Calendar size={13} /> Mes
            </button>
          </div>

          {/* Navegador de días */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
            <button onClick={() => router.push(`/planning/day/${addDaysISO(dateISO, -1)}`)}
              className="p-0.5 rounded hover:bg-gray-200 transition-colors text-gray-500">
              <ChevronLeft size={15} />
            </button>
            <span className="text-[13px] font-bold text-gray-800 px-2 min-w-[190px] text-center capitalize">
              {fmtDate(dateISO)}
            </span>
            <button onClick={() => router.push(`/planning/day/${addDaysISO(dateISO, 1)}`)}
              className="p-0.5 rounded hover:bg-gray-200 transition-colors text-gray-500">
              <ChevronRight size={15} />
            </button>
          </div>

          {!isTodayISO(dateISO) && (
            <button
              onClick={() => router.push(`/planning/day/${new Date().toISOString().slice(0, 10)}`)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-indigo-600 hover:bg-indigo-50 transition-colors">
              Hoy
            </button>
          )}

          {isTodayISO(dateISO) && (
            <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold">HOY</span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[12px] text-gray-400">
          {laborRoles.length > 0 && (
            <div className="mr-1">
              <RoleFilterDropdown roles={laborRoles} selected={roleFilter} onChange={setRoleFilter} />
            </div>
          )}
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" /> Planificado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gray-200 inline-block" /> Necesidades
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-indigo-200 inline-block" /> Exceso
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-400">Click en una barra para editar cobertura</span>
        </div>
      </div>

      {/* ══════════ CONTENIDO ══════════ */}
      <div className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm min-w-[1000px]">

          {/* ── Eje de horas ── */}
          <div className="flex border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
            <div className="w-[190px] min-w-[190px] px-4 py-2.5 border-r border-gray-200">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Empleados</span>
            </div>
            <div className="flex-1 relative h-[34px]">
              {hours.map(m => (
                <div key={m} className="absolute top-0 bottom-0 flex items-center" style={{ left: `${pct(m)}%` }}>
                  <span className={cn('text-[11px] font-mono -translate-x-1/2', m === range.start ? 'translate-x-0 text-emerald-600 font-bold' : 'text-gray-400')}>
                    {minToTime(m) === '00:00' && m === 24 * 60 ? '00h' : `${String(Math.floor(m / 60)).padStart(2, '0')}h`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Histograma cobertura: planificado vs necesidades ── */}
          <div className="flex border-b border-gray-200">
            <div className="w-[190px] min-w-[190px] px-4 py-2 border-r border-gray-200 flex items-center gap-1.5">
              <Users size={12} className="text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-500">Cobertura</span>
            </div>
            <div className="flex-1 relative" style={{ height: 110 }}>
              {/* líneas verticales de hora */}
              {hours.map(m => (
                <div key={m} className="absolute top-0 bottom-0 w-px bg-gray-50" style={{ left: `${pct(m)}%` }} />
              ))}
              {franjas.map((f, i) => {
                const covered = Math.min(f.planned, f.required)
                const excess = Math.max(0, f.planned - f.required)
                const barW = 100 / franjas.length
                const hUnit = 78 / maxBar // px por persona (dejando sitio para el número)
                const isHover = hoverFranja === f.time
                return (
                  <div
                    key={f.time}
                    className="absolute bottom-0 top-0 cursor-pointer group/bar"
                    style={{ left: `${i * barW}%`, width: `${barW}%` }}
                    onMouseEnter={() => setHoverFranja(f.time)}
                    onMouseLeave={() => setHoverFranja(null)}
                    onClick={() => setQuickEdit({ time: f.time, slot: f.slots[0] ?? null })}
                    title={`${f.time}: planificado ${f.planned} / necesario ${f.required}`}
                  >
                    <div className={cn('absolute inset-x-[15%] top-1 bottom-5 flex items-end justify-center rounded-sm transition-colors', isHover && 'bg-indigo-50')}>
                      {/* necesidades (fondo gris) */}
                      {f.required > 0 && (
                        <div className="absolute bottom-0 inset-x-0 rounded-sm bg-gray-200"
                          style={{ height: f.required * hUnit }} />
                      )}
                      {/* planificado cubierto (azul) */}
                      {covered > 0 && (
                        <div className="absolute bottom-0 inset-x-0 rounded-sm bg-indigo-500"
                          style={{ height: covered * hUnit }} />
                      )}
                      {/* exceso (azul claro, encima) */}
                      {excess > 0 && (
                        <div className="absolute inset-x-0 rounded-sm bg-indigo-300"
                          style={{ bottom: covered * hUnit, height: excess * hUnit }} />
                      )}
                    </div>
                    <div className={cn('absolute bottom-0.5 inset-x-0 text-center text-[9px] font-mono',
                      f.planned < f.required ? 'text-red-500 font-bold' : 'text-gray-400')}>
                      {f.planned}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Timeline de empleados ── */}
          {sortedEmployees.map((emp: any) => {
            const empShifts = assignments.filter((a: any) => a.employeeId === emp.id)
            const col = empColorMap[emp.id]
            const role = emp.skills?.[0]?.laborRole
            const initials = `${emp.firstName?.[0] ?? ''}${emp.lastName?.[0] ?? ''}`.toUpperCase()
            const totalH = empShifts.reduce((s: number, a: any) => {
              const dur = (endMin(a.endTime) - timeToMin(a.startTime)) - (a.breakMinutes || 0)
              return s + dur
            }, 0)
            return (
              <div key={emp.id} className="flex border-b border-gray-100 hover:bg-gray-50/40 transition-colors">
                {/* Columna empleado */}
                <div className="w-[190px] min-w-[190px] px-4 py-2 border-r border-gray-200 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: col.dot }}>
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-gray-800 truncate">{emp.firstName} {emp.lastName}</div>
                    {role && <div className="text-[10px] text-gray-400 truncate">{role.name}</div>}
                  </div>
                  <div className="text-[11px] font-mono text-gray-400 flex-shrink-0">
                    {totalH > 0 ? `${Math.floor(totalH / 60)}h${totalH % 60 ? String(totalH % 60).padStart(2, '0') : ''}` : '—'}
                  </div>
                </div>
                {/* Área de barras */}
                <div className="flex-1 relative h-[46px]">
                  {hours.map(m => (
                    <div key={m} className="absolute top-0 bottom-0 w-px bg-gray-50" style={{ left: `${pct(m)}%` }} />
                  ))}
                  {empShifts.map((a: any) => {
                    const s = timeToMin(a.startTime)
                    const e = endMin(a.endTime)
                    const left = pct(Math.max(s, range.start))
                    const width = pct(Math.min(e, range.end)) - left
                    return (
                      <div key={a.id}
                        className="absolute top-[7px] bottom-[7px] rounded-lg border-l-4 px-2 flex items-center gap-2 overflow-hidden shadow-sm"
                        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: col.bg, borderLeftColor: col.dot }}
                        title={`${a.startTime} – ${a.endTime}${a.breakMinutes ? ` · ${a.breakMinutes}m descanso` : ''}`}
                      >
                        <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: col.text }}>
                          {a.startTime} – {a.endTime}
                        </span>
                        {a.breakMinutes > 0 && (
                          <span className="text-[9px] opacity-60 whitespace-nowrap" style={{ color: col.text }}>
                            {a.breakMinutes}m desc.
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {empShifts.length === 0 && (
                    <div className="absolute inset-0 flex items-center px-3">
                      <span className="text-[10px] text-gray-300 italic">Sin turno</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* ── Totales del día ── */}
          <div className="flex bg-gray-50 rounded-b-2xl">
            <div className="w-[190px] min-w-[190px] px-4 py-2.5 border-r border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Total día
            </div>
            <div className="flex-1 px-4 py-2.5 flex items-center gap-5 text-[12px]">
              <span><strong className="text-indigo-600">{assignments.length}</strong> <span className="text-gray-400">turnos</span></span>
              <span><strong className="text-gray-700">{new Set(assignments.map((a: any) => a.employeeId)).size}</strong> <span className="text-gray-400">empleados trabajan</span></span>
              <span>
                <strong className={cn(franjas.some(f => f.planned < f.required) ? 'text-red-500' : 'text-emerald-600')}>
                  {franjas.filter(f => f.required > 0 && f.planned >= f.required).length}/{franjas.filter(f => f.required > 0).length}
                </strong>{' '}
                <span className="text-gray-400">franjas cubiertas</span>
              </span>
              {periodStatus && (
                <span className="ml-auto text-[11px] text-gray-400">
                  Semana: <strong className="text-gray-500">{periodStatus === 'PUBLISHED' ? 'Publicada' : 'Borrador'}</strong>
                  {periodId && (
                    <button onClick={() => router.push(`/planning/week/${periodId}`)} className="ml-2 text-indigo-600 hover:underline font-semibold">
                      Ver semana →
                    </button>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {!periodId && (
          <div className="mt-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-[12px] text-amber-700">
            Esta fecha no pertenece a ninguna semana de planificación creada. Los turnos aparecerán cuando crees la semana desde el planificador.
          </div>
        )}
      </div>

      {/* ── Modal edición rápida de cobertura ── */}
      {quickEdit && (
        <QuickCoverageEditModal
          date={dateISO}
          time={quickEdit.time}
          slot={quickEdit.slot}
          roles={laborRoles}
          locationId={locationId}
          organizationId={organizationId}
          onClose={() => setQuickEdit(null)}
          onSaved={() => { setQuickEdit(null); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─── Modal de edición rápida (mismo patrón que el del planner semanal) ────────
function QuickCoverageEditModal({ date, time, slot, roles = [], locationId, organizationId, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isEdit = !!slot
  const [min, setMin] = useState(slot?.minWorkers ?? 2)
  const [ideal, setIdeal] = useState(slot?.idealWorkers ?? 2)
  const [isRequired, setIsRequired] = useState(slot?.isRequired ?? true)
  const [laborRoleId, setLaborRoleId] = useState<string>(slot?.laborRoleId ?? '')
  const [notes, setNotes] = useState<string>(slot?.notes ?? '')
  const colors = demandColor(min)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[400px] flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex-shrink-0" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h3 className="text-[13px] font-bold text-gray-900">{isEdit ? 'Editar franja' : 'Nueva franja'}</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">{date} · {time}</p>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div className="flex gap-6 justify-center">
            <div className="text-center">
              <div className="text-[10px] text-gray-400 mb-1.5">Mínimo</div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setMin((m: number) => Math.max(0, m - 1))} className="w-7 h-7 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">−</button>
                <span className="text-[18px] font-bold w-7 text-center" style={{ color: colors.text }}>{min}</span>
                <button onClick={() => setMin((m: number) => m + 1)} className="w-7 h-7 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">+</button>
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-400 mb-1.5">Ideal</div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setIdeal((i: number) => Math.max(min, i - 1))} className="w-7 h-7 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">−</button>
                <span className="text-[18px] font-bold text-gray-800 w-7 text-center">{ideal}</span>
                <button onClick={() => setIdeal((i: number) => i + 1)} className="w-7 h-7 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">+</button>
              </div>
            </div>
          </div>

          {roles.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Rol requerido (opcional)</div>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setLaborRoleId('')}
                  className={cn('px-2.5 py-1 rounded-lg text-[11px] font-semibold border-2 transition-all',
                    !laborRoleId ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-400 hover:border-gray-300')}>
                  Cualquiera
                </button>
                {roles.map((r: any) => (
                  <button key={r.id} onClick={() => setLaborRoleId(laborRoleId === r.id ? '' : r.id)}
                    className={cn('px-2.5 py-1 rounded-lg text-[11px] font-semibold border-2 text-white transition-all',
                      laborRoleId === r.id ? 'scale-105' : 'opacity-50 hover:opacity-75')}
                    style={{ backgroundColor: r.color, borderColor: r.color }}>
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={cn('flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all', isRequired ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white')}
            onClick={() => setIsRequired((v: boolean) => !v)}>
            <div className={cn('w-8 h-4 rounded-full transition-all relative flex-shrink-0', isRequired ? 'bg-red-500' : 'bg-gray-300')}>
              <div className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all', isRequired ? 'left-4' : 'left-0.5')} />
            </div>
            <span className="text-[11px] font-medium text-gray-600">Slot obligatorio</span>
          </div>

          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Notas (opcional)</div>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[12px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej: Necesita barista, hora pico…"
            />
          </div>
        </div>

        <div className="flex justify-between items-center px-5 py-3.5 border-t border-gray-100 flex-shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-red-600 font-medium">¿Eliminar?</span>
              <button disabled={isPending} onClick={() => startTransition(async () => {
                try { await deleteDateSlot(slot.id); toast.success('Franja eliminada'); onSaved() } catch (e: any) { toast.error(e.message) }
              })} className="px-2.5 py-1 rounded-lg text-[11px] bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                Sí
              </button>
              <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1 rounded-lg text-[11px] text-gray-500 hover:bg-gray-100">No</button>
            </div>
          ) : (
            <>
              <button onClick={onClose} className="px-3 py-1.5 rounded-xl text-[12px] text-gray-500 hover:bg-gray-100">Cancelar</button>
              {isEdit && (
                <button onClick={() => setConfirmDelete(true)} className="text-[11px] text-red-500 hover:underline">Eliminar</button>
              )}
            </>
          )}
          {!confirmDelete && (
            <button
              disabled={isPending}
              onClick={() => startTransition(async () => {
                try {
                  await upsertDateSlot({
                    id: slot?.id,
                    locationId, organizationId,
                    dateISO: date,
                    startTime: time,
                    endTime: minToTime(timeToMin(time) + 30),
                    minWorkers: min, idealWorkers: ideal,
                    laborRoleId: laborRoleId || null,
                    isRequired,
                    notes,
                  })
                  toast.success(isEdit ? 'Franja actualizada ✓' : 'Franja creada ✓')
                  onSaved()
                } catch (e: any) { toast.error(e.message) }
              })}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              Guardar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── RoleFilterDropdown — filtro multi-selección de roles ─────────────────────
function RoleFilterDropdown({ roles, selected, onChange }: { roles: any[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const label = selected.length === 0
    ? 'Todos los roles'
    : selected.length === 1
    ? roles.find(r => r.id === selected[0])?.name ?? '1 rol'
    : `${selected.length} roles`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-lg border text-[12px] font-medium transition-colors',
          selected.length > 0 ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        )}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={cn('transition-transform', open && 'rotate-180')}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-30 w-[220px] bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden py-1.5">
          <button
            onClick={() => onChange([])}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-gray-50 transition-colors"
          >
            <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
              selected.length === 0 ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300')}>
              {selected.length === 0 && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
              )}
            </div>
            <span className="text-[12px] font-semibold text-gray-700">Todos los roles</span>
          </button>
          <div className="my-1 border-t border-gray-100" />
          {roles.map((r: any) => {
            const checked = selected.includes(r.id)
            return (
              <button
                key={r.id}
                onClick={() => onChange(checked ? selected.filter(id => id !== r.id) : [...selected, r.id])}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-gray-50 transition-colors"
              >
                <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
                  checked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300')}>
                  {checked && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                  )}
                </div>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                <span className="text-[12px] text-gray-700 truncate">{r.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
