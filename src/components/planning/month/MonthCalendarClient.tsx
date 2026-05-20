'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, isToday, isWeekend, isSameMonth, addMonths, subMonths, startOfWeek, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, Sparkles, Send,
  AlertCircle, AlertTriangle, CheckCircle, Clock,
  Users, BarChart2, Calendar, X, Loader2,
  Copy, Moon, TrendingUp, Eye, Pencil, Info,
  CalendarDays, ArrowRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createPlanningPeriodForWeek, duplicateWeekToDate } from '@/server/actions/planningMonth'

// ── Constantes ─────────────────────────────────────────────────────────────
const DAYS_HEADER = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]

const STATUS_CFG: Record<string, {
  label: string
  dot: string
  bg: string
  border: string
  text: string
  badge: string
}> = {
  DRAFT:     { label: 'Borrador',   dot: '#f59e0b', bg: '#fefce8', border: '#fde68a', text: '#92400e', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  GENERATED: { label: 'Generado',   dot: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  REVIEWED:  { label: 'Revisado',   dot: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6', badge: 'bg-violet-100 text-violet-700 border-violet-200' },
  PUBLISHED: { label: 'Publicado',  dot: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  EMPTY:     { label: 'Sin crear',  dot: '#d1d5db', bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280', badge: 'bg-gray-100 text-gray-500 border-gray-200' },
}

const ABSENCE_COLORS: Record<string, string> = {
  VACACIONES:     '#3b82f6',
  BAJA:           '#ef4444',
  PERMISO:        '#f59e0b',
  AUSENCIA:       '#8b5cf6',
  ASUNTO_PROPIO:  '#6b7280',
}

const ABSENCE_LABELS: Record<string, string> = {
  VACACIONES: '🏖️ Vacaciones',
  BAJA: '🤒 Baja',
  PERMISO: '📋 Permiso',
  AUSENCIA: '❌ Ausencia',
  ASUNTO_PROPIO: '🏠 Asunto propio',
}

function fmtH(h: number) {
  if (h === 0) return '0h'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

// ── Tipos ──────────────────────────────────────────────────────────────────
interface DayData {
  date: string
  workers: number
  totalHours: number
  nightHours: number
  overtimeHours: number
  planningPeriodId: string | null
  status: string | null
  issues: number
  blockingIssues: number
  absences: Array<{ employeeId: string; firstName: string; lastName: string; color: string; type: string }>
}

interface PeriodSummary {
  id: string
  weekStart: string
  weekEnd: string
  status: string
  origin: string
  assignmentsCount: number
  issuesCount: number
  blockingIssuesCount: number
}

interface MonthData {
  days: Record<string, DayData>
  periods: PeriodSummary[]
  absences: any[]
  employees: any[]
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
  calStart: string
  calEnd: string
  monthStart: string
  monthEnd: string
}

interface Props {
  year: number
  month: number
  data: MonthData
  organizationId: string
  locationId: string
}

// ── Modal de confirmación para crear semana ────────────────────────────────
interface CreateWeekModalState {
  open: boolean
  weekStart: string
  weekEnd: string
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function MonthCalendarClient({ year, month, data, organizationId, locationId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [createModal, setCreateModal] = useState<CreateWeekModalState>({ open: false, weekStart: '', weekEnd: '' })
  const [duplicateModal, setDuplicateModal] = useState<{ open: boolean; sourcePeriodId: string; sourceLabel: string } | null>(null)
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'overview' | 'absences' | 'weeks'>('overview')

  // Construir semanas del calendario
  const weeks = useMemo(() => {
    const calStart = parseISO(data.calStart)
    const result: Date[][] = []
    let cursor = new Date(calStart)
    while (cursor <= parseISO(data.calEnd)) {
      const week: Date[] = []
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cursor))
        cursor = addDays(cursor, 1)
      }
      result.push(week)
    }
    return result
  }, [data.calStart, data.calEnd])

  // Obtener el periodo de una semana
  function getWeekPeriod(weekStart: Date): PeriodSummary | null {
    const ws = format(weekStart, 'yyyy-MM-dd')
    return data.periods.find(p => p.weekStart === ws) || null
  }

  // Navegar al mes anterior/siguiente
  function navigateMonth(direction: 1 | -1) {
    const current = new Date(year, month - 1, 1)
    const target = direction === 1 ? addMonths(current, 1) : subMonths(current, 1)
    router.push(`/planning/month/${target.getFullYear()}/${target.getMonth() + 1}`)
  }

  // Ir al planificador semanal
  function goToWeek(periodId: string) {
    router.push(`/planning/week/${periodId}`)
  }

  // Abrir modal de creación
  function handleEmptyWeekClick(weekStart: Date) {
    const weekEnd = addDays(weekStart, 6)
    setCreateModal({
      open: true,
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      weekEnd: format(weekEnd, 'yyyy-MM-dd'),
    })
  }

  // Día seleccionado data
  const selectedDayData = selectedDay ? data.days[selectedDay] : null

  const currentMonthDate = new Date(year, month - 1, 1)
  const prevMonthDate = subMonths(currentMonthDate, 1)
  const nextMonthDate = addMonths(currentMonthDate, 1)

  return (
    <div className="flex flex-col h-full" style={{ background: '#f5f6fa' }}>

      {/* ══ TOPBAR ══════════════════════════════════════════════════════════ */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 h-[56px] flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <span className="font-semibold text-[15px] text-gray-900 tracking-tight">Shift Solver</span>
          </div>

          {/* Tabs de temporalidad */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 border border-gray-200">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-white text-indigo-600 shadow-sm"
            >
              <Calendar size={13} /> Mes
            </button>
            <button
              onClick={() => {
                // Ir a la semana actual del mes que estamos viendo
                const todayPeriod = data.periods.find(p => {
                  const ws = parseISO(p.weekStart)
                  const we = parseISO(p.weekEnd)
                  const today = new Date()
                  return today >= ws && today <= we
                })
                if (todayPeriod) {
                  router.push(`/planning/week/${todayPeriod.id}`)
                } else {
                  // Ir a la primera semana del mes
                  const first = data.periods[0]
                  if (first) router.push(`/planning/week/${first.id}`)
                  else toast.info('No hay semanas creadas este mes')
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              <CalendarDays size={13} /> Semana
            </button>
            <button
              onClick={() => router.push(`/planning/annual/${year}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              <BarChart2 size={13} /> Anual
            </button>
          </div>

          {/* Navegación mes */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
            <button onClick={() => navigateMonth(-1)} className="p-0.5 rounded hover:bg-gray-200 transition-colors text-gray-500">
              <ChevronLeft size={15} />
            </button>
            <span className="text-[14px] font-bold text-gray-800 px-2 min-w-[150px] text-center">
              {MONTHS_ES[month - 1]} {year}
            </span>
            <button onClick={() => navigateMonth(1)} className="p-0.5 rounded hover:bg-gray-200 transition-colors text-gray-500">
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Botón hoy */}
          <button
            onClick={() => {
              const now = new Date()
              if (now.getFullYear() !== year || now.getMonth() + 1 !== month) {
                router.push(`/planning/month/${now.getFullYear()}/${now.getMonth() + 1}`)
              }
            }}
            className="px-3 py-1.5 rounded-xl text-[12px] font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Hoy
          </button>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2">
          {data.metrics.totalAlerts > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-medium">
              <AlertCircle size={13} /> {data.metrics.totalAlerts} alerta{data.metrics.totalAlerts > 1 ? 's' : ''}
            </div>
          )}
          <button
            onClick={() => toast.info('Generación IA para todo el mes — próximamente')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-[12px] font-medium hover:bg-gray-50 transition-colors"
          >
            <Sparkles size={13} /> Generar mes con IA
          </button>
        </div>
      </header>

      {/* ══ CUERPO PRINCIPAL ═══════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── CALENDARIO ── */}
        <div className="flex-1 overflow-auto p-5">

          {/* Cabecera días de la semana */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_HEADER.map((d, i) => (
              <div key={d} className={cn(
                'text-center py-2 text-[11px] font-bold uppercase tracking-wider',
                i >= 5 ? 'text-indigo-400' : 'text-gray-400'
              )}>
                {d}
              </div>
            ))}
          </div>

          {/* Grid semanal */}
          <div className="space-y-1.5">
            {weeks.map((week, weekIdx) => {
              const weekStartDate = week[0]
              const weekEndDate = week[6]
              const weekStartStr = format(weekStartDate, 'yyyy-MM-dd')
              const period = getWeekPeriod(weekStartDate)
              const isHovered = hoveredWeek === weekStartStr
              const cfg = period ? STATUS_CFG[period.status] : STATUS_CFG.EMPTY

              return (
                <div
                  key={weekIdx}
                  className={cn(
                    'grid grid-cols-7 rounded-2xl overflow-hidden border transition-all duration-200',
                    period ? 'border-gray-200 bg-white shadow-sm' : 'border-dashed border-gray-200 bg-white/60',
                    isHovered && 'shadow-md border-indigo-200'
                  )}
                  onMouseEnter={() => setHoveredWeek(weekStartStr)}
                  onMouseLeave={() => setHoveredWeek(null)}
                >
                  {week.map((day, dayIdx) => {
                    const dayStr = format(day, 'yyyy-MM-dd')
                    const dayData = data.days[dayStr]
                    const isCurrentMonth = isSameMonth(day, currentMonthDate)
                    const todayFlag = isToday(day)
                    const isSelected = selectedDay === dayStr
                    const isWknd = dayIdx >= 5

                    return (
                      <DayCell
                        key={dayStr}
                        day={day}
                        dayData={dayData}
                        period={period}
                        isCurrentMonth={isCurrentMonth}
                        isToday={todayFlag}
                        isSelected={isSelected}
                        isWeekend={isWknd}
                        isLastInWeek={dayIdx === 6}
                        cfg={cfg}
                        onClick={() => {
                          if (!isCurrentMonth) return
                          setSelectedDay(isSelected ? null : dayStr)
                          // Si es el primer click en una semana sin periodo, no abrimos modal aquí
                          // El botón de semana completa lo maneja
                        }}
                      />
                    )
                  })}

                  {/* Franja inferior de la semana con acciones */}
                  <WeekStrip
                    period={period}
                    weekStart={weekStartDate}
                    weekEnd={weekEndDate}
                    cfg={cfg}
                    isHovered={isHovered}
                    onOpenWeek={() => period ? goToWeek(period.id) : handleEmptyWeekClick(weekStartDate)}
                    onDuplicate={() => period && setDuplicateModal({
                      open: true,
                      sourcePeriodId: period.id,
                      sourceLabel: `${format(weekStartDate, "d MMM", { locale: es })} – ${format(weekEndDate, "d MMM", { locale: es })}`,
                    })}
                  />
                </div>
              )
            })}
          </div>

          {/* Leyenda */}
          <div className="flex items-center gap-5 mt-4 px-1 flex-wrap">
            {Object.entries(STATUS_CFG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
                <span className="text-[11px] text-gray-500">{cfg.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 ml-4">
              <AlertCircle size={11} className="text-red-500" />
              <span className="text-[11px] text-gray-500">Alertas críticas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Moon size={11} className="text-indigo-400" />
              <span className="text-[11px] text-gray-500">Horas nocturnas</span>
            </div>
          </div>
        </div>

        {/* ── SIDEBAR DERECHO ── */}
        <aside className="w-[280px] min-w-[280px] border-l border-gray-200 bg-white flex flex-col overflow-hidden">

          {/* Tabs sidebar */}
          <div className="flex border-b border-gray-200">
            {([
              { id: 'overview', label: 'Resumen', icon: <BarChart2 size={12} /> },
              { id: 'weeks', label: 'Semanas', icon: <CalendarDays size={12} /> },
              { id: 'absences', label: 'Ausencias', icon: <Users size={12} /> },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => setSidebarTab(t.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-semibold border-b-2 transition-all',
                  sidebarTab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                )}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* TAB: Resumen */}
            {sidebarTab === 'overview' && (
              <OverviewTab
                metrics={data.metrics}
                year={year}
                month={month}
                selectedDay={selectedDay}
                selectedDayData={selectedDayData}
                periods={data.periods}
              />
            )}

            {/* TAB: Semanas */}
            {sidebarTab === 'weeks' && (
              <WeeksTab
                periods={data.periods}
                weeks={weeks}
                onGoToWeek={goToWeek}
                onCreateWeek={handleEmptyWeekClick}
                onDuplicate={(p) => setDuplicateModal({
                  open: true,
                  sourcePeriodId: p.id,
                  sourceLabel: `${format(parseISO(p.weekStart), "d MMM", { locale: es })} – ${format(parseISO(p.weekEnd), "d MMM", { locale: es })}`,
                })}
              />
            )}

            {/* TAB: Ausencias */}
            {sidebarTab === 'absences' && (
              <AbsencesTab absences={data.absences} employees={data.employees} />
            )}
          </div>
        </aside>
      </div>

      {/* ══ PANEL DÍA SELECCIONADO ══════════════════════════════════════════ */}
      {selectedDay && selectedDayData && (
        <DayDetailPanel
          dayStr={selectedDay}
          dayData={selectedDayData}
          employees={data.employees}
          period={data.periods.find(p => p.id === selectedDayData.planningPeriodId) || null}
          onClose={() => setSelectedDay(null)}
          onGoToWeek={(id) => router.push(`/planning/week/${id}`)}
        />
      )}

      {/* ══ MODAL: Crear semana ══════════════════════════════════════════════ */}
      {createModal.open && (
        <CreateWeekModal
          weekStart={createModal.weekStart}
          weekEnd={createModal.weekEnd}
          organizationId={organizationId}
          locationId={locationId}
          existingPeriods={data.periods}
          onClose={() => setCreateModal({ open: false, weekStart: '', weekEnd: '' })}
          onCreated={(periodId) => {
            setCreateModal({ open: false, weekStart: '', weekEnd: '' })
            router.push(`/planning/week/${periodId}`)
          }}
          onRefresh={() => {
            setCreateModal({ open: false, weekStart: '', weekEnd: '' })
            router.refresh()
          }}
        />
      )}

      {/* ══ MODAL: Duplicar semana ════════════════════════════════════════== */}
      {duplicateModal?.open && (
        <DuplicateWeekModal
          sourcePeriodId={duplicateModal.sourcePeriodId}
          sourceLabel={duplicateModal.sourceLabel}
          weeks={weeks}
          periods={data.periods}
          organizationId={organizationId}
          locationId={locationId}
          onClose={() => setDuplicateModal(null)}
          onDuplicated={(periodId) => {
            setDuplicateModal(null)
            router.push(`/planning/week/${periodId}`)
          }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DAY CELL
// ═══════════════════════════════════════════════════════════════════════════
function DayCell({ day, dayData, period, isCurrentMonth, isToday, isSelected, isWeekend, isLastInWeek, cfg, onClick }: any) {
  const hasWorkers = dayData?.workers > 0
  const hasAbsences = dayData?.absences?.length > 0
  const hasCriticalIssue = dayData?.blockingIssues > 0
  const hasNight = dayData?.nightHours > 0

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative p-2 min-h-[88px] cursor-pointer transition-all border-r border-b border-gray-100',
        isLastInWeek && 'border-r-0',
        isCurrentMonth ? 'hover:bg-indigo-50/50' : 'opacity-40',
        isSelected && 'bg-indigo-50 ring-2 ring-indigo-300 ring-inset z-10',
        isWeekend && isCurrentMonth && !isSelected && 'bg-gray-50/50',
        !isCurrentMonth && 'bg-gray-50/30 cursor-default',
      )}
    >
      {/* Número de día */}
      <div className="flex items-center justify-between mb-1.5">
        <div className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold transition-all',
          isToday ? 'bg-indigo-600 text-white shadow-sm' : isCurrentMonth ? (isWeekend ? 'text-indigo-400' : 'text-gray-700') : 'text-gray-300'
        )}>
          {format(day, 'd')}
        </div>

        {/* Indicadores de esquina */}
        <div className="flex items-center gap-0.5">
          {hasCriticalIssue && (
            <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center" title="Alertas críticas">
              <AlertCircle size={9} className="text-white" />
            </div>
          )}
          {hasNight && (
            <Moon size={10} className="text-indigo-400" />
          )}
        </div>
      </div>

      {/* Contenido del día */}
      {isCurrentMonth && (
        <>
          {/* Barra de trabajadores */}
          {hasWorkers && (
            <div className="mb-1">
              <div className="flex items-center gap-1 mb-0.5">
                <div
                  className="text-[11px] font-bold"
                  style={{ color: cfg.text }}
                >
                  {dayData.workers}
                </div>
                <div className="text-[9px] text-gray-400">pers.</div>
                <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (dayData.workers / 6) * 100)}%`,
                      backgroundColor: cfg.dot,
                    }}
                  />
                </div>
              </div>
              <div className="text-[10px] text-gray-400">
                {fmtH(dayData.totalHours)}
              </div>
            </div>
          )}

          {/* Ausencias */}
          {hasAbsences && (
            <div className="flex gap-0.5 flex-wrap mt-1">
              {dayData.absences.slice(0, 3).map((a: any, i: number) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: a.color }}
                  title={`${a.firstName} ${a.lastName}`}
                />
              ))}
              {dayData.absences.length > 3 && (
                <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px] text-gray-600 font-bold">
                  +{dayData.absences.length - 3}
                </div>
              )}
            </div>
          )}

          {/* Día sin planning */}
          {!hasWorkers && !period && (
            <div className="text-[10px] text-gray-300 mt-1">Sin datos</div>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// WEEK STRIP — franja inferior de cada semana
// ═══════════════════════════════════════════════════════════════════════════
function WeekStrip({ period, weekStart, weekEnd, cfg, isHovered, onOpenWeek, onDuplicate }: any) {
  const label = `${format(weekStart, "d MMM", { locale: es })} – ${format(weekEnd, "d MMM", { locale: es })}`

  return (
    <div
      className={cn(
        'col-span-7 flex items-center justify-between px-3 py-1.5 border-t transition-all',
        period ? 'border-gray-100' : 'border-dashed border-gray-200',
      )}
      style={period ? { backgroundColor: cfg.bg + 'aa' } : { backgroundColor: '#f9fafb' }}
    >
      <div className="flex items-center gap-2">
        {/* Dot de estado */}
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />

        {/* Label semana */}
        <span className="text-[11px] font-semibold" style={{ color: cfg.text }}>
          {label}
        </span>

        {/* Badge estado */}
        {period && (
          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', cfg.badge)}>
            {cfg.label}
          </span>
        )}

        {/* Alertas */}
        {period?.blockingIssuesCount > 0 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
            ⚠️ {period.blockingIssuesCount}
          </span>
        )}

        {/* Turnos count */}
        {period?.assignmentsCount > 0 && (
          <span className="text-[10px] text-gray-400">
            {period.assignmentsCount} turnos
          </span>
        )}
      </div>

      {/* Acciones */}
      <div className={cn('flex items-center gap-1 transition-opacity', isHovered ? 'opacity-100' : 'opacity-0')}>
        {period && (
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate() }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-gray-500 hover:bg-white hover:text-indigo-600 transition-all"
            title="Duplicar semana"
          >
            <Copy size={10} /> Duplicar
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onOpenWeek() }}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all',
            period
              ? 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          )}
        >
          {period ? (
            <><Eye size={10} /> Abrir</>
          ) : (
            <><Plus size={10} /> Crear semana</>
          )}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR TAB: Resumen del mes
// ═══════════════════════════════════════════════════════════════════════════
function OverviewTab({ metrics, year, month, selectedDay, selectedDayData, periods }: any) {
  const weeksData = [
    { label: 'Publicadas', value: metrics.weeksPublished, color: STATUS_CFG.PUBLISHED.dot },
    { label: 'Borrador/Gen.', value: metrics.weeksDraft, color: STATUS_CFG.DRAFT.dot },
    { label: 'Sin crear', value: metrics.weeksEmpty, color: STATUS_CFG.EMPTY.dot },
  ]

  return (
    <div className="p-4 space-y-5">

      {/* Título mes */}
      <div>
        <div className="text-[12px] font-bold text-gray-800 mb-3">
          {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][month-1]} {year}
        </div>

        {/* Horas totales */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 mb-3">
          <div className="text-[11px] text-indigo-500 font-semibold mb-1">Horas planificadas este mes</div>
          <div className="text-[28px] font-bold text-indigo-700">{fmtH(metrics.totalHours)}</div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px]">
            <span className="text-indigo-400">
              🌙 {fmtH(metrics.totalNightHours)} nocturnas
            </span>
            {metrics.totalOvertimeHours > 0 && (
              <span className="text-amber-500">
                ⬆️ {fmtH(metrics.totalOvertimeHours)} extra
              </span>
            )}
          </div>
        </div>

        {/* Estado semanas */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Estado semanas</div>
          {weeksData.map(w => (
            <div key={w.label} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
              <div className="flex-1 text-[12px] text-gray-600">{w.label}</div>
              <div className="text-[12px] font-bold text-gray-800">{w.value}</div>
              <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${metrics.weeksTotal > 0 ? (w.value / Math.max(metrics.weeksTotal + metrics.weeksEmpty, 1)) * 100 : 0}%`,
                  backgroundColor: w.color,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alertas */}
      {metrics.totalAlerts > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle size={14} />
            <span className="text-[12px] font-semibold">{metrics.totalAlerts} alerta{metrics.totalAlerts > 1 ? 's' : ''} sin resolver</span>
          </div>
          <p className="text-[11px] text-red-500 mt-1">Revisa las semanas en borrador antes de publicar</p>
        </div>
      )}

      {/* Ausencias */}
      <div>
        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Ausencias del mes</div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'Aprobadas', value: metrics.approvedAbsences, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
            { label: 'Pendientes', value: metrics.pendingAbsences, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
          ].map(s => (
            <div key={s.label} className={cn('rounded-xl p-2.5 border text-center', s.bg)}>
              <div className={cn('text-[18px] font-bold', s.color)}>{s.value}</div>
              <div className="text-[10px] text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Día seleccionado */}
      {selectedDay && selectedDayData && (
        <div className="bg-white border border-indigo-200 rounded-xl p-3">
          <div className="text-[11px] font-semibold text-indigo-600 mb-2 flex items-center gap-1">
            <CalendarDays size={11} />
            {format(parseISO(selectedDay), "EEEE d 'de' MMMM", { locale: es })}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500">Personas</span>
              <span className="font-bold text-gray-800">{selectedDayData.workers}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500">Horas</span>
              <span className="font-bold text-gray-800">{fmtH(selectedDayData.totalHours)}</span>
            </div>
            {selectedDayData.absences?.length > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-gray-500">Ausencias</span>
                <span className="font-bold text-amber-600">{selectedDayData.absences.length}</span>
              </div>
            )}
            {selectedDayData.blockingIssues > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-gray-500">Alertas</span>
                <span className="font-bold text-red-600">{selectedDayData.blockingIssues}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR TAB: Lista de semanas
// ═══════════════════════════════════════════════════════════════════════════
function WeeksTab({ periods, weeks, onGoToWeek, onCreateWeek, onDuplicate }: any) {
  return (
    <div className="p-4 space-y-2">
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {periods.length} semana{periods.length !== 1 ? 's' : ''} configurada{periods.length !== 1 ? 's' : ''}
      </div>

      {weeks.map((week: Date[]) => {
        const weekStartStr = format(week[0], 'yyyy-MM-dd')
        const period = periods.find((p: any) => p.weekStart === weekStartStr)
        const cfg = period ? STATUS_CFG[period.status] : STATUS_CFG.EMPTY

        return (
          <div
            key={weekStartStr}
            className={cn(
              'rounded-xl border p-3 transition-all',
              period ? 'bg-white border-gray-200 hover:border-indigo-200 hover:shadow-sm' : 'bg-gray-50 border-dashed border-gray-200'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.dot }} />
                <span className="text-[12px] font-semibold text-gray-700">
                  {format(week[0], "d MMM", { locale: es })} – {format(week[6], "d MMM", { locale: es })}
                </span>
              </div>
              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', cfg.badge)}>
                {cfg.label}
              </span>
            </div>

            {period && (
              <div className="flex items-center gap-3 mb-2 text-[11px] text-gray-400">
                <span>{period.assignmentsCount} turnos</span>
                {period.blockingIssuesCount > 0 && (
                  <span className="text-red-500 font-medium flex items-center gap-0.5">
                    <AlertCircle size={10} /> {period.blockingIssuesCount} alertas
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-1.5">
              {period ? (
                <>
                  <button
                    onClick={() => onGoToWeek(period.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    <Eye size={11} /> Abrir
                  </button>
                  <button
                    onClick={() => onDuplicate(period)}
                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                    title="Duplicar semana"
                  >
                    <Copy size={11} />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onCreateWeek(week[0])}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border-2 border-dashed border-indigo-300 text-indigo-600 text-[11px] font-semibold hover:bg-indigo-50 transition-colors"
                >
                  <Plus size={11} /> Crear semana
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR TAB: Ausencias
// ═══════════════════════════════════════════════════════════════════════════
function AbsencesTab({ absences, employees }: any) {
  if (absences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <CheckCircle size={28} className="text-emerald-300 mb-2" />
        <p className="text-[13px] text-gray-500 font-medium">Sin ausencias este mes</p>
        <p className="text-[11px] text-gray-400 mt-1">Todo el equipo disponible</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-2">
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {absences.length} ausencia{absences.length !== 1 ? 's' : ''} este mes
      </div>
      {absences.map((absence: any) => (
        <div key={absence.id} className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
              style={{ backgroundColor: absence.employeeColor }}>
              {absence.employeeName.charAt(0)}
            </div>
            <span className="text-[12px] font-semibold text-gray-800 truncate">{absence.employeeName}</span>
            <span className={cn(
              'ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0',
              absence.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'
            )}>
              {absence.status === 'APPROVED' ? '✓' : '⏳'}
            </span>
          </div>
          <div className="text-[11px] text-gray-500">
            {ABSENCE_LABELS[absence.type] || absence.type}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {format(parseISO(absence.startDate), "d MMM", { locale: es })} – {format(parseISO(absence.endDate), "d MMM", { locale: es })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PANEL DÍA SELECCIONADO (inferior)
// ═══════════════════════════════════════════════════════════════════════════
function DayDetailPanel({ dayStr, dayData, employees, period, onClose, onGoToWeek }: any) {
  const date = parseISO(dayStr)

  return (
    <div className="flex-shrink-0 border-t border-indigo-200 bg-indigo-50 px-6 py-3 flex items-center gap-6">
      <button onClick={onClose} className="p-1 rounded-lg hover:bg-indigo-100 text-indigo-400 flex-shrink-0">
        <X size={14} />
      </button>

      <div className="flex-shrink-0">
        <div className="text-[12px] font-bold text-indigo-700 capitalize">
          {format(date, "EEEE d 'de' MMMM yyyy", { locale: es })}
        </div>
        {period && (
          <div className="text-[11px] text-indigo-400">
            Semana {STATUS_CFG[period.status]?.label.toLowerCase()}
          </div>
        )}
      </div>

      <div className="h-8 w-px bg-indigo-200" />

      {[
        { label: 'Personas', value: dayData.workers, icon: <Users size={12} /> },
        { label: 'Horas', value: fmtH(dayData.totalHours), icon: <Clock size={12} /> },
        { label: 'Nocturnas', value: fmtH(dayData.nightHours), icon: <Moon size={12} /> },
        { label: 'Ausencias', value: dayData.absences?.length || 0, icon: <AlertTriangle size={12} /> },
      ].map(m => (
        <div key={m.label} className="flex items-center gap-2">
          <div className="text-indigo-400">{m.icon}</div>
          <div>
            <div className="text-[14px] font-bold text-indigo-800">{m.value}</div>
            <div className="text-[10px] text-indigo-400">{m.label}</div>
          </div>
        </div>
      ))}

      {/* Avatares ausentes */}
      {dayData.absences?.length > 0 && (
        <>
          <div className="h-8 w-px bg-indigo-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-indigo-500 mr-1">Ausencias:</span>
            {dayData.absences.map((a: any, i: number) => (
              <div key={i} title={`${a.firstName} ${a.lastName}`}
                className="w-6 h-6 rounded-full border-2 border-white shadow-sm text-white text-[9px] font-bold flex items-center justify-center"
                style={{ backgroundColor: a.color }}>
                {a.firstName[0]}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="ml-auto">
        {period ? (
          <button
            onClick={() => onGoToWeek(period.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <ArrowRight size={13} /> Abrir semana
          </button>
        ) : (
          <div className="text-[11px] text-indigo-400">Semana sin crear</div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Crear semana (opción A — confirmación primero)
// ═══════════════════════════════════════════════════════════════════════════
function CreateWeekModal({ weekStart, weekEnd, organizationId, locationId, existingPeriods, onClose, onCreated, onRefresh }: any) {
  const [isPending, startTransition] = useTransition()
  const [copyFrom, setCopyFrom] = useState<string>('')

  const weekStartDate = parseISO(weekStart)
  const weekEndDate = parseISO(weekEnd)

  // Semanas disponibles para copiar (las que ya existen y tienen turnos)
  const periodsWithAssignments = existingPeriods.filter((p: any) => p.assignmentsCount > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[460px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-bold text-gray-900">Crear semana</h2>
              <p className="text-[12px] text-indigo-500 mt-0.5 font-medium capitalize">
                {format(weekStartDate, "d 'de' MMMM", { locale: es })} – {format(weekEndDate, "d 'de' MMMM yyyy", { locale: es })}
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Opciones de creación */}
          <div className="space-y-3">

            {/* Opción 1: Vacía */}
            <label
              className={cn(
                'flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all',
                copyFrom === '' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'
              )}
              onClick={() => setCopyFrom('')}
            >
              <div className={cn('w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0', copyFrom === '' ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300')} />
              <div>
                <div className="text-[13px] font-bold text-gray-800">Semana vacía</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Empieza desde cero. Añade turnos manualmente o genera con IA después.
                </div>
              </div>
            </label>

            {/* Opción 2: Copiar de semana existente */}
            {periodsWithAssignments.length > 0 && (
              <div className={cn(
                'rounded-xl border-2 transition-all overflow-hidden',
                copyFrom !== '' ? 'border-indigo-500' : 'border-gray-200'
              )}>
                <div className="p-4 bg-white">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn('w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 cursor-pointer', copyFrom !== '' ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300')}
                      onClick={() => periodsWithAssignments[0] && setCopyFrom(periodsWithAssignments[0].id)}
                    />
                    <div className="flex-1">
                      <div className="text-[13px] font-bold text-gray-800">Copiar desde semana existente</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Duplica los turnos de una semana anterior como punto de partida.
                      </div>
                    </div>
                  </div>

                  {/* Selector de semana origen */}
                  <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                    {periodsWithAssignments.map((p: any) => (
                      <label
                        key={p.id}
                        className={cn(
                          'flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all',
                          copyFrom === p.id ? 'bg-indigo-100' : 'hover:bg-gray-50'
                        )}
                        onClick={() => setCopyFrom(p.id)}
                      >
                        <div className={cn('w-3.5 h-3.5 rounded-full border-2 flex-shrink-0', copyFrom === p.id ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300')} />
                        <div className="flex-1 min-w-0">
                          <span className="text-[12px] font-medium text-gray-700">
                            {format(parseISO(p.weekStart), "d MMM", { locale: es })} – {format(parseISO(p.weekEnd), "d MMM", { locale: es })}
                          </span>
                          <span className="ml-2 text-[10px] text-gray-400">{p.assignmentsCount} turnos</span>
                        </div>
                        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', STATUS_CFG[p.status]?.badge)}>
                          {STATUS_CFG[p.status]?.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-800">
            <Info size={12} className="flex-shrink-0 mt-0.5" />
            <span>
              Después de crear la semana, irás al planificador semanal donde podrás editar los turnos, añadir notas y publicar.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button
            disabled={isPending}
            onClick={() => startTransition(async () => {
              try {
                if (copyFrom) {
                  const newPeriod = await duplicateWeekToDate(copyFrom, weekStart, organizationId, locationId)
                  toast.success('Semana duplicada ✓')
                  onCreated(newPeriod.id)
                } else {
                  const newPeriod = await createPlanningPeriodForWeek(organizationId, locationId, weekStart)
                  toast.success('Semana creada ✓')
                  onCreated(newPeriod.id)
                }
              } catch (e: any) { toast.error(e.message) }
            })}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            {copyFrom ? 'Duplicar y abrir' : 'Crear y abrir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Duplicar semana a otra semana del mes
// ═══════════════════════════════════════════════════════════════════════════
function DuplicateWeekModal({ sourcePeriodId, sourceLabel, weeks, periods, organizationId, locationId, onClose, onDuplicated }: any) {
  const [isPending, startTransition] = useTransition()
  const [targetWeek, setTargetWeek] = useState<string>('')

  // Semanas disponibles como destino (excluyendo la origen)
  const sourceWeekStart = periods.find((p: any) => p.id === sourcePeriodId)?.weekStart
  const availableWeeks = weeks.filter((week: Date[]) => {
    const ws = format(week[0], 'yyyy-MM-dd')
    return ws !== sourceWeekStart
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[420px] overflow-hidden" onClick={e => e.stopPropagation()}>

        <div className="px-6 py-5 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Duplicar semana</h2>
              <p className="text-[12px] text-gray-500 mt-0.5">Desde: <strong>{sourceLabel}</strong></p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white transition-colors"><X size={16} /></button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Selecciona la semana destino</div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {availableWeeks.map((week: Date[]) => {
              const ws = format(week[0], 'yyyy-MM-dd')
              const existingPeriod = periods.find((p: any) => p.weekStart === ws)
              const cfg = existingPeriod ? STATUS_CFG[existingPeriod.status] : STATUS_CFG.EMPTY

              return (
                <label key={ws}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                    targetWeek === ws ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                  )}
                  onClick={() => setTargetWeek(ws)}
                >
                  <div className={cn('w-4 h-4 rounded-full border-2 flex-shrink-0', targetWeek === ws ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300')} />
                  <div className="flex items-center gap-2 flex-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.dot }} />
                    <span className="text-[12px] font-semibold text-gray-700">
                      {format(week[0], "d MMM", { locale: es })} – {format(week[6], "d MMM", { locale: es })}
                    </span>
                  </div>
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', cfg.badge)}>
                    {cfg.label}
                  </span>
                  {existingPeriod && (
                    <span className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5">
                      <AlertTriangle size={9} /> Se reemplazará
                    </span>
                  )}
                </label>
              )
            })}
          </div>

          {targetWeek && periods.find((p: any) => p.weekStart === targetWeek) && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
              <span>La semana destino ya tiene turnos. Se borrarán y se reemplazarán con los de la semana origen.</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">Cancelar</button>
          <button
            disabled={isPending || !targetWeek}
            onClick={() => startTransition(async () => {
              try {
                const newPeriod = await duplicateWeekToDate(sourcePeriodId, targetWeek, organizationId, locationId)
                toast.success('Semana duplicada ✓')
                onDuplicated(newPeriod.id)
              } catch (e: any) { toast.error(e.message) }
            })}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
            Duplicar y abrir
          </button>
        </div>
      </div>
    </div>
  )
}
