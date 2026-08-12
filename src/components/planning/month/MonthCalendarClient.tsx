'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, isToday, isWeekend, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, Sparkles, Send,
  AlertCircle, AlertTriangle, CheckCircle,
  Users, BarChart2, Calendar, X, Loader2,
  Copy, Info, Sun, Moon, Coffee,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { employeeColor, primaryRoleOf, colorShades } from '@/lib/employee-color'
import { RoleExtraBadge } from '@/components/employees/RoleExtraBadge'

// ─── Tipos ────────────────────────────────────────────────────────────────
interface EmployeeShift {
  id: string
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  totalMinutes: number
}

interface Employee {
  id: string
  firstName: string
  lastName: string
  color: string
  weeklyHours: number
  skills: any[]
}

interface Absence {
  id: string
  employeeId: string
  type: string
  status: string
  startDate: string
  endDate: string
}

interface MonthData {
  employees: Employee[]
  employeeShifts: Record<string, EmployeeShift[]>
  employeeMonthHours: Record<string, number>
  absences: Absence[]
  periods: any[]
  metrics: {
    totalHours: number
    totalNightHours: number
    totalOvertimeHours: number
    weeksPublished: number
    weeksDraft: number
    weeksTotal: number
    weeksEmpty: number
    totalAlerts: number
    totalAbsences: number
    approvedAbsences: number
    pendingAbsences: number
  }
  monthStart: string
  monthEnd: string
}

const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const DOW_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// Etiqueta corta de ausencia
const ABSENCE_LABEL: Record<string, string> = {
  VACATION: 'Vacac.',
  SICK_LEAVE: 'Baja',
  PERSONAL_LEAVE: 'Perm.',
  MATERNITY: 'Matern.',
  PATERNITY: 'Patern.',
  UNPAID_LEAVE: 'Sin sueldo',
  OTHER: 'Ausen.',
}

function fmtH(h: number): string {
  const hours = Math.floor(h)
  const mins = Math.round((h - hours) * 60)
  if (mins === 0) return `${hours}h`
  return `${hours}h${String(mins).padStart(2, '0')}`
}

// ─── Componente principal ───────────────────────────────────────────────────
interface Props {
  year: number
  month: number
  data: MonthData
  organizationId: string
  locationId: string
}

export function MonthCalendarClient({ year, month, data, organizationId, locationId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showSidePanel, setShowSidePanel] = useState(true)
  const [selectedCell, setSelectedCell] = useState<{ empId: string; date: string } | null>(null)
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null)  // lunes ISO de la semana bajo hover

  const monthDate = useMemo(() => new Date(year, month - 1, 1), [year, month])

  // Días del mes (columnas de la cuadrícula)
  const days = useMemo(() => {
    return eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) })
  }, [monthDate])

  // Mapa día → lunes ISO de su semana (para agrupar por semana)
  const dayToWeekStart = useMemo(() => {
    const map: Record<string, string> = {}
    for (const d of days) {
      const iso = format(d, 'yyyy-MM-dd')
      const dow = (d.getDay() + 6) % 7 // 0=lunes, 6=domingo
      const monday = new Date(d)
      monday.setDate(monday.getDate() - dow)
      map[iso] = format(monday, 'yyyy-MM-dd')
    }
    return map
  }, [days])

  // Mapa lunes ISO → periodId (para poder navegar al semanal si existe)
  const weekStartToPeriodId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of data.periods) {
      map[p.weekStart] = p.id
    }
    return map
  }, [data.periods])

  function handleWeekClick(weekStart: string) {
    const periodId = weekStartToPeriodId[weekStart]
    if (periodId) {
      router.push(`/planning/week/${periodId}`)
    } else {
      toast.info('No hay semana creada para estas fechas todavía')
    }
  }

  // Mapa de ausencia por (empleado, día). Marca cada día del rango.
  const absenceMap = useMemo(() => {
    const map: Record<string, Absence> = {}
    for (const a of data.absences) {
      const start = parseISO(a.startDate)
      const end = parseISO(a.endDate)
      const days = eachDayOfInterval({ start, end })
      for (const d of days) {
        const key = `${a.employeeId}|${format(d, 'yyyy-MM-dd')}`
        // Ausencia aprobada tiene prioridad sobre pendiente
        if (!map[key] || a.status === 'APPROVED') map[key] = a
      }
    }
    return map
  }, [data.absences])

  // Navegación entre meses
  function goToMonth(delta: number) {
    const next = delta > 0 ? addMonths(monthDate, delta) : subMonths(monthDate, -delta)
    router.push(`/planning/month/${next.getFullYear()}/${next.getMonth() + 1}`)
  }
  function goToToday() {
    const now = new Date()
    router.push(`/planning/month/${now.getFullYear()}/${now.getMonth() + 1}`)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-52px)] overflow-hidden bg-[#F7F8FA]">
      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">Cuadrante mensual</h1>
          <p className="text-[12px] text-gray-400">Vista general por empleado</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button onClick={() => goToMonth(-1)}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
              <ChevronLeft size={14} />
            </button>
            <div className="min-w-[140px] text-center">
              <div className="text-[14px] font-bold text-gray-900">{MONTHS_ES[month - 1]} {year}</div>
            </div>
            <button onClick={() => goToMonth(1)}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
              <ChevronRight size={14} />
            </button>
          </div>
          <button onClick={goToToday}
            className="px-3 py-1.5 text-[12px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
            Hoy
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSidePanel(s => !s)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-semibold transition-colors',
              showSidePanel
                ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            )}>
            <BarChart2 size={13} /> Resumen
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Cuadrícula empleado × día ── */}
        <div className="flex-1 overflow-auto">
          <MonthGrid
            days={days}
            employees={data.employees}
            employeeShifts={data.employeeShifts}
            employeeMonthHours={data.employeeMonthHours}
            absenceMap={absenceMap}
            selectedCell={selectedCell}
            dayToWeekStart={dayToWeekStart}
            hoveredWeek={hoveredWeek}
            onHoverWeek={setHoveredWeek}
            onWeekClick={handleWeekClick}
            onCellClick={(empId, date) => {
              setSelectedCell({ empId, date })
            }}
            onDayHeaderClick={(date) => {
              router.push(`/planning/day/${date}`)
            }}
          />
        </div>

        {/* ── Panel lateral (resúmenes) ── */}
        {showSidePanel && (
          <SidePanel
            metrics={data.metrics}
            periods={data.periods}
            absences={data.absences}
            employees={data.employees}
            selectedCell={selectedCell}
            employeeShifts={data.employeeShifts}
            absenceMap={absenceMap}
          />
        )}
      </div>
    </div>
  )
}

