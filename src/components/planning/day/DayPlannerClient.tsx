'use client'

import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Users, Loader2, CheckCircle, X,
  CalendarDays, Calendar, Clock, ArrowLeftRight, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { upsertDateSlot, deleteDateSlot } from '@/server/actions/coverageWeekly'
import { swapAssignments, updateAssignment } from '@/server/actions/planning'
import { ShiftEditorModal } from '@/components/planning/ShiftEditorModal'
import type { ShiftEditorContext } from '@/types'
import { RoleRequirementsEditor, initialRoleRows, type RoleRow } from '@/components/coverage/RoleRequirementsEditor'
import { employeeColorShades, primaryRoleOf, DEFAULT_EMPLOYEE_COLOR } from '@/lib/employee-color'
import { RoleExtraBadge } from '@/components/employees/RoleExtraBadge'

// ─── Constantes ───────────────────────────────────────────────────────────────
// Granularidad del arrastre. 15 min encaja con los slots de cobertura (30 min)
// y permite medias horas sin que el turno "baile" al mover el ratón.
const SNAP_MIN = 15
// Duración mínima de un turno al redimensionar.
const MIN_SHIFT_MIN = 30
const DAYS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Los colores de empleado se derivan de su ROL (ver @/lib/employee-color).

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
  absences?: any[]
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function DayPlannerClient({
  dateISO, periodId, periodStatus, assignments: allAssignments, employees: allEmployees, coverageSlots: allCoverageSlots,
  locationId, organizationId, laborRoles = [], absences = [],
}: Props) {
  const router = useRouter()
  const [quickEdit, setQuickEdit] = useState<{ time: string; slot: any | null } | null>(null)
  const [hoverFranja, setHoverFranja] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string[]>([])
  const [showSwapModal, setShowSwapModal] = useState(false)

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
    return allCoverageSlots.filter((s: any) => {
      // Nuevo modelo: el slot lista sus roles en roleRequirements.
      if (s.roleRequirements && s.roleRequirements.length > 0) {
        return s.roleRequirements.some((rr: any) => roleFilter.includes(rr.laborRoleId))
      }
      // Fallback legacy: campo laborRoleId único.
      return roleFilter.includes(s.laborRoleId)
    })
  }, [allCoverageSlots, roleFilter])

  const empColorMap = useMemo(() => Object.fromEntries(
    allEmployees.map((e: any) => [e.id, employeeColorShades(e, laborRoles)])
  ), [allEmployees, laborRoles])

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

  // ── Franjas de 30 min con cobertura requerida vs planificada, DESGLOSADA POR ROL ──
  // Cada rol se cuenta de forma ESTRICTA: solo suman los empleados cuyo rol
  // principal es exactamente ese (un encargado NO cubre demanda de camarero aquí).
  const franjas = useMemo(() => {
    // Mapa empleadoId -> rol principal (id, nombre, color) para conteo estricto.
    const empRole = new Map<string, { id: string; name: string; color: string } | null>()
    for (const e of allEmployees) {
      const r = primaryRoleOf(e)
      empRole.set(e.id, r ? { id: r.id ?? 'sin', name: r.name ?? 'Rol', color: r.color ?? DEFAULT_EMPLOYEE_COLOR } : null)
    }

    type RoleBar = { roleId: string; name: string; color: string; min: number; assigned: number }
    const out: Array<{
      time: string
      required: number      // suma de mínimos (todos los roles)
      planned: number       // total asignados
      roles: RoleBar[]      // desglose por rol
      slots: any[]
    }> = []

    for (let m = range.start; m < range.end; m += 30) {
      const time = minToTime(m)
      const slotsHere = coverageSlots.filter((s: any) => s.startTime === time)

      // Demanda mínima por rol (sumando roleRequirements de los slots de la franja).
      const demandByRole = new Map<string, { name: string; color: string; min: number }>()
      for (const s of slotsHere) {
        const reqs: any[] = s.roleRequirements ?? []
        if (reqs.length > 0) {
          for (const rr of reqs) {
            const id = rr.laborRoleId ?? 'sin'
            const prev = demandByRole.get(id) ?? { name: rr.laborRole?.name ?? 'Rol', color: rr.laborRole?.color ?? DEFAULT_EMPLOYEE_COLOR, min: 0 }
            prev.min += rr.minWorkers ?? 0
            demandByRole.set(id, prev)
          }
        } else if (s.minWorkers > 0) {
          // Slot legacy sin desglose: cae en un cubo genérico.
          const prev = demandByRole.get('__any__') ?? { name: 'Cualquiera', color: '#9ca3af', min: 0 }
          prev.min += s.minWorkers
          demandByRole.set('__any__', prev)
        }
      }

      // Asignados en esta franja, agrupados por rol principal (estricto).
      const assignedByRole = new Map<string, number>()
      let planned = 0
      for (const a of assignments) {
        const aS = timeToMin(a.startTime), aE = endMin(a.endTime)
        if (m >= aS && m < aE) {
          planned++
          const r = empRole.get(a.employeeId)
          const key = r?.id ?? '__none__'
          assignedByRole.set(key, (assignedByRole.get(key) ?? 0) + 1)
        }
      }

      // Construir las barras por rol. Para slots legacy (__any__) contamos todos.
      const roles: RoleBar[] = []
      for (const [roleId, d] of demandByRole) {
        const assigned = roleId === '__any__' ? planned : (assignedByRole.get(roleId) ?? 0)
        roles.push({ roleId, name: d.name, color: d.color, min: d.min, assigned })
      }
      // Orden estable por nombre para que no bailen entre franjas.
      roles.sort((a, b) => a.name.localeCompare(b.name))

      const required = roles.reduce((acc, r) => acc + r.min, 0)
      out.push({ time, required, planned, roles, slots: slotsHere })
    }
    return out
  }, [range, coverageSlots, assignments, allEmployees])

  const maxBar = Math.max(1, ...franjas.map(f => Math.max(f.required, f.planned)))

  // Empleados con turno hoy primero, luego el resto
  const sortedEmployees = useMemo(() => {
    const withShift = employees.filter((e: any) => assignments.some((a: any) => a.employeeId === e.id))
    const without = employees.filter((e: any) => !assignments.some((a: any) => a.employeeId === e.id))
    return [...withShift, ...without]
  }, [employees, assignments])

  const pct = (m: number) => ((m - range.start) / totalMin) * 100

  // ══════════ EDICIÓN INTERACTIVA DE TURNOS ══════════
  // Los turnos se pueden mover (arrastrar el cuerpo), estirar (tiradores en los
  // bordes) o abrir en el editor (click limpio, sin desplazamiento).
  const [isPending, startTransition] = useTransition()
  const [editor, setEditor] = useState<ShiftEditorContext>({ isOpen: false, mode: 'create' })

  type DragState = {
    id: string
    mode: 'move' | 'start' | 'end'
    originStart: number
    originEnd: number
    start: number
    end: number
    startX: number
    pxPerMin: number
    moved: boolean
  }
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)

  // Solo se edita si la semana existe y no está publicada.
  const editable = !!periodId && periodStatus !== 'PUBLISHED'
  const dateObj = useMemo(() => new Date(dateISO + 'T00:00:00Z'), [dateISO])

  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v))
  }

  function openEditor(a: any) {
    if (!editable) return
    setEditor({
      isOpen: true,
      mode: 'edit',
      assignmentId: a.id,
      employeeId: a.employeeId,
      dayIndex: 0,
      initialValues: {
        employeeId: a.employeeId,
        date: dateObj,
        startTime: a.startTime,
        endTime: a.endTime,
        breakMinutes: a.breakMinutes ?? 0,
        laborRoleId: a.laborRoleId ?? undefined,
        notes: a.notes ?? undefined,
        isLocked: a.isLocked ?? false,
        isSplit: a.isSplit ?? false,
      },
    })
  }

  function openCreator(employeeId: string, atMin: number) {
    if (!editable) return
    const start = clamp(Math.round(atMin / SNAP_MIN) * SNAP_MIN, range.start, range.end - 60)
    const end = clamp(start + 4 * 60, start + MIN_SHIFT_MIN, range.end)
    setEditor({
      isOpen: true,
      mode: 'create',
      employeeId,
      dayIndex: 0,
      initialValues: {
        employeeId,
        date: dateObj,
        startTime: minToTime(start),
        endTime: minToTime(end),
        breakMinutes: 20,
        isLocked: false,
        isSplit: false,
      },
    })
  }

  // Inicio del arrastre. El ancho real de la pista se mide en el momento
  // (getBoundingClientRect) porque el layout es porcentual y responsive.
  function beginDrag(e: React.PointerEvent, a: any, mode: DragState['mode']) {
    if (!editable) return
    if (a.isLocked) { toast.error('El turno está bloqueado'); return }
    const track = (e.currentTarget as HTMLElement).closest('[data-day-track]') as HTMLElement | null
    if (!track) return
    const rect = track.getBoundingClientRect()
    const pxPerMin = rect.width / totalMin
    if (!pxPerMin || !isFinite(pxPerMin)) return
    e.preventDefault()
    e.stopPropagation()
    const st: DragState = {
      id: a.id,
      mode,
      originStart: timeToMin(a.startTime),
      originEnd: endMin(a.endTime),
      start: timeToMin(a.startTime),
      end: endMin(a.endTime),
      startX: e.clientX,
      pxPerMin,
      moved: false,
    }
    dragRef.current = st
    setDrag(st)
  }

  const isDragging = drag !== null

  useEffect(() => {
    if (!isDragging) return

    function onMove(ev: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      const deltaMin = Math.round(((ev.clientX - d.startX) / d.pxPerMin) / SNAP_MIN) * SNAP_MIN
      let start = d.originStart
      let end = d.originEnd
      if (d.mode === 'move') {
        const dur = d.originEnd - d.originStart
        start = clamp(d.originStart + deltaMin, range.start, range.end - dur)
        end = start + dur
      } else if (d.mode === 'start') {
        start = clamp(d.originStart + deltaMin, range.start, d.originEnd - MIN_SHIFT_MIN)
      } else {
        end = clamp(d.originEnd + deltaMin, d.originStart + MIN_SHIFT_MIN, range.end)
      }
      const next: DragState = {
        ...d,
        start,
        end,
        moved: d.moved || start !== d.originStart || end !== d.originEnd,
      }
      dragRef.current = next
      setDrag(next)
    }

    function onUp() {
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return
      // Sin desplazamiento = click limpio → abrir el editor completo.
      if (!d.moved) {
        const a = allAssignments.find((x: any) => x.id === d.id)
        if (a) openEditor(a)
        return
      }
      const startTime = minToTime(d.start)
      const endTime = minToTime(d.end)
      startTransition(async () => {
        try {
          await updateAssignment(d.id, { startTime, endTime })
          toast.success(`Turno actualizado · ${startTime} – ${endTime}`)
          router.refresh()
        } catch (err: any) {
          toast.error(err?.message || 'No se pudo actualizar el turno')
          router.refresh()
        }
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, range.start, range.end, totalMin, allAssignments])

  // Cursor global mientras se arrastra, para que no parpadee al salir de la barra.
  useEffect(() => {
    if (!isDragging) return
    const prev = document.body.style.cursor
    document.body.style.cursor = drag?.mode === 'move' ? 'grabbing' : 'ew-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = prev
      document.body.style.userSelect = ''
    }
  }, [isDragging, drag?.mode])

  const dowOfDate = (new Date(dateISO + 'T00:00:00Z').getUTCDay() + 6) % 7

  const ABSENCE_CFG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
    VACACIONES:    { label: 'Vacaciones', bg: '#eff6ff', text: '#1d4ed8', icon: '🏖️' },
    BAJA:          { label: 'Baja',       bg: '#fef2f2', text: '#dc2626', icon: '🤒' },
    PERMISO:       { label: 'Permiso',    bg: '#fefce8', text: '#ca8a04', icon: '📋' },
    AUSENCIA:      { label: 'Ausencia',   bg: '#fdf4ff', text: '#9333ea', icon: '❌' },
    ASUNTO_PROPIO: { label: 'Asunto',     bg: '#f0fdf4', text: '#16a34a', icon: '🏠' },
  }

  function getAbsence(empId: string) {
    const a = absences.find((x: any) => x.employeeId === empId)
    if (!a) return null
    return ABSENCE_CFG[a.type] || { label: a.type, bg: '#f9fafb', text: '#6b7280', icon: '📅' }
  }

  // Zonas horarias bloqueadas por disponibilidad, recortadas al rango visible del eje
  function getUnavailZones(emp: any): Array<{ start: number; end: number; label: string }> {
    const zones: Array<{ start: number; end: number; label: string }> = []
    for (const av of (emp.availabilities || [])) {
      const matchesDay = av.dayOfWeek === dowOfDate && (av.isRecurring || av.date == null)
      const matchesDate = av.date && new Date(av.date).toISOString().slice(0, 10) === dateISO
      if (!matchesDay && !matchesDate) continue

      if (av.type === 'DAY_OFF') {
        if (av.startTime && av.endTime) {
          zones.push({ start: timeToMin(av.startTime), end: endMin(av.endTime), label: `No disponible ${av.startTime}–${av.endTime}` })
        } else {
          zones.push({ start: range.start, end: range.end, label: 'Día libre' })
        }
      } else if (av.type === 'NOT_BEFORE' && av.startTime) {
        zones.push({ start: range.start, end: timeToMin(av.startTime), label: `No antes de ${av.startTime}` })
      } else if (av.type === 'NOT_AFTER' && av.endTime) {
        zones.push({ start: timeToMin(av.endTime), end: range.end, label: `No después de ${av.endTime}` })
      } else if (av.type === 'ONLY_BETWEEN' && av.startTime && av.endTime) {
        zones.push({ start: range.start, end: timeToMin(av.startTime), label: `Solo disponible ${av.startTime}–${av.endTime}` })
        zones.push({ start: endMin(av.endTime), end: range.end, label: `Solo disponible ${av.startTime}–${av.endTime}` })
      }
    }
    // Recortar al rango visible y descartar zonas vacías
    return zones
      .map(z => ({ ...z, start: Math.max(z.start, range.start), end: Math.min(z.end, range.end) }))
      .filter(z => z.end > z.start)
  }

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
              onClick={() => {
                if (periodId) {
                  router.push(`/planning/week/${periodId}`)
                } else {
                  // No hay semana creada para este día → mostrar el listado de semanas
                  router.push('/planning')
                }
              }}
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
          {periodId && periodStatus !== 'PUBLISHED' && (
            <button
              onClick={() => setShowSwapModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-[12px] font-medium hover:bg-gray-50 transition-colors mr-1"
            >
              <ArrowLeftRight size={13} /> Intercambiar
            </button>
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
          {isPending ? (
            <span className="flex items-center gap-1.5 text-indigo-600 font-medium">
              <Loader2 size={12} className="animate-spin" /> Guardando…
            </span>
          ) : (
            <span className="text-gray-400">
              {editable
                ? 'Arrastra los turnos para moverlos · tira de los bordes para alargarlos · click para editar'
                : 'Click en una barra para editar cobertura'}
            </span>
          )}
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
                const barW = 100 / franjas.length
                const hUnit = 78 / maxBar // px por persona
                const isHover = hoverFranja === f.time
                const totalMinDemand = f.required
                // Nº de personas que faltan (para el color del número inferior).
                const totalCovered = f.roles.reduce((acc, r) => acc + Math.min(r.assigned, r.min), 0)
                const falta = Math.max(0, totalMinDemand - totalCovered)
                return (
                  <div
                    key={f.time}
                    className="absolute bottom-0 top-0 cursor-pointer group/bar"
                    style={{ left: `${i * barW}%`, width: `${barW}%` }}
                    onMouseEnter={() => setHoverFranja(f.time)}
                    onMouseLeave={() => setHoverFranja(null)}
                    onClick={() => setQuickEdit({ time: f.time, slot: f.slots[0] ?? null })}
                    title={
                      f.roles.length > 0
                        ? `${f.time} — ${f.roles.map(r => `${r.name}: ${r.assigned}/${r.min}`).join(' · ')}`
                        : `${f.time}: sin cobertura`
                    }
                  >
                    <div className={cn('absolute inset-x-[15%] top-1 bottom-5 flex items-end justify-center rounded-sm transition-colors', isHover && 'bg-indigo-50')}>
                      {/* Segmentos por rol, apilados de abajo arriba.
                          Altura ∝ mínimo del rol. Dentro: verde=cubierto, rojo=falta. */}
                      {f.roles.map((r, ri) => {
                        // Offset acumulado de los roles previos (para apilar).
                        const below = f.roles.slice(0, ri).reduce((acc, rr) => acc + rr.min, 0)
                        const segH = r.min * hUnit
                        const coveredH = Math.min(r.assigned, r.min) * hUnit
                        const missingH = segH - coveredH
                        return (
                          <div key={r.roleId} className="absolute inset-x-0" style={{ bottom: below * hUnit, height: segH }}>
                            {/* parte roja (lo que falta) arriba */}
                            {missingH > 0 && (
                              <div className="absolute inset-x-0 top-0 bg-red-400/80"
                                style={{ height: missingH }}
                                title={`${r.name}: faltan ${r.min - r.assigned}`} />
                            )}
                            {/* parte verde (cubierto) abajo */}
                            {coveredH > 0 && (
                              <div className="absolute inset-x-0 bottom-0 bg-emerald-500"
                                style={{ height: coveredH }} />
                            )}
                            {/* separador fino entre roles */}
                            {ri > 0 && <div className="absolute inset-x-0 top-0 h-px bg-white/70" />}
                          </div>
                        )
                      })}
                      {/* Exceso sobre el mínimo total (gente de más), gris tenue encima */}
                      {f.planned > f.required && f.required > 0 && (
                        <div className="absolute inset-x-0 rounded-t-sm bg-indigo-200/60"
                          style={{ bottom: f.required * hUnit, height: (f.planned - f.required) * hUnit }}
                          title={`${f.planned - f.required} de más`} />
                      )}
                    </div>
                    <div className={cn('absolute bottom-0.5 inset-x-0 text-center text-[9px] font-mono',
                      falta > 0 ? 'text-red-500 font-bold' : 'text-emerald-600')}>
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
                    <div className="text-[12px] font-semibold text-gray-800 truncate flex items-center gap-1.5">
                      <span className="truncate">{emp.firstName} {emp.lastName}</span>
                      <RoleExtraBadge employee={emp} size="sm" />
                    </div>
                    {role && <div className="text-[10px] text-gray-400 truncate">{role.name}</div>}
                  </div>
                  <div className="text-[11px] font-mono text-gray-400 flex-shrink-0">
                    {totalH > 0 ? `${Math.floor(totalH / 60)}h${totalH % 60 ? String(totalH % 60).padStart(2, '0') : ''}` : '—'}
                  </div>
                </div>
                {/* Área de barras — pista de referencia para medir el arrastre */}
                <div
                  data-day-track
                  className={cn('flex-1 relative h-[46px]', editable && 'cursor-copy')}
                  onClick={ev => {
                    // Click en hueco vacío → crear turno empezando a esa hora.
                    if (!editable || drag) return
                    if ((ev.target as HTMLElement).closest('[data-shift-bar]')) return
                    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
                    if (!rect.width) return
                    const atMin = range.start + ((ev.clientX - rect.left) / rect.width) * totalMin
                    openCreator(emp.id, atMin)
                  }}
                >
                  {hours.map(m => (
                    <div key={m} className="absolute top-0 bottom-0 w-px bg-gray-50" style={{ left: `${pct(m)}%` }} />
                  ))}
                  {/* Zonas bloqueadas por disponibilidad (rayado) — informativas, no bloquean */}
                  {getUnavailZones(emp).map((z, zi) => (
                    <div key={`z${zi}`}
                      title={z.label}
                      className="absolute top-0 bottom-0 border-x border-gray-200/60 flex items-center justify-center overflow-hidden"
                      style={{
                        left: `${pct(z.start)}%`,
                        width: `${pct(z.end) - pct(z.start)}%`,
                        background: 'repeating-linear-gradient(45deg, rgba(148,163,184,0.10), rgba(148,163,184,0.10) 6px, rgba(148,163,184,0.22) 6px, rgba(148,163,184,0.22) 12px)',
                      }}
                    >
                      {(pct(z.end) - pct(z.start)) > 9 && (
                        <span className="text-[9px] font-semibold text-gray-400 whitespace-nowrap px-1">🚫 {z.label}</span>
                      )}
                    </div>
                  ))}
                  {/* Ausencia aprobada: overlay de todo el día */}
                  {(() => {
                    const abs = getAbsence(emp.id)
                    if (!abs) return null
                    return (
                      <div
                        title={`${abs.label} — ausencia aprobada`}
                        className="absolute inset-0 flex items-center justify-center gap-1 border-y-2 border-dashed"
                        style={{ backgroundColor: abs.bg + 'cc', borderColor: abs.text + '44' }}
                      >
                        <span className="text-[12px]">{abs.icon}</span>
                        <span className="text-[10px] font-bold" style={{ color: abs.text }}>{abs.label}</span>
                      </div>
                    )
                  })()}
                  {empShifts.map((a: any) => {
                    // Mientras se arrastra este turno se pinta la posición
                    // provisional, no la guardada — feedback inmediato.
                    const dragging = drag?.id === a.id
                    const s = dragging ? drag!.start : timeToMin(a.startTime)
                    const e = dragging ? drag!.end : endMin(a.endTime)
                    const left = pct(Math.max(s, range.start))
                    const width = pct(Math.min(e, range.end)) - left
                    const label = `${minToTime(s)} – ${minToTime(e)}`
                    const locked = !!a.isLocked
                    const canEdit = editable && !locked
                    return (
                      <div key={a.id}
                        data-shift-bar
                        onPointerDown={ev => beginDrag(ev, a, 'move')}
                        className={cn(
                          'absolute top-[7px] bottom-[7px] rounded-lg border-l-4 px-2 flex items-center gap-2 overflow-hidden shadow-sm group/shift',
                          canEdit && 'cursor-grab hover:shadow-md hover:brightness-[0.98] transition-shadow',
                          locked && 'cursor-not-allowed',
                          dragging && 'shadow-lg ring-2 ring-indigo-400 z-20 cursor-grabbing',
                        )}
                        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: col.bg, borderLeftColor: col.dot }}
                        title={canEdit
                          ? `${label}${a.breakMinutes ? ` · ${a.breakMinutes}m descanso` : ''} — arrastra para mover, tira de los bordes para alargar, click para editar`
                          : `${label}${locked ? ' · bloqueado' : ''}`}
                      >
                        {/* Tirador izquierdo */}
                        {canEdit && (
                          <div
                            onPointerDown={ev => beginDrag(ev, a, 'start')}
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 flex items-center justify-center opacity-0 group-hover/shift:opacity-100 transition-opacity"
                          >
                            <span className="w-[3px] h-3 rounded-full bg-white/80 shadow" />
                          </div>
                        )}

                        <span className="text-[11px] font-bold whitespace-nowrap pointer-events-none" style={{ color: col.text }}>
                          {label}
                        </span>
                        {locked && <span className="text-[9px] pointer-events-none">🔒</span>}
                        {a.breakMinutes > 0 && !dragging && (
                          <span className="text-[9px] opacity-60 whitespace-nowrap pointer-events-none" style={{ color: col.text }}>
                            {a.breakMinutes}m desc.
                          </span>
                        )}

                        {/* Tirador derecho */}
                        {canEdit && (
                          <div
                            onPointerDown={ev => beginDrag(ev, a, 'end')}
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 flex items-center justify-center opacity-0 group-hover/shift:opacity-100 transition-opacity"
                          >
                            <span className="w-[3px] h-3 rounded-full bg-white/80 shadow" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {empShifts.length === 0 && !getAbsence(emp.id) && getUnavailZones(emp).length === 0 && (
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
                <strong className={cn(franjas.some(f => f.required > 0 && f.roles.some(r => r.assigned < r.min)) ? 'text-red-500' : 'text-emerald-600')}>
                  {franjas.filter(f => f.required > 0 && f.roles.every(r => r.assigned >= r.min)).length}/{franjas.filter(f => f.required > 0).length}
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

      {/* ── Modal intercambio de turnos del día ── */}
      {/* Editor de turno — click sobre una barra (o sobre hueco vacío para crear) */}
      {editor.isOpen && periodId && (
        <ShiftEditorModal
          context={editor}
          planningPeriodId={periodId}
          employees={allEmployees as any}
          weekDays={[dateObj]}
          onClose={() => { setEditor({ isOpen: false, mode: 'create' }); router.refresh() }}
        />
      )}

      {showSwapModal && periodId && (
        <SwapModal
          scope="day"
          periodId={periodId}
          fromDateISO={dateISO}
          toDateISO={dateISO}
          rangeLabel={fmtDate(dateISO)}
          employees={allEmployees}
          assignments={Object.fromEntries(allEmployees.map((e: any) => [e.id, allAssignments.filter((a: any) => a.employeeId === e.id).length]))}
          onClose={() => setShowSwapModal(false)}
          onSwapped={() => { setShowSwapModal(false); router.refresh() }}
        />
      )}

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
  const [isRequired, setIsRequired] = useState(slot?.isRequired ?? true)
  const [notes, setNotes] = useState<string>(slot?.notes ?? '')
  const [roleRows, setRoleRows] = useState<RoleRow[]>(() => initialRoleRows(slot, roles))

  const totals = useMemo(() => {
    let min = 0, ideal = 0
    for (const r of roleRows) { min += r.minWorkers; ideal += r.idealWorkers }
    return { min, ideal }
  }, [roleRows])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[400px] flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex-shrink-0" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h3 className="text-[13px] font-bold text-gray-900">{isEdit ? 'Editar franja' : 'Nueva franja'}</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">{date} · {time}</p>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Necesidades por rol</div>
            <RoleRequirementsEditor
              value={roleRows}
              onChange={setRoleRows}
              roles={roles}
            />
          </div>

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
              disabled={isPending || roleRows.length === 0 || totals.ideal === 0}
              onClick={() => startTransition(async () => {
                try {
                  await upsertDateSlot({
                    id: slot?.id,
                    locationId, organizationId,
                    dateISO: date,
                    startTime: time,
                    endTime: minToTime(timeToMin(time) + 30),
                    roles: roleRows.map(r => ({
                      laborRoleId: r.laborRoleId,
                      minWorkers: r.minWorkers,
                      idealWorkers: r.idealWorkers,
                    })),
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

// ─── SwapModal — intercambiar turnos del día entre dos empleados ──────────────
function SwapModal({ scope, periodId, fromDateISO, toDateISO, rangeLabel, employees, assignments, onClose, onSwapped }: any) {
  const [isPending, startTransition] = useTransition()
  const [empA, setEmpA] = useState<string>('')
  const [empB, setEmpB] = useState<string>('')

  const countA = empA ? (assignments[empA] ?? 0) : 0
  const countB = empB ? (assignments[empB] ?? 0) : 0

  function EmpSelect({ value, onChange, exclude, placeholder }: any) {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
      >
        <option value="">{placeholder}</option>
        {employees
          .filter((e: any) => e.id !== exclude)
          .map((e: any) => (
            <option key={e.id} value={e.id}>
              {e.firstName} {e.lastName}{e.skills?.[0]?.laborRole ? ` · ${e.skills[0].laborRole.name}` : ''}
            </option>
          ))}
      </select>
    )
  }

  const roleA = empA ? employees.find((e: any) => e.id === empA)?.skills?.[0]?.laborRole?.name : null
  const roleB = empB ? employees.find((e: any) => e.id === empB)?.skills?.[0]?.laborRole?.name : null
  const differentRoles = roleA && roleB && roleA !== roleB

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[440px]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h3 className="text-[15px] font-bold text-gray-900">Intercambiar turnos del día</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 capitalize">{rangeLabel}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Empleado A</label>
            <EmpSelect value={empA} onChange={setEmpA} exclude={empB} placeholder="Selecciona empleado…" />
            {empA && (
              <p className="text-[11px] text-gray-400 mt-1">
                {countA} turno{countA !== 1 ? 's' : ''} este día{countA > 0 ? ' → pasarán al Empleado B' : ''}
              </p>
            )}
          </div>

          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center">
              <ArrowLeftRight size={14} className="text-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Empleado B</label>
            <EmpSelect value={empB} onChange={setEmpB} exclude={empA} placeholder="Selecciona empleado…" />
            {empB && (
              <p className="text-[11px] text-gray-400 mt-1">
                {countB} turno{countB !== 1 ? 's' : ''} este día{countB > 0 ? ' → pasarán al Empleado A' : ''}
              </p>
            )}
          </div>

          {differentRoles && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700">
                Roles distintos ({roleA} ↔ {roleB}). El intercambio puede descuadrar la cobertura por rol — revísala después.
              </p>
            </div>
          )}

          {empA && empB && countA === 0 && countB === 0 && (
            <p className="text-[11px] text-red-500">Ninguno de los dos tiene turnos este día.</p>
          )}
        </div>

        <div className="flex justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100">Cancelar</button>
          <button
            disabled={isPending || !empA || !empB || (countA === 0 && countB === 0)}
            onClick={() => startTransition(async () => {
              try {
                const r = await swapAssignments({
                  planningPeriodId: periodId,
                  employeeAId: empA,
                  employeeBId: empB,
                  fromDateISO,
                  toDateISO,
                })
                toast.success(`Intercambio hecho: ${r.movedFromA + r.movedFromB} turnos ✓`)
                onSwapped()
              } catch (e: any) { toast.error(e.message) }
            })}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
            Intercambiar
          </button>
        </div>
      </div>
    </div>
  )
}
