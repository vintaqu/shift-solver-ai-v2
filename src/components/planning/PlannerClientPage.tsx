'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format, isToday, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Sparkles, Send, Plus,
  Lock, Unlock, Trash2, AlertTriangle, AlertCircle,
  CheckCircle, Info, Clock, User, BarChart2, X,
  Copy, RotateCcw, Download, Eye, Loader2, FileSpreadsheet
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createAssignment, updateAssignment, moveAssignment, deleteAssignment, toggleAssignmentLock, publishPlanningPeriod } from '@/server/actions/planning'
import { updateEmployeeOrder } from '@/server/actions/employees'
import { GenerateModal } from './GenerateModal'

// ─── Paleta de colores por empleado ───────────────────────────────────────────
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

// ─── Colores de estado del planning ───────────────────────────────────────────
const STATUS_COLORS: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'Borrador',  cls: 'bg-amber-100 text-amber-700 border border-amber-300' },
  GENERATED: { label: 'Generado', cls: 'bg-blue-100 text-blue-700 border border-blue-300' },
  REVIEWED:  { label: 'Revisado', cls: 'bg-violet-100 text-violet-700 border border-violet-300' },
  PUBLISHED: { label: '✓ Publicado', cls: 'bg-emerald-100 text-emerald-700 border border-emerald-300' },
}

const DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
function durationH(start: string, end: string, breakMin = 0) {
  let s = timeToMin(start), e = timeToMin(end)
  if (e <= s) e += 24 * 60
  return Math.max(0, (e - s - breakMin) / 60)
}
// Horas brutas (sin descontar descanso) — tiempo total en jornada
function durationBruto(start: string, end: string) {
  let s = timeToMin(start), e = timeToMin(end)
  if (e <= s) e += 24 * 60
  return Math.max(0, (e - s) / 60)
}
// Horas de descanso totales de una lista de assignments
function totalBreakH(assignments: any[]) {
  return assignments.reduce((acc: number, a: any) => acc + (a.breakMinutes || 0), 0) / 60
}
function fmtH(h: number) {
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface AbsenceBlock {
  id: string
  employeeId: string
  type: string
  startDate: string
  endDate: string
}

interface Props {
  period: any
  employees: any[]
  weekDays: string[]  // ISO strings
  allPeriods: any[]
  absences?: AbsenceBlock[]
}

interface EditorState {
  open: boolean
  mode: 'create' | 'edit'
  employeeId?: string
  dayIndex?: number
  assignment?: any
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export function PlannerClientPage({ period, employees, weekDays, allPeriods, absences = [] }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editor, setEditor] = useState<EditorState>({ open: false, mode: 'create' })
  const [showSummary, setShowSummary] = useState(false)
  const [showWeekPicker, setShowWeekPicker] = useState(false)
  // ── Drag & Drop turnos ──
  const [draggedAssignment, setDraggedAssignment] = useState<{ id: string; empId: string; dayIdx: number } | null>(null)
  const [dragOverCell, setDragOverCell] = useState<{ empId: string; dayIdx: number } | null>(null)

  // ── Reordenar empleados ──
  const [employeeOrder, setEmployeeOrder] = useState<string[]>(() => [...employees].sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((e: any) => e.id))
  const [draggedEmpId, setDraggedEmpId] = useState<string | null>(null)
  const [dragOverEmpId, setDragOverEmpId] = useState<string | null>(null)
  const sortedEmployees = employeeOrder
    .map(id => employees.find((e: any) => e.id === id))
    .filter(Boolean)
  const [showGenerate, setShowGenerate] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // Helper: ausencia aprobada de un empleado en un día concreto
  function getAbsenceForDay(empId: string, dayIndex: number): AbsenceBlock | null {
    const dayDate = parseISO(weekDays[dayIndex])
    return absences.find(a => {
      if (a.employeeId !== empId) return false
      const start = parseISO(a.startDate)
      const end = parseISO(a.endDate)
      return dayDate >= start && dayDate <= end
    }) || null
  }

  // Asignar color fijo por empleado
  const empColorMap = Object.fromEntries(
    employees.map((e: any, i: number) => [e.id, EMP_COLORS[i % EMP_COLORS.length]])
  )

  // Agrupar assignments por empleado y día
  const assignmentsByEmpDay: Record<string, Record<number, any[]>> = {}
  for (const a of period.assignments) {
    if (!assignmentsByEmpDay[a.employeeId]) assignmentsByEmpDay[a.employeeId] = {}
    const dayIdx = weekDays.findIndex(d =>
      format(parseISO(d), 'yyyy-MM-dd') === format(new Date(a.date), 'yyyy-MM-dd')
    )
    if (dayIdx === -1) continue
    if (!assignmentsByEmpDay[a.employeeId][dayIdx]) assignmentsByEmpDay[a.employeeId][dayIdx] = []
    assignmentsByEmpDay[a.employeeId][dayIdx].push(a)
  }

  // Horas semanales por empleado (netas = descontando descanso)
  function empWeekHours(empId: string) {
    const days = assignmentsByEmpDay[empId] || {}
    return Object.values(days).flat().reduce((acc: number, a: any) =>
      acc + durationH(a.startTime, a.endTime, a.breakMinutes), 0)
  }
  // Horas brutas semanales (tiempo total en jornada incluyendo descansos)
  function empWeekHoursBruto(empId: string) {
    const days = assignmentsByEmpDay[empId] || {}
    return Object.values(days).flat().reduce((acc: number, a: any) =>
      acc + durationBruto(a.startTime, a.endTime), 0)
  }
  // Total minutos de descanso semanales
  function empWeekBreakMin(empId: string) {
    const days = assignmentsByEmpDay[empId] || {}
    return Object.values(days).flat().reduce((acc: number, a: any) =>
      acc + (a.breakMinutes || 0), 0)
  }

  // Cobertura por día
  function dayCoverage(dayIdx: number) {
    const reqs = period.location.coverageRequirements.filter((r: any) => r.dayOfWeek === dayIdx)
    const maxReq = reqs.length > 0 ? Math.max(...reqs.map((r: any) => r.minWorkers)) : 0
    const working = employees.filter(e =>
      (assignmentsByEmpDay[e.id]?.[dayIdx] || []).length > 0
    ).length
    return { working, required: maxReq, ok: working >= maxReq }
  }

  // Total alertas
  const criticalIssues = period.validationIssues?.filter(
    (i: any) => i.severity === 'BLOCKING' || i.severity === 'ERROR'
  ).length || 0

  // Abrir editor para crear
  const openCreate = (employeeId: string, dayIndex: number) => {
    setEditor({ open: true, mode: 'create', employeeId, dayIndex })
  }

  // Abrir editor para editar
  const openEdit = (assignment: any) => {
    setEditor({ open: true, mode: 'edit', assignment })
  }

  // Publicar
  const handlePublish = async () => {
    setPublishing(true)
    try {
      await publishPlanningPeriod(period.id)
      toast.success('Cuadrante publicado y notificado al equipo ✓')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setPublishing(false)
    }
  }

  const status = STATUS_COLORS[period.status] || STATUS_COLORS.DRAFT
  const weekStart = parseISO(weekDays[0])
  const weekEnd = parseISO(weekDays[6])

  return (
    <div className="flex flex-col overflow-hidden" style={{ background: '#f5f6fa' }}>

      {/* ══════════ SUBBAR PLANIFICADOR ══════════ */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-5 h-[52px] flex items-center justify-between">
        <div className="flex items-center gap-3">

          {/* Tabs de temporalidad */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 border border-gray-200">
            <button
              onClick={() => {
                const ws = new Date(period.weekStart)
                router.push(`/planning/month/${ws.getFullYear()}/${ws.getMonth() + 1}`)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              <span className="text-[12px]">📅</span> Mes
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-white text-indigo-600 shadow-sm">
              <span className="text-[12px]">📆</span> Semana
            </button>
            <button
              onClick={() => router.push(`/planning/annual/${new Date(period.weekStart).getFullYear()}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              <span className="text-[12px]">📊</span> Anual
            </button>
          </div>

          {/* Navegador de semanas */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
            <button
              className="p-0.5 rounded hover:bg-gray-200 transition-colors text-gray-500"
              onClick={() => {
                const prev = allPeriods.find((p: any) =>
                  new Date(p.weekStart) < new Date(period.weekStart)
                )
                if (prev) router.push(`/planning/week/${prev.id}`)
                else toast.info('No hay semanas anteriores')
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="text-[13px] font-semibold text-gray-800 px-2 hover:text-indigo-600 transition-colors min-w-[180px] text-center"
              onClick={() => setShowWeekPicker(true)}
            >
              {format(weekStart, "d 'de' MMM", { locale: es })} — {format(weekEnd, "d 'de' MMM yyyy", { locale: es })}
            </button>
            <button
              className="p-0.5 rounded hover:bg-gray-200 transition-colors text-gray-500"
              onClick={() => {
                const next = [...allPeriods].reverse().find((p: any) =>
                  new Date(p.weekStart) > new Date(period.weekStart)
                )
                if (next) router.push(`/planning/week/${next.id}`)
                else toast.info('No hay semanas posteriores')
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Status pill */}
          <span className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-full', status.cls)}>
            {status.label}
          </span>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2">
          {criticalIssues > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-medium">
              <AlertCircle size={13} />
              {criticalIssues} alerta{criticalIssues > 1 ? 's' : ''}
            </div>
          )}
          <button
            onClick={() => setShowSummary(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-[12px] font-medium hover:bg-gray-50 transition-colors"
          >
            <BarChart2 size={13} /> Resumen
          </button>
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 text-[12px] font-medium hover:bg-gray-50 transition-colors"
          >
            <Sparkles size={13} /> Generar IA
          </button>
          {/* Exportar Excel */}
          <button
            onClick={() => {
              const url = `/api/export/week?periodId=${period.id}`
              const a = document.createElement('a')
              a.href = url
              a.download = `cuadrante-${period.weekStart?.slice(0, 10) ?? 'semana'}.xlsx`
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              toast.success('Descargando Excel...')
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 text-[12px] font-semibold hover:bg-emerald-100 transition-colors"
          >
            <FileSpreadsheet size={14} />
            Excel
          </button>

          <button
            onClick={handlePublish}
            disabled={publishing || period.status === 'PUBLISHED'}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {publishing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {period.status === 'PUBLISHED' ? 'Publicado' : 'Publicar'}
          </button>
        </div>
      </header>

      {/* ══════════ MÉTRICAS RÁPIDAS ══════════ */}
      <div className="flex-shrink-0 flex gap-2 px-5 py-2.5 bg-white border-b border-gray-100">
        {weekDays.map((dayIso, i) => {
          const cov = dayCoverage(i)
          const day = parseISO(dayIso)
          const today = isToday(day)
          const totalH = employees.reduce((acc, e) =>
            acc + (assignmentsByEmpDay[e.id]?.[i] || []).reduce((s: number, a: any) =>
              s + durationH(a.startTime, a.endTime, a.breakMinutes), 0), 0)
          return (
            <div key={i} className={cn(
              'flex-1 rounded-xl px-3 py-2 border text-center transition-all',
              today ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'
            )}>
              <div className={cn('text-[11px] font-semibold', today ? 'text-indigo-600' : 'text-gray-500')}>
                {DAYS_SHORT[i]}
                <span className={cn('ml-1 text-[10px] font-normal', today ? 'text-indigo-400' : 'text-gray-400')}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                <div className={cn(
                  'text-[11px] font-bold',
                  cov.ok ? 'text-emerald-600' : 'text-red-500'
                )}>
                  {cov.working}/{cov.required}
                </div>
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">{fmtH(totalH)}</div>
            </div>
          )
        })}
        {/* Total semana */}
        <div className="w-[90px] rounded-xl px-3 py-2 border border-indigo-200 bg-indigo-50 text-center">
          <div className="text-[11px] font-semibold text-indigo-600">Total</div>
          <div className="text-[15px] font-bold text-indigo-700">
            {fmtH(employees.reduce((acc, e) => acc + empWeekHours(e.id), 0))}
          </div>
          <div className="text-[10px] text-indigo-400">{employees.length} empleados</div>
        </div>
      </div>

      {/* ══════════ GRID ══════════ */}
      <div className="flex-1 overflow-auto px-5 py-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-w-[900px]">

          {/* Cabecera días */}
          <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: '200px repeat(7, 1fr) 88px' }}>
            <div className="px-4 py-3 bg-gray-50 border-r border-gray-200">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Empleado</span>
            </div>
            {weekDays.map((dayIso, i) => {
              const day = parseISO(dayIso)
              const today = isToday(day)
              const cov = dayCoverage(i)
              return (
                <div key={i} className={cn(
                  'px-2 py-3 border-r border-gray-200 text-center',
                  today ? 'bg-indigo-50' : 'bg-gray-50'
                )}>
                  <div className={cn('text-[12px] font-semibold', today ? 'text-indigo-600' : 'text-gray-700')}>
                    {DAYS_SHORT[i]}
                  </div>
                  <div className={cn(
                    'text-[13px] font-bold mx-auto w-7 h-7 flex items-center justify-center rounded-full',
                    today ? 'bg-indigo-600 text-white' : 'text-gray-500'
                  )}>
                    {format(day, 'd')}
                  </div>
                  {!cov.ok && (
                    <div className="text-[10px] text-red-500 font-medium mt-0.5 flex items-center justify-center gap-0.5">
                      <AlertTriangle size={9} /> {cov.working}/{cov.required}
                    </div>
                  )}
                  {cov.ok && cov.required > 0 && (
                    <div className="text-[10px] text-emerald-500 font-medium mt-0.5">
                      ✓ {cov.working}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="px-2 py-3 bg-gray-50 text-center">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Horas</span>
              <div className="text-[9px] text-gray-300 mt-0.5">brutas / netas</div>
            </div>
          </div>

          {/* Filas empleados */}
          {sortedEmployees.map((emp: any) => {
            const col = empColorMap[emp.id]
            const contract = emp.contracts?.[0]
            const weekH = empWeekHours(emp.id)
            const maxH = contract?.maxWeeklyHours || contract?.weeklyHours + 4 || 44
            const contractH = contract?.weeklyHours || 40
            const isOver = weekH > maxH
            const isUnder = weekH < (contract?.minWeeklyHours || contractH - 4)
            const initials = `${emp.firstName?.[0] || ''}${emp.lastName?.[0] || ''}`.toUpperCase()

            return (
              <div
                key={emp.id}
                className={cn(
                  "grid border-b border-gray-100 hover:bg-gray-50/50 transition-colors group",
                  draggedEmpId === emp.id && "opacity-40"
                )}
                style={{ gridTemplateColumns: '200px repeat(7, 1fr) 88px' }}
              >
                {/* Nombre empleado — draggable para reordenar */}
                <div
                  className={cn(
                    "px-3 py-2 border-r border-gray-200 flex items-center gap-2 cursor-grab active:cursor-grabbing transition-colors select-none",
                    dragOverEmpId === emp.id && draggedEmpId !== emp.id && "bg-indigo-50 border-l-2 border-l-indigo-400"
                  )}
                  draggable
                  onDragStart={e => { e.stopPropagation(); setDraggedEmpId(emp.id) }}
                  onDragEnd={() => { setDraggedEmpId(null); setDragOverEmpId(null) }}
                  onDragOver={e => { e.preventDefault(); if (draggedEmpId && draggedEmpId !== emp.id) setDragOverEmpId(emp.id) }}
                  onDragLeave={() => setDragOverEmpId(null)}
                  onDrop={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!draggedEmpId || draggedEmpId === emp.id) return
                    const from = draggedEmpId
                    setDragOverEmpId(null)
                    setDraggedEmpId(null)
                    setEmployeeOrder(prev => {
                      const arr = [...prev]
                      const fromIdx = arr.indexOf(from)
                      const toIdx = arr.indexOf(emp.id)
                      arr.splice(fromIdx, 1)
                      arr.splice(toIdx, 0, from)
                      updateEmployeeOrder(arr).catch(() => {})
                      return arr
                    })
                  }}
                >
                  {/* Handle de arrastre */}
                  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                    <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
                    <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
                    <circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
                  </svg>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 text-white shadow-sm"
                    style={{ backgroundColor: col.dot }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-gray-800 truncate">
                      {emp.firstName} {emp.lastName}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">
                      {contractH}h/sem
                    </div>
                  </div>
                </div>

                {/* Celdas de días */}
                {weekDays.map((dayIso, dayIdx) => {
                  const dayAssignments = assignmentsByEmpDay[emp.id]?.[dayIdx] || []
                  const today = isToday(parseISO(dayIso))

                  return (
                    <div
                      key={dayIdx}
                      className={cn(
                        'border-r border-gray-200 p-1.5 min-h-[72px] relative transition-colors',
                        today && 'bg-indigo-50/30',
                        dragOverCell?.empId === emp.id && dragOverCell?.dayIdx === dayIdx && draggedAssignment && 'bg-indigo-100/60 ring-2 ring-inset ring-indigo-400'
                      )}
                      onDragOver={e => { e.preventDefault(); setDragOverCell({ empId: emp.id, dayIdx }) }}
                      onDragLeave={() => setDragOverCell(null)}
                      onDrop={e => {
                        e.preventDefault()
                        setDragOverCell(null)
                        if (!draggedAssignment) return
                        const { id: assignmentId, empId: fromEmpId, dayIdx: fromDayIdx } = draggedAssignment
                        if (fromEmpId === emp.id && fromDayIdx === dayIdx) return
                        setDraggedAssignment(null)
                        // parseISO evita el timezone shift que ocurre con new Date("2026-05-15")
                        const targetDate = parseISO(weekDays[dayIdx])
                        startTransition(async () => {
                          try {
                            await moveAssignment(assignmentId, emp.id, targetDate)
                            router.refresh()
                          } catch (e: any) {
                            toast.error(e.message)
                            router.refresh()
                          }
                        })
                      }}
                    >
                      {(() => {
                        const absence = getAbsenceForDay(emp.id, dayIdx)
                        const ABSENCE_TYPE_LABELS: Record<string, { label: string; bg: string; text: string; icon: string }> = {
                          VACACIONES:    { label: 'Vacaciones', bg: '#dbeafe', text: '#1e40af', icon: '🏖️' },
                          BAJA:          { label: 'Baja médica', bg: '#fee2e2', text: '#991b1b', icon: '🤒' },
                          PERMISO:       { label: 'Permiso', bg: '#fef9c3', text: '#854d0e', icon: '📋' },
                          AUSENCIA:      { label: 'Ausencia', bg: '#f3e8ff', text: '#6b21a8', icon: '❌' },
                          ASUNTO_PROPIO: { label: 'Asunto propio', bg: '#dcfce7', text: '#166534', icon: '🏠' },
                        }
                        return null
                      })()}
                    {dayAssignments.length === 0 ? (
                        <div className="relative w-full h-full min-h-[56px]">
                          {(() => {
                            const absence = getAbsenceForDay(emp.id, dayIdx)
                            if (absence) {
                              const cfg = {
                                VACACIONES:    { label: 'Vacaciones', bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', icon: '🏖️' },
                                BAJA:          { label: 'Baja',       bg: '#fef2f2', text: '#dc2626', border: '#fecaca', icon: '🤒' },
                                PERMISO:       { label: 'Permiso',    bg: '#fefce8', text: '#ca8a04', border: '#fef08a', icon: '📋' },
                                AUSENCIA:      { label: 'Ausencia',   bg: '#fdf4ff', text: '#9333ea', border: '#e9d5ff', icon: '❌' },
                                ASUNTO_PROPIO: { label: 'Asunto',     bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', icon: '🏠' },
                              }[absence.type] || { label: absence.type, bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb', icon: '📅' }
                              return (
                                <div className="absolute inset-0 rounded-lg flex flex-col items-center justify-center gap-0.5 border-2 border-dashed"
                                  style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}>
                                  <span className="text-[14px]">{cfg.icon}</span>
                                  <span className="text-[9px] font-bold" style={{ color: cfg.text }}>{cfg.label}</span>
                                </div>
                              )
                            }
                            return (
                              <button
                                onClick={() => openCreate(emp.id, dayIdx)}
                                className="w-full h-full min-h-[56px] rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                              >
                                <Plus size={16} className="text-gray-300 hover:text-indigo-400" />
                              </button>
                            )
                          })()}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {/* Badge de ausencia sobre turno existente */}
                          {(() => {
                            const absence = getAbsenceForDay(emp.id, dayIdx)
                            if (!absence) return null
                            const cfg = {
                              VACACIONES:    { label: 'Vacaciones', bg: '#dbeafe', text: '#1d4ed8', icon: '🏖️' },
                              BAJA:          { label: 'Baja médica', bg: '#fee2e2', text: '#dc2626', icon: '🤒' },
                              PERMISO:       { label: 'Permiso', bg: '#fef9c3', text: '#ca8a04', icon: '📋' },
                              AUSENCIA:      { label: 'Ausencia', bg: '#f3e8ff', text: '#9333ea', icon: '❌' },
                              ASUNTO_PROPIO: { label: 'Asunto propio', bg: '#dcfce7', text: '#16a34a', icon: '🏠' },
                            }[absence.type] || { label: absence.type, bg: '#f3f4f6', text: '#6b7280', icon: '📅' }
                            return (
                              <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg mb-0.5 border"
                                style={{ backgroundColor: cfg.bg, borderColor: cfg.text + '40' }}>
                                <span className="text-[10px]">{cfg.icon}</span>
                                <span className="text-[9px] font-bold" style={{ color: cfg.text }}>{cfg.label} — ⚠️ tiene turno</span>
                              </div>
                            )
                          })()}
                          {dayAssignments.map((a: any) => (
                            <ShiftPill
                              key={a.id}
                              assignment={a}
                              color={col}
                              draggable={period.status !== 'PUBLISHED'}
                              onDragStart={() => setDraggedAssignment({ id: a.id, empId: emp.id, dayIdx })}
                              onDragEnd={() => { setDraggedAssignment(null); setDragOverCell(null) }}
                              onEdit={() => openEdit(a)}
                              onDelete={() => {
                                startTransition(async () => {
                                  try {
                                    await deleteAssignment(a.id)
                                    toast.success('Turno eliminado')
                                    router.refresh()
                                  } catch (e: any) { toast.error(e.message) }
                                })
                              }}
                              onToggleLock={() => {
                                startTransition(async () => {
                                  try {
                                    await toggleAssignmentLock(a.id)
                                    router.refresh()
                                  } catch (e: any) { toast.error(e.message) }
                                })
                              }}
                            />
                          ))}
                          {/* Botón añadir turno extra */}
                          <button
                            onClick={() => openCreate(emp.id, dayIdx)}
                            className="w-full rounded border border-dashed border-gray-200 py-0.5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                          >
                            <Plus size={11} className="text-gray-300" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Resumen horas */}
                {(() => {
                  const brutoH = empWeekHoursBruto(emp.id)
                  const breakMin = empWeekBreakMin(emp.id)
                  const breakH = breakMin / 60
                  return (
                    <div className="px-2 py-2 flex flex-col items-center justify-center gap-0.5">
                      {/* Horas brutas — lo que paga el empresario */}
                      <div className={cn(
                        'text-[15px] font-bold leading-tight',
                        isOver ? 'text-red-600' : isUnder ? 'text-amber-500' : 'text-gray-800'
                      )}>
                        {fmtH(brutoH)}
                      </div>
                      {breakMin > 0 && (
                        <div className="text-[9px] text-gray-400 leading-tight text-center">
                          {fmtH(weekH)} netas
                          <br />
                          <span className="text-indigo-400">{breakMin}m descanso</span>
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400">de {contractH}h</div>
                      {/* Barra de progreso sobre horas brutas */}
                      <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden mt-0.5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (brutoH / contractH) * 100)}%`,
                            backgroundColor: isOver ? '#dc2626' : isUnder ? '#f59e0b' : '#10b981'
                          }}
                        />
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })}

          {/* Fila totales — sticky bottom, alineada con las columnas */}
          <div className="flex border-t border-gray-300 bg-white sticky bottom-0 z-20" style={{ minWidth: 'max-content' }}>
            <div className="w-[180px] min-w-[180px] px-4 py-3 font-bold text-[12px] text-gray-500 uppercase tracking-wider border-r border-gray-200 sticky left-0 bg-gray-50 z-10">
              TOTALES
            </div>
            {weekDays.map((dayIso, i) => {
              const dayAssignments = employees.flatMap((e: any) =>
                assignmentsByEmpDay[e.id]?.[i] || [])
              const totalBruto = dayAssignments.reduce((s: number, a: any) =>
                s + durationBruto(a.startTime, a.endTime), 0)
              const totalBreak = dayAssignments.reduce((s: number, a: any) =>
                s + (a.breakMinutes || 0), 0)
              const working = employees.filter((e: any) =>
                (assignmentsByEmpDay[e.id]?.[i] || []).length > 0
              ).length
              return (
                <div key={i} className="flex-1 min-w-[120px] px-2 py-3 border-r border-gray-200 text-center">
                  <div className="text-[12px] font-bold text-gray-700">{working} 👤</div>
                  <div className="text-[11px] font-semibold text-gray-700">{fmtH(totalBruto)}</div>
                  {totalBreak > 0 && (
                    <div className="text-[9px] text-indigo-400">{totalBreak}m desc.</div>
                  )}
                </div>
              )
            })}
            {/* Total semana global */}
            {(() => {
              const totalBruto = employees.reduce((acc: number, e: any) => acc + empWeekHoursBruto(e.id), 0)
              const totalNeto  = employees.reduce((acc: number, e: any) => acc + empWeekHours(e.id), 0)
              const totalBreak = employees.reduce((acc: number, e: any) => acc + empWeekBreakMin(e.id), 0)
              return (
                <div className="w-[88px] min-w-[88px] px-2 py-3 text-center bg-indigo-50">
                  <div className="text-[13px] font-bold text-indigo-600">{fmtH(totalBruto)}</div>
                  {totalBreak > 0 && (
                    <>
                      <div className="text-[9px] text-gray-500">{fmtH(totalNeto)} netas</div>
                      <div className="text-[9px] text-indigo-400">{Math.round(totalBreak / 60 * 10) / 10}h desc.</div>
                    </>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Leyenda */}
        <div className="flex items-center gap-4 mt-3 px-1 flex-wrap">
          {employees.map((e: any) => (
            <div key={e.id} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: empColorMap[e.id].dot }} />
              <span className="text-[11px] text-gray-500">{e.firstName}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════ MODALES ══════════ */}

      {/* Editor de turno */}
      {editor.open && (
        <ShiftEditorModal
          mode={editor.mode}
          employeeId={editor.employeeId}
          dayIndex={editor.dayIndex}
          assignment={editor.assignment}
          employees={employees}
          weekDays={weekDays}
          planningPeriodId={period.id}
          locationId={period.locationId}
          onClose={() => setEditor({ open: false, mode: 'create' })}
          onSaved={() => {
            setEditor({ open: false, mode: 'create' })
            router.refresh()
          }}
        />
      )}

      {/* Modal generación IA */}
      {showGenerate && (
        <GenerateModal
          planningPeriodId={period.id}
          weekLabel={`${format(weekStart, "d 'de' MMM", { locale: es })} – ${format(weekEnd, "d 'de' MMM yyyy", { locale: es })}`}
          hasExistingAssignments={period.assignments?.length > 0}
          onClose={() => setShowGenerate(false)}
        />
      )}

      {/* Resumen semanal */}
      {showSummary && (
        <SummaryModal
          employees={employees}
          weekDays={weekDays}
          assignmentsByEmpDay={assignmentsByEmpDay}
          empColorMap={empColorMap}
          issues={period.validationIssues || []}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SHIFT PILL — tarjeta visual del turno en el grid
// ═════════════════════════════════════════════════════════════════════════════
function ShiftPill({ assignment: a, color, onEdit, onDelete, onToggleLock, draggable = false, onDragStart, onDragEnd }: any) {
  const [hover, setHover] = useState(false)
  const h = durationH(a.startTime, a.endTime, a.breakMinutes)
  const isNight = timeToMin(a.endTime) <= timeToMin(a.startTime) || timeToMin(a.endTime) >= 22*60

  return (
    <div
      draggable={draggable && !a.isLocked}
      onDragStart={(e) => {
        e.stopPropagation()
        if (onDragStart) onDragStart()
      }}
      onDragEnd={(e) => {
        e.stopPropagation()
        if (onDragEnd) onDragEnd()
      }}
      className={cn(
        'relative rounded-lg px-2 py-1.5 select-none transition-all hover:shadow-md',
        draggable && !a.isLocked ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      )}
      style={{
        backgroundColor: color.bg,
        borderLeft: `3px solid ${color.dot}`,
        border: `1px solid ${color.border}`,
        borderLeftWidth: '3px',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => { if (!e.defaultPrevented) onEdit() }}
    >
      {/* Indicadores */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-bold" style={{ color: color.text }}>
          {a.startTime} – {a.endTime}
        </span>
        <div className="flex items-center gap-1">
          {isNight && <span className="text-[9px]">🌙</span>}
          {a.isLocked && <Lock size={8} style={{ color: color.text }} />}
          {a.origin === 'AUTOMATIC' && <Sparkles size={8} style={{ color: color.dot }} />}
        </div>
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: color.dot }}>
        {fmtH(durationBruto(a.startTime, a.endTime))}
        {a.breakMinutes > 0 && (
          <span className="opacity-60"> ({fmtH(h)} netas)</span>
        )}
        {a.isSplit && ' · Partido'}
        {a.laborRole && ` · ${a.laborRole.name}`}
      </div>

      {/* Hover actions */}
      {hover && (
        <div
          className="absolute -top-7 right-0 flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1.5 py-1 shadow-lg z-20"
          onClick={e => e.stopPropagation()}
        >
          <button
            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-indigo-600"
            onClick={onEdit}
            title="Editar"
          >
            <Clock size={11} />
          </button>
          <button
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            onClick={onToggleLock}
            title={a.isLocked ? 'Desbloquear' : 'Bloquear'}
          >
            {a.isLocked ? <Unlock size={11} /> : <Lock size={11} />}
          </button>
          <button
            className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
            onClick={onDelete}
            title="Eliminar"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SHIFT EDITOR MODAL — popup central para crear/editar turnos
// ═════════════════════════════════════════════════════════════════════════════
function ShiftEditorModal({ mode, employeeId, dayIndex, assignment, employees, weekDays, planningPeriodId, locationId, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()

  const initialEmp = assignment?.employeeId || employeeId || employees[0]?.id
  const initialDay = assignment
    ? weekDays.findIndex((d: string) => format(parseISO(d), 'yyyy-MM-dd') === format(new Date(assignment.date), 'yyyy-MM-dd'))
    : dayIndex ?? 0

  const [form, setForm] = useState({
    employeeId: initialEmp,
    dayIndex: initialDay,
    startTime: assignment?.startTime || '08:00',
    endTime: assignment?.endTime || '16:00',
    breakMinutes: assignment?.breakMinutes ?? 20,
    isSplit: assignment?.isSplit || false,
    notes: assignment?.notes || '',
    isLocked: assignment?.isLocked || false,
  })

  const hours = durationH(form.startTime, form.endTime, form.breakMinutes)
  const isValid = hours > 0 && hours <= 9
  const warning = hours > 5 && form.breakMinutes < 20 ? 'Jornada >5h requiere 20 min de descanso' : null
  const error = hours > 9 ? 'Máximo 9h por jornada (convenio)' : hours <= 0 ? 'Hora fin debe ser posterior al inicio' : null

  const emp = employees.find((e: any) => e.id === form.employeeId)
  const dayDate = weekDays[form.dayIndex] ? parseISO(weekDays[form.dayIndex]) : new Date()

  function handleSave() {
    if (error) return
    startTransition(async () => {
      try {
        const date = parseISO(weekDays[form.dayIndex])
        if (mode === 'create') {
          await createAssignment(planningPeriodId, {
            employeeId: form.employeeId,
            date,
            startTime: form.startTime,
            endTime: form.endTime,
            breakMinutes: form.breakMinutes,
            isSplit: form.isSplit,
            isLocked: form.isLocked,
            notes: form.notes,
          } as any)
          toast.success('Turno creado ✓')
        } else {
          await updateAssignment(assignment.id, {
            startTime: form.startTime,
            endTime: form.endTime,
            breakMinutes: form.breakMinutes,
            notes: form.notes,
            isLocked: form.isLocked,
          } as any)
          toast.success('Turno actualizado ✓')
        }
        onSaved()
      } catch (e: any) {
        toast.error(e.message)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[440px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)' }}
        >
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">
              {mode === 'create' ? '+ Añadir turno' : '✏️ Editar turno'}
            </h2>
            <p className="text-[12px] text-gray-500 mt-0.5 capitalize">
              {emp ? `${emp.firstName} ${emp.lastName}` : '—'} · {format(dayDate, "EEEE d 'de' MMMM", { locale: es })}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Empleado (solo en create) */}
          {mode === 'create' && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Empleado
              </label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
                value={form.employeeId}
                onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
              >
                {employees.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Día (solo en create) */}
          {mode === 'create' && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Día
              </label>
              <div className="grid grid-cols-7 gap-1">
                {weekDays.map((dayIso: string, i: number) => {
                  const d = parseISO(dayIso)
                  return (
                    <button
                      key={i}
                      onClick={() => setForm(f => ({ ...f, dayIndex: i }))}
                      className={cn(
                        'rounded-lg py-2 text-[11px] font-semibold transition-all',
                        form.dayIndex === i
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      <div>{DAYS_SHORT[i]}</div>
                      <div className="text-[10px] font-normal opacity-80">{format(d, 'd')}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Horas */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Horario
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-gray-400 mb-1">Entrada</div>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] font-semibold bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent text-gray-800"
                />
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-1">Salida</div>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] font-semibold bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent text-gray-800"
                />
              </div>
            </div>

            {/* Duración calculada en tiempo real */}
            {hours > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (hours / 9) * 100)}%`,
                      backgroundColor: hours > 9 ? '#dc2626' : hours > 7 ? '#f59e0b' : '#10b981'
                    }}
                  />
                </div>
                <span className={cn(
                  'text-[12px] font-bold',
                  hours > 9 ? 'text-red-600' : hours > 7 ? 'text-amber-600' : 'text-emerald-600'
                )}>
                  {fmtH(hours)}
                </span>
              </div>
            )}
          </div>

          {/* Descanso */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Descanso
            </label>
            <div className="flex gap-2">
              {[0, 20, 30, 45, 60].map(m => (
                <button
                  key={m}
                  onClick={() => setForm(f => ({ ...f, breakMinutes: m }))}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-[12px] font-semibold transition-all border',
                    form.breakMinutes === m
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                  )}
                >
                  {m === 0 ? 'Sin' : `${m}'`}
                </button>
              ))}
            </div>
          </div>

          {/* Opciones */}
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, isSplit: !f.isSplit }))}
                className={cn(
                  'w-10 h-5 rounded-full transition-all relative',
                  form.isSplit ? 'bg-indigo-600' : 'bg-gray-200'
                )}
              >
                <div className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                  form.isSplit ? 'left-5' : 'left-0.5'
                )} />
              </div>
              <span className="text-[12px] text-gray-600">Jornada partida</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, isLocked: !f.isLocked }))}
                className={cn(
                  'w-10 h-5 rounded-full transition-all relative',
                  form.isLocked ? 'bg-amber-500' : 'bg-gray-200'
                )}
              >
                <div className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                  form.isLocked ? 'left-5' : 'left-0.5'
                )} />
              </div>
              <span className="text-[12px] text-gray-600">🔒 Bloquear</span>
            </label>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Notas (opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Apertura, necesita barista..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent placeholder-gray-300"
            />
          </div>

          {/* Feedback validación */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
              <span className="text-[12px] text-red-700 font-medium">{error}</span>
            </div>
          )}
          {!error && warning && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
              <span className="text-[12px] text-amber-700 font-medium">{warning}</span>
            </div>
          )}
          {!error && !warning && hours > 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
              <span className="text-[12px] text-emerald-700 font-medium">Turno válido · {fmtH(hours)} · Descanso 12h OK</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[13px] font-medium text-gray-500 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!!error || isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            {mode === 'create' ? 'Crear turno' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY MODAL — resumen visual de la semana
// ═════════════════════════════════════════════════════════════════════════════
function SummaryModal({ employees, weekDays, assignmentsByEmpDay, empColorMap, issues, onClose }: any) {
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const blocking = issues.filter((i: any) => i.severity === 'BLOCKING')
  const errors = issues.filter((i: any) => i.severity === 'ERROR')
  const warnings = issues.filter((i: any) => i.severity === 'WARNING')
  const infos = issues.filter((i: any) => i.severity === 'INFO')
  const allSorted = [...blocking, ...errors, ...warnings, ...infos]
  const filteredIssues = severityFilter === 'all' ? allSorted : allSorted.filter((i: any) => i.severity === severityFilter)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[580px] max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)' }}
        >
          <h2 className="text-[15px] font-bold text-gray-900">📊 Resumen semanal</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Horas por empleado */}
          <div>
            <h3 className="text-[12px] font-bold text-gray-500 uppercase tracking-wider mb-3">Horas por empleado</h3>
            <div className="space-y-2.5">
              {employees.map((emp: any) => {
                const col = empColorMap[emp.id]
                const weekH: number = (Object.values(assignmentsByEmpDay[emp.id] || {}).flat() as any[])
                  .reduce((acc: number, a: any) => acc + durationH(a.startTime, a.endTime, a.breakMinutes), 0) as number
                const contract = emp.contracts?.[0]
                const contractH = contract?.weeklyHours || 40
                const brutoH = Object.values(assignmentsByEmpDay[emp.id] || {}).flat().reduce(
                  (acc: number, a: any) => acc + durationBruto(a.startTime, a.endTime), 0)
                const breakMin = Object.values(assignmentsByEmpDay[emp.id] || {}).flat().reduce(
                  (acc: number, a: any) => acc + (a.breakMinutes || 0), 0)
                const pct = Math.min(100, (weekH / contractH) * 100)
                const isOver = weekH > (contract?.maxWeeklyHours || contractH + 4)
                const days = Object.values(assignmentsByEmpDay[emp.id] || {}).filter((d: any) => d.length > 0).length

                return (
                  <div key={emp.id} className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: col.dot }}
                    >
                      {`${emp.firstName?.[0]}${emp.lastName?.[0]}`.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold text-gray-700">
                          {emp.firstName} {emp.lastName}
                        </span>
                        <span className={cn(
                          'text-[12px] font-bold',
                          isOver ? 'text-red-600' : 'text-gray-700'
                        )}>
                          {fmtH(weekH)} <span className="text-gray-400 font-normal">/ {contractH}h</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: isOver ? '#dc2626' : col.dot }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400">{days} días</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Alertas */}
          {issues.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[12px] font-bold text-gray-500 uppercase tracking-wider">
                  Alertas ({issues.length})
                </h3>
                {/* Filtros por severidad */}
                <div className="flex gap-1">
                  {[
                    { key: 'all', label: 'Todas', count: issues.length },
                    { key: 'BLOCKING', label: '🚫', count: blocking.length },
                    { key: 'ERROR', label: '❌', count: errors.length },
                    { key: 'WARNING', label: '⚠️', count: warnings.length },
                    { key: 'INFO', label: 'ℹ️', count: infos.length },
                  ].filter(f => f.count > 0 || f.key === 'all').map(f => (
                    <button
                      key={f.key}
                      onClick={() => setSeverityFilter(f.key)}
                      className={cn(
                        'text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all',
                        severityFilter === f.key
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      )}
                    >
                      {f.label} {f.count > 0 && <span className="ml-0.5">{f.count}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {filteredIssues.length === 0 && (
                  <div className="text-center py-4 text-[12px] text-gray-400">Sin alertas de este tipo</div>
                )}
                {filteredIssues.map((issue: any, idx: number) => {
                  const cfg = {
                    BLOCKING: { icon: <AlertCircle size={13} />, cls: 'bg-red-50 border-red-200 text-red-700', dot: 'bg-red-500' },
                    ERROR: { icon: <AlertCircle size={13} />, cls: 'bg-red-50 border-red-200 text-red-600', dot: 'bg-red-400' },
                    WARNING: { icon: <AlertTriangle size={13} />, cls: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-400' },
                    INFO: { icon: <Info size={13} />, cls: 'bg-blue-50 border-blue-200 text-blue-600', dot: 'bg-blue-400' },
                  }[issue.severity as string] || { icon: <Info size={13} />, cls: 'bg-gray-50 border-gray-200 text-gray-600', dot: 'bg-gray-300' }

                  return (
                    <div key={issue.id ?? idx} className={cn('flex items-start gap-2 px-3 py-2.5 rounded-xl border text-[12px]', cfg.cls)}>
                      <span className="flex-shrink-0 mt-0.5">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium leading-snug">{issue.message}</div>
                        {issue.suggestion && (
                          <div className="opacity-70 mt-0.5 text-[11px]">→ {issue.suggestion}</div>
                        )}
                        {issue.type && (
                          <div className="text-[10px] opacity-40 mt-0.5 font-mono">{issue.type}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {issues.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle size={32} className="text-emerald-400" />
              <p className="text-[13px] text-gray-500">Sin alertas — el cuadrante es válido</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