// ─── Cuadrícula empleado × día ───────────────────────────────────────────
function MonthGrid({ days, employees, employeeShifts, employeeMonthHours, absenceMap, selectedCell, dayToWeekStart, hoveredWeek, onHoverWeek, onWeekClick, onCellClick, onDayHeaderClick }: {
  days: Date[]
  employees: Employee[]
  employeeShifts: Record<string, EmployeeShift[]>
  employeeMonthHours: Record<string, number>
  absenceMap: Record<string, Absence>
  selectedCell: { empId: string; date: string } | null
  dayToWeekStart: Record<string, string>
  hoveredWeek: string | null
  onHoverWeek: (weekStart: string | null) => void
  onWeekClick: (weekStart: string) => void
  onCellClick: (empId: string, date: string) => void
  onDayHeaderClick: (date: string) => void
}) {
  const COL_EMP = 200   // ancho columna empleado
  const COL_DAY = 64    // ancho por día — compacto tipo Skello
  const COL_TOTAL = 72  // ancho columna total del mes

  return (
    <div className="inline-block min-w-full">
      {/* Cabecera de días (sticky top) */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 flex">
        <div className="sticky left-0 z-30 bg-white border-r border-gray-200 flex items-center px-3"
          style={{ width: COL_EMP, minWidth: COL_EMP }}>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Empleado</span>
        </div>

        {days.map(d => {
          const iso = format(d, 'yyyy-MM-dd')
          const dow = d.getDay()
          const isW = isWeekend(d)
          const isTd = isToday(d)
          const weekStart = dayToWeekStart[iso]
          const isSunday = dow === 0
          const isInHoveredWeek = hoveredWeek === weekStart
          return (
            <div
              key={iso}
              onMouseEnter={() => onHoverWeek(weekStart)}
              onMouseLeave={() => onHoverWeek(null)}
              onClick={e => {
                // Click en el día → vista diaria. Con Shift o el chip de semana → semanal.
                if (e.shiftKey) onWeekClick(weekStart)
                else onDayHeaderClick(iso)
              }}
              className={cn(
                'flex flex-col items-center justify-center py-2 cursor-pointer transition-colors relative',
                isSunday ? 'border-r-2 border-r-gray-300' : 'border-r border-gray-100',
                isW && 'bg-gray-50',
                isTd && 'bg-indigo-50',
                isInHoveredWeek && 'bg-indigo-50/70'
              )}
              style={{ width: COL_DAY, minWidth: COL_DAY }}
              title={`${format(d, 'EEEE d MMMM', { locale: es })} — clic: día · shift+clic: semana`}>
              <span className={cn('text-[10px] font-semibold uppercase',
                isTd ? 'text-indigo-600' : isW ? 'text-gray-400' : 'text-gray-500')}>
                {DOW_ES[dow]}
              </span>
              <span className={cn('text-[13px] font-bold',
                isTd ? 'text-indigo-700' : isW ? 'text-gray-500' : 'text-gray-900')}>
                {d.getDate()}
              </span>
              {/* Botón "semana" que aparece al hover */}
              {isInHoveredWeek && dow === 4 && (
                <button
                  onClick={e => { e.stopPropagation(); onWeekClick(weekStart) }}
                  className="absolute -bottom-[1px] left-1/2 -translate-x-1/2 z-30 text-[9px] font-bold text-white bg-indigo-600 rounded-b px-1.5 py-0.5 shadow whitespace-nowrap hover:bg-indigo-700"
                >
                  Ver semana
                </button>
              )}
            </div>
          )
        })}

        <div className="sticky right-0 z-30 bg-white border-l border-gray-200 flex items-center justify-center"
          style={{ width: COL_TOTAL, minWidth: COL_TOTAL }}>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total</span>
        </div>
      </div>

      {/* Filas por empleado */}
      {employees.map(emp => {
        const role = primaryRoleOf(emp as any)
        const color = employeeColor(emp as any)
        const shades = colorShades(color)
        const monthH = employeeMonthHours[emp.id] ?? 0
        const initials = `${emp.firstName[0] ?? ''}${emp.lastName[0] ?? ''}`.toUpperCase()

        return (
          <div key={emp.id} className="flex border-b border-gray-100 hover:bg-gray-50/30 group">
            {/* Columna empleado (sticky left) */}
            <div
              className="sticky left-0 z-10 bg-white group-hover:bg-gray-50/30 border-r border-gray-200 flex items-center gap-2 px-3 py-1.5"
              style={{ width: COL_EMP, minWidth: COL_EMP }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                style={{ backgroundColor: color }}>
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-gray-800 truncate flex items-center gap-1">
                  <span className="truncate">{emp.firstName} {emp.lastName}</span>
                  <RoleExtraBadge employee={emp} size="sm" />
                </div>
                <div className="text-[10px] text-gray-400 truncate">
                  {role?.name ?? '—'} · {emp.weeklyHours}h/sem
                </div>
              </div>
            </div>

            {/* Celdas por día */}
            {days.map(d => {
              const iso = format(d, 'yyyy-MM-dd')
              const key = `${emp.id}|${iso}`
              const shifts = employeeShifts[key] ?? []
              const absence = absenceMap[key]
              const isTd = isToday(d)
              const isW = isWeekend(d)
              const dow = d.getDay()
              const isSunday = dow === 0
              const isSel = selectedCell?.empId === emp.id && selectedCell?.date === iso
              const weekStart = dayToWeekStart[iso]
              const isInHoveredWeek = hoveredWeek === weekStart

              return (
                <button
                  key={iso}
                  onClick={() => onCellClick(emp.id, iso)}
                  onMouseEnter={() => onHoverWeek(weekStart)}
                  onMouseLeave={() => onHoverWeek(null)}
                  className={cn(
                    'py-1 px-1 relative overflow-hidden transition-colors flex flex-col justify-center gap-0.5',
                    isSunday ? 'border-r-2 border-r-gray-300' : 'border-r border-gray-100',
                    isW && 'bg-gray-50/30',
                    isTd && 'bg-indigo-50/40',
                    isInHoveredWeek && !isSel && 'bg-indigo-50/40',
                    isSel && 'ring-2 ring-indigo-400 ring-inset z-10',
                    'hover:bg-indigo-50/60'
                  )}
                  style={{ width: COL_DAY, minWidth: COL_DAY, minHeight: 52 }}>
                  {absence ? (
                    <AbsenceChip absence={absence} />
                  ) : shifts.length > 0 ? (
                    shifts.map(s => (
                      <ShiftChip key={s.id} shift={s} shades={shades} color={color} />
                    ))
                  ) : (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                </button>
              )
            })}

            {/* Total mes (sticky right) */}
            <div
              className="sticky right-0 z-10 bg-white group-hover:bg-gray-50/30 border-l border-gray-200 flex items-center justify-center"
              style={{ width: COL_TOTAL, minWidth: COL_TOTAL }}>
              <span className="text-[12px] font-bold text-gray-700 tabular-nums">{fmtH(monthH)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Chip de turno dentro de una celda (estilo Skello: dos líneas verticales) ──
function ShiftChip({ shift, shades, color }: { shift: EmployeeShift; shades: any; color: string }) {
  const total = `${fmtH(shift.totalMinutes / 60)}`
  return (
    <div
      className="rounded text-white leading-none px-0.5 py-0.5 flex flex-col items-center justify-center gap-0"
      style={{ backgroundColor: color, minHeight: 30 }}
      title={`${shift.startTime} – ${shift.endTime} · ${total}`}>
      <span className="text-[10px] font-bold tabular-nums">{shift.startTime}</span>
      <span className="text-[10px] font-bold tabular-nums opacity-90">{shift.endTime}</span>
    </div>
  )
}

// ─── Chip de ausencia ──────────────────────────────────────────────────────
function AbsenceChip({ absence }: { absence: Absence }) {
  const isApproved = absence.status === 'APPROVED'
  return (
    <div
      className={cn(
        'text-[9px] font-semibold rounded px-1 py-0.5 leading-tight text-center truncate flex items-center justify-center gap-0.5',
        isApproved ? 'bg-gray-200 text-gray-600' : 'bg-amber-100 text-amber-700 border border-amber-200'
      )}
      title={`${ABSENCE_LABEL[absence.type] ?? absence.type} (${isApproved ? 'aprobada' : 'pendiente'})`}>
      {!isApproved && <AlertCircle size={7} />}
      {ABSENCE_LABEL[absence.type] ?? 'Ausen.'}
    </div>
  )
}

// ─── Panel lateral (resúmenes) ────────────────────────────────────────────
function SidePanel({ metrics, periods, absences, employees, selectedCell, employeeShifts, absenceMap }: any) {
  const [tab, setTab] = useState<'overview' | 'weeks' | 'absences' | 'detail'>('overview')

  // Si hay celda seleccionada, ir a detalle automáticamente
  useMemo(() => {
    if (selectedCell) setTab('detail')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCell])

  return (
    <div className="w-[320px] flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-gray-200">
        {[
          { key: 'overview', label: 'Resumen', icon: BarChart2 },
          { key: 'weeks',    label: 'Semanas', icon: Calendar },
          { key: 'absences', label: 'Ausencias', icon: Users },
          ...(selectedCell ? [{ key: 'detail' as const, label: 'Detalle', icon: Info }] : []),
        ].map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-semibold transition-colors border-b-2',
                active ? 'text-indigo-600 border-indigo-500 bg-indigo-50/40' : 'text-gray-500 border-transparent hover:text-gray-700'
              )}>
              <Icon size={12} /> {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'overview' && <OverviewPanel metrics={metrics} />}
        {tab === 'weeks' && <WeeksPanel periods={periods} />}
        {tab === 'absences' && <AbsencesPanel absences={absences} employees={employees} />}
        {tab === 'detail' && selectedCell && (
          <DetailPanel
            selectedCell={selectedCell}
            employee={employees.find((e: any) => e.id === selectedCell.empId)}
            shifts={employeeShifts[`${selectedCell.empId}|${selectedCell.date}`] ?? []}
            absence={absenceMap[`${selectedCell.empId}|${selectedCell.date}`]}
          />
        )}
      </div>
    </div>
  )
}

function OverviewPanel({ metrics }: any) {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100">
        <div className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider">Horas totales del mes</div>
        <div className="text-[28px] font-bold text-indigo-700 mt-1">{fmtH(metrics.totalHours)}</div>
        <div className="flex gap-3 mt-2 text-[10px] text-indigo-600/70">
          <span className="flex items-center gap-1"><Moon size={10} /> {fmtH(metrics.totalNightHours)} noct.</span>
          <span className="flex items-center gap-1"><Sun size={10} /> {fmtH(metrics.totalOvertimeHours)} extras</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Publicadas" value={metrics.weeksPublished} tone="green" />
        <StatBox label="Borrador" value={metrics.weeksDraft} tone="amber" />
        <StatBox label="Vacías" value={metrics.weeksEmpty} tone="gray" />
        <StatBox label="Alertas" value={metrics.totalAlerts} tone={metrics.totalAlerts > 0 ? 'red' : 'gray'} />
      </div>

      <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Ausencias del mes</div>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-gray-700">{metrics.totalAbsences} totales</span>
          <div className="flex gap-2 text-[10px]">
            {metrics.approvedAbsences > 0 && <span className="text-emerald-600">{metrics.approvedAbsences} aprob.</span>}
            {metrics.pendingAbsences > 0 && <span className="text-amber-600">{metrics.pendingAbsences} pend.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' | 'gray' }) {
  const cls = {
    green: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    red:   'bg-red-50 border-red-100 text-red-700',
    gray:  'bg-gray-50 border-gray-100 text-gray-600',
  }[tone]
  return (
    <div className={cn('p-2.5 rounded-xl border', cls)}>
      <div className="text-[9px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-[18px] font-bold">{value}</div>
    </div>
  )
}

function WeeksPanel({ periods }: any) {
  const router = useRouter()
  if (periods.length === 0) {
    return <p className="text-[12px] text-gray-400 italic text-center py-8">No hay semanas creadas este mes</p>
  }
  return (
    <div className="space-y-2">
      {periods.map((p: any) => (
        <button
          key={p.id}
          onClick={() => router.push(`/planning/week/${p.id}`)}
          className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-gray-800">
              Semana {format(parseISO(p.weekStart), 'd MMM', { locale: es })}
            </span>
            <StatusBadge status={p.status} />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span>{p.assignmentsCount} turnos</span>
            {p.blockingIssuesCount > 0 && (
              <span className="text-red-500 flex items-center gap-0.5">
                <AlertCircle size={9} /> {p.blockingIssuesCount} alertas
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    DRAFT:     { label: 'Borrador',   cls: 'bg-gray-100 text-gray-600' },
    GENERATED: { label: 'Generado',   cls: 'bg-blue-100 text-blue-600' },
    PUBLISHED: { label: 'Publicado',  cls: 'bg-emerald-100 text-emerald-600' },
    CLOSED:    { label: 'Cerrado',    cls: 'bg-gray-200 text-gray-500' },
  }
  const c = cfg[status] ?? cfg.DRAFT
  return <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', c.cls)}>{c.label}</span>
}

function AbsencesPanel({ absences, employees }: any) {
  if (absences.length === 0) {
    return <p className="text-[12px] text-gray-400 italic text-center py-8">Sin ausencias este mes</p>
  }
  return (
    <div className="space-y-2">
      {absences.map((a: any) => {
        const emp = employees.find((e: any) => e.id === a.employeeId)
        const color = emp ? employeeColor(emp) : '#9ca3af'
        return (
          <div key={a.id} className="p-3 rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: color }}>
                {a.employeeName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
              </div>
              <span className="text-[12px] font-semibold text-gray-800 flex-1 truncate">{a.employeeName}</span>
              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                a.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600')}>
                {a.status === 'APPROVED' ? 'Aprobada' : 'Pendiente'}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 flex items-center justify-between">
              <span>{ABSENCE_LABEL[a.type] ?? a.type}</span>
              <span>
                {format(parseISO(a.startDate), 'd MMM', { locale: es })}
                {a.startDate !== a.endDate && ` – ${format(parseISO(a.endDate), 'd MMM', { locale: es })}`}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DetailPanel({ selectedCell, employee, shifts, absence }: any) {
  const router = useRouter()
  if (!employee) return null

  const color = employeeColor(employee)
  const date = parseISO(selectedCell.date)
  const totalH = shifts.reduce((a: number, s: EmployeeShift) => a + s.totalMinutes / 60, 0)

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[13px] font-bold text-white"
            style={{ backgroundColor: color }}>
            {employee.firstName[0]}{employee.lastName[0]}
          </div>
          <div>
            <div className="text-[13px] font-bold text-gray-900">{employee.firstName} {employee.lastName}</div>
            <div className="text-[10px] text-gray-500">{format(date, 'EEEE d MMMM', { locale: es })}</div>
          </div>
        </div>

        {absence ? (
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-100">
            <div className="text-[11px] font-semibold text-amber-700 mb-0.5">{ABSENCE_LABEL[absence.type] ?? absence.type}</div>
            <div className="text-[10px] text-amber-600">
              {absence.status === 'APPROVED' ? '✓ Aprobada' : '⏳ Pendiente'}
            </div>
          </div>
        ) : shifts.length > 0 ? (
          <div className="space-y-1.5">
            {shifts.map((s: EmployeeShift) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <span className="text-[11px] font-mono font-semibold text-gray-700">{s.startTime} – {s.endTime}</span>
                <span className="text-[10px] text-gray-500">{fmtH(s.totalMinutes / 60)}</span>
              </div>
            ))}
            <div className="text-[10px] text-gray-500 text-right pt-1">Total: <strong>{fmtH(totalH)}</strong></div>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 italic">Día libre</p>
        )}
      </div>

      <button
        onClick={() => router.push(`/planning/day/${selectedCell.date}`)}
        className="w-full py-2 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors">
        Abrir vista diaria
      </button>
    </div>
  )
}
