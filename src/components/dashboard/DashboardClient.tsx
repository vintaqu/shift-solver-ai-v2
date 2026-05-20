'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, differenceInDays, isToday, isTomorrow, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  Users, Clock, AlertCircle, AlertTriangle, CheckCircle,
  Calendar, CalendarDays, Sparkles, TrendingUp, TrendingDown,
  ArrowRight, ChevronRight, Sun, Moon, Coffee, BarChart2,
  ClipboardList, UserX, Activity, Zap, Loader2,
  PauseCircle, PlayCircle, AlertOctagon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ABSENCE_LABELS, ABSENCE_COLORS } from '@/lib/absenceUtils'
import { approveAbsence } from '@/server/actions/absences'

// ── Constantes ────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; cls: string; dot: string }> = {
  DRAFT:     { label: 'Borrador',   cls: 'bg-amber-100 text-amber-700 border-amber-200',       dot: '#f59e0b' },
  GENERATED: { label: 'Generado',   cls: 'bg-blue-100 text-blue-700 border-blue-200',          dot: '#3b82f6' },
  REVIEWED:  { label: 'Revisado',   cls: 'bg-violet-100 text-violet-700 border-violet-200',    dot: '#8b5cf6' },
  PUBLISHED: { label: 'Publicado',  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: '#10b981' },
  ARCHIVED:  { label: 'Archivado',  cls: 'bg-gray-100 text-gray-500 border-gray-200',          dot: '#9ca3af' },
}

const ACTION_LABELS: Record<string, string> = {
  CREATE:  'creó',
  UPDATE:  'actualizó',
  DELETE:  'eliminó',
  PUBLISH: 'publicó',
  MOVE:    'movió',
}

function fmtH(h: number) {
  if (h === 0) return '0h'
  const hrs = Math.floor(h)
  const m = Math.round((h - hrs) * 60)
  return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
export function DashboardClient({ data, organizationName, locationName }: any) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const now = parseISO(data.now)
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

  function quickApprove(id: string) {
    startTransition(async () => {
      try {
        await approveAbsence(id)
        toast.success('Ausencia aprobada ✓')
        router.refresh()
      } catch (e: any) { toast.error(e.message) }
    })
  }

  return (
    <div className="min-h-full" style={{ background: '#f5f6fa' }}>
      <div className="max-w-[1400px] mx-auto p-6 space-y-4">

        {/* ══ HEADER ══════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 capitalize">{greeting} 👋</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {organizationName} · {locationName} ·
              <span className="capitalize ml-1">
                {format(now, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/planning" className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
              <CalendarDays size={14} /> Ver planificador
            </Link>
          </div>
        </div>

        {/* ══ FILA 1: AHORA MISMO (HOY) ════════════════════════════════════ */}
        <section className="grid grid-cols-12 gap-4">

          {/* KPIs hoy */}
          <div className="col-span-12 lg:col-span-7 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              icon={<PlayCircle size={18} className="text-emerald-600" />}
              label="Trabajando ahora"
              value={data.today.workingNow.length}
              sub={`${data.today.totalShifts} turnos hoy`}
              color="emerald"
            />
            <MetricCard
              icon={<UserX size={18} className="text-amber-600" />}
              label="Ausentes hoy"
              value={data.today.absent.length}
              sub={data.today.absent.length > 0 ? 'vacaciones/baja' : 'Todos disponibles'}
              color="amber"
            />
            <MetricCard
              icon={<Calendar size={18} className="text-indigo-600" />}
              label="Turnos mañana"
              value={data.today.tomorrowCount}
              sub={isTomorrow(now) ? 'mañana' : `${data.today.tomorrowCount} planificados`}
              color="indigo"
            />
            <MetricCard
              icon={<AlertOctagon size={18} className={data.actions.blockingIssues > 0 ? 'text-red-600' : 'text-gray-400'} />}
              label="Alertas críticas"
              value={data.actions.blockingIssues}
              sub={data.actions.openIssues > data.actions.blockingIssues ? `${data.actions.openIssues - data.actions.blockingIssues} avisos más` : 'sin alertas'}
              color={data.actions.blockingIssues > 0 ? 'red' : 'gray'}
              href={data.currentWeek ? `/planning/week/${data.currentWeek.id}` : '/planning'}
            />
          </div>

          {/* Equipo en tiempo real */}
          <div className="col-span-12 lg:col-span-5 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-[13px] font-bold text-gray-800">Equipo en directo</h3>
              </div>
              <span className="text-[10px] font-semibold text-gray-400">
                {format(now, 'HH:mm')}
              </span>
            </div>
            <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
              {data.today.workingNow.length === 0 && data.today.nextShifts.length === 0 ? (
                <div className="text-center py-6 text-[12px] text-gray-400">
                  Nadie trabajando ahora mismo
                </div>
              ) : (
                <>
                  {data.today.workingNow.map((s: any) => (
                    <EmployeeRow
                      key={s.id}
                      emp={s}
                      status="working"
                      detail={`${s.startTime} – ${s.endTime}${s.role ? ` · ${s.role}` : ''}`}
                    />
                  ))}
                  {data.today.nextShifts.length > 0 && (
                    <>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-2 pb-0.5">
                        Próximos en entrar
                      </div>
                      {data.today.nextShifts.map((s: any) => (
                        <EmployeeRow
                          key={s.id}
                          emp={s}
                          status="upcoming"
                          detail={`Entra a las ${s.startTime}`}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* ══ FILA 2: REQUIERE ACCIÓN ═════════════════════════════════════ */}
        <section className="grid grid-cols-12 gap-4">

          {/* Solicitudes pendientes */}
          {data.actions.pendingAbsences > 0 && (
            <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-amber-100 bg-amber-50">
                <div className="flex items-center gap-2">
                  <ClipboardList size={15} className="text-amber-600" />
                  <h3 className="text-[13px] font-bold text-amber-800">
                    {data.actions.pendingAbsences} solicitud{data.actions.pendingAbsences > 1 ? 'es' : ''} de ausencia pendiente{data.actions.pendingAbsences > 1 ? 's' : ''}
                  </h3>
                </div>
                <Link href="/absences" className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800 transition-colors">
                  Ver todas <ChevronRight size={12} />
                </Link>
              </div>
              <div className="divide-y divide-gray-100">
                {data.actions.pendingAbsencesList.map((a: any) => {
                  const col = ABSENCE_COLORS[a.type]
                  const initials = `${a.firstName[0]}${a.lastName[0]}`.toUpperCase()
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: a.color }}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-bold text-gray-800">{a.firstName} {a.lastName}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border"
                            style={{ backgroundColor: col.bg, color: col.text, borderColor: col.border }}>
                            {ABSENCE_LABELS[a.type]}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {format(parseISO(a.startDate), "d MMM", { locale: es })} – {format(parseISO(a.endDate), "d MMM yyyy", { locale: es })} · {a.totalDays}d
                          {a.comment && <span className="text-gray-400 ml-2 italic">"{a.comment}"</span>}
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-400 flex-shrink-0">
                        hace {formatDistanceToNow(parseISO(a.createdAt), { locale: es })}
                      </div>
                      <button
                        onClick={() => quickApprove(a.id)}
                        disabled={isPending}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle size={11} /> Aprobar
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Estado de cuadrantes */}
          <div className={cn('bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden',
            data.actions.pendingAbsences > 0 ? 'col-span-12 lg:col-span-4' : 'col-span-12 lg:col-span-7'
          )}>
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-[13px] font-bold text-gray-800">Cuadrantes</h3>
            </div>
            <div className="p-3 space-y-2">
              {/* Semana actual */}
              <WeekStatusCard
                title="Esta semana"
                period={data.currentWeek}
                weekDates={data.currentWeek ? `${format(parseISO(data.currentWeek.weekStart), "d MMM", { locale: es })} – ${format(parseISO(data.currentWeek.weekEnd), "d MMM", { locale: es })}` : null}
                urgent={data.currentWeek?.status === 'DRAFT' || data.currentWeek?.status === 'GENERATED'}
              />

              {/* Próxima semana */}
              <WeekStatusCard
                title="Próxima semana"
                period={data.nextWeek}
                weekDates={data.nextWeek ? `${format(parseISO(data.nextWeek.weekStart), "d MMM", { locale: es })} – ${format(parseISO(data.nextWeek.weekEnd), "d MMM", { locale: es })}` : null}
                urgent={!data.nextWeek}
                emptyAction
              />
            </div>
          </div>

          {/* Sin pendientes — atajos generales */}
          {data.actions.pendingAbsences === 0 && (
            <div className="col-span-12 lg:col-span-5 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-[13px] font-bold text-gray-800">Acciones rápidas</h3>
              </div>
              <div className="p-3 grid grid-cols-2 gap-2">
                <QuickAction icon={<Sparkles size={16} />} label="Generar con IA" href="/planning" color="indigo" />
                <QuickAction icon={<Users size={16} />} label="Empleados" href="/employees" color="blue" />
                <QuickAction icon={<UserX size={16} />} label="Ausencias" href="/absences" color="amber" />
                <QuickAction icon={<ClipboardList size={16} />} label="Cobertura" href="/coverage" color="emerald" />
              </div>
            </div>
          )}
        </section>

        {/* ══ FILA 3: AUSENCIAS Y AVISOS ══════════════════════════════════ */}
        <section className="grid grid-cols-12 gap-4">

          {/* Ausencias activas y próximas */}
          <div className="col-span-12 lg:col-span-6 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-[13px] font-bold text-gray-800">Ausencias próximas (30 días)</h3>
              <Link href="/absences" className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-indigo-600 transition-colors">
                Ver todas <ChevronRight size={12} />
              </Link>
            </div>
            <div className="p-3 max-h-[280px] overflow-y-auto">
              {data.absences.active.length === 0 && data.absences.upcoming.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <CheckCircle size={24} className="text-emerald-300" />
                  <p className="text-[12px] text-gray-400">Sin ausencias programadas</p>
                </div>
              ) : (
                <>
                  {data.absences.active.length > 0 && (
                    <>
                      <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">
                        En curso · {data.absences.active.length}
                      </div>
                      <div className="space-y-1.5 mb-3">
                        {data.absences.active.map((a: any) => (
                          <AbsenceItem key={a.id} absence={a} active />
                        ))}
                      </div>
                    </>
                  )}
                  {data.absences.upcoming.length > 0 && (
                    <>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                        Próximas
                      </div>
                      <div className="space-y-1.5">
                        {data.absences.upcoming.map((a: any) => (
                          <AbsenceItem key={a.id} absence={a} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Saldos críticos vacaciones */}
          <div className="col-span-12 lg:col-span-6 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Sun size={14} className="text-amber-500" />
                <h3 className="text-[13px] font-bold text-gray-800">Saldos de vacaciones {now.getFullYear()}</h3>
              </div>
              <Link href="/absences" className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-indigo-600 transition-colors">
                Ver todos <ChevronRight size={12} />
              </Link>
            </div>
            <div className="p-3 max-h-[280px] overflow-y-auto">
              {data.vacationAlerts.over.length === 0 && data.vacationAlerts.critical.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <CheckCircle size={24} className="text-emerald-300" />
                  <p className="text-[12px] text-gray-400">Todos los empleados con saldo saludable</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.vacationAlerts.over.map((b: any) => (
                    <VacationBalanceRow key={b.id} bal={b} over />
                  ))}
                  {data.vacationAlerts.critical.map((b: any) => (
                    <VacationBalanceRow key={b.id} bal={b} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ══ FILA 4: VISIÓN MENSUAL ══════════════════════════════════════ */}
        <section className="grid grid-cols-12 gap-4">

          {/* Métricas del mes */}
          <div className="col-span-12 lg:col-span-4 space-y-3">
            <BigMetric
              label={`Horas planificadas · ${format(now, 'MMMM', { locale: es })}`}
              value={fmtH(data.month.hours)}
              comparison={data.month.hoursChangePct}
              icon={<Clock size={18} />}
              color="indigo"
            />
            <BigMetric
              label="Coste laboral estimado"
              value={`${data.month.cost.toLocaleString('es-ES')} €`}
              icon={<TrendingUp size={18} />}
              color="emerald"
              compact
            />
            <div className="grid grid-cols-2 gap-3">
              <CompactMetric
                icon={<Moon size={14} className="text-violet-500" />}
                label="Nocturnas"
                value={fmtH(data.month.nightHours)}
                bg="bg-violet-50"
              />
              <CompactMetric
                icon={<Zap size={14} className="text-orange-500" />}
                label="Horas extra"
                value={fmtH(data.month.overtimeHours)}
                bg="bg-orange-50"
              />
            </div>
          </div>

          {/* Gráfica de horas por día del mes */}
          <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <h3 className="text-[13px] font-bold text-gray-800">Horas planificadas por día</h3>
                <p className="text-[10px] text-gray-400">{format(now, 'MMMM yyyy', { locale: es })}</p>
              </div>
              <Link href={`/planning/month/${now.getFullYear()}/${now.getMonth() + 1}`}
                className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-indigo-600 transition-colors">
                Ver mes <ChevronRight size={12} />
              </Link>
            </div>
            <div className="p-4">
              <MonthChart daily={data.month.daily} todayIdx={now.getDate()} />
            </div>
          </div>
        </section>

        {/* ══ FILA 5: EMPLEADOS Y ACTIVIDAD ═══════════════════════════════ */}
        <section className="grid grid-cols-12 gap-4">

          {/* Lista empleados con métricas */}
          <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-[13px] font-bold text-gray-800">
                Horas por empleado · {format(now, 'MMMM', { locale: es })}
              </h3>
              <Link href="/employees" className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-indigo-600 transition-colors">
                Gestionar <ChevronRight size={12} />
              </Link>
            </div>
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
              {data.employees.map((emp: any) => {
                const initials = `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase()
                return (
                  <Link key={emp.id} href={`/employees/${emp.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: emp.color }}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-gray-800">
                          {emp.firstName} {emp.lastName}
                        </span>
                        <span className="text-[10px] text-gray-400">{emp.role}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, emp.monthPct)}%`,
                              backgroundColor: emp.isOver ? '#ef4444' : emp.isUnder ? '#f59e0b' : '#10b981',
                            }}
                          />
                        </div>
                        <span className={cn(
                          'text-[10px] font-semibold w-12 text-right',
                          emp.isOver ? 'text-red-600' : emp.isUnder ? 'text-amber-500' : 'text-emerald-600'
                        )}>
                          {emp.monthPct}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[13px] font-bold text-gray-800">{fmtH(emp.monthHours)}</div>
                      <div className="text-[10px] text-gray-400">/ {fmtH(emp.monthTarget)}</div>
                    </div>
                    <ChevronRight size={14} className="text-gray-200 group-hover:text-indigo-400 transition-colors" />
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Actividad reciente */}
          <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-indigo-500" />
                <h3 className="text-[13px] font-bold text-gray-800">Actividad reciente</h3>
              </div>
            </div>
            <div className="p-3 max-h-[400px] overflow-y-auto">
              {data.recentActivity.length === 0 ? (
                <div className="text-center py-6 text-[12px] text-gray-400">Sin actividad reciente</div>
              ) : (
                <div className="space-y-2.5">
                  {data.recentActivity.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Activity size={10} className="text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-gray-700 leading-snug">
                          <span className="font-semibold">{log.userName}</span>
                          {' '}{ACTION_LABELS[log.action] ?? log.action.toLowerCase()}{' '}
                          <span className="text-gray-500">{log.entity}</span>
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          hace {formatDistanceToNow(parseISO(log.createdAt), { locale: es })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ═══════════════════════════════════════════════════════════════════════════

function MetricCard({ icon, label, value, sub, color, href }: any) {
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-100' },
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  ring: 'ring-indigo-100' },
    red:     { bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-100' },
    gray:    { bg: 'bg-gray-50',    text: 'text-gray-700',    ring: 'ring-gray-100' },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    ring: 'ring-blue-100' },
  }
  const c = colorMap[color] ?? colorMap.gray

  const inner = (
    <div className="bg-white rounded-2xl border border-gray-200 p-3 hover:shadow-sm transition-all">
      <div className="flex items-center gap-2.5">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', c.bg)}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className={cn('text-[20px] font-bold leading-tight', c.text)}>{value}</div>
          <div className="text-[10px] text-gray-500 truncate">{label}</div>
        </div>
      </div>
      <div className="text-[10px] text-gray-400 mt-2 truncate">{sub}</div>
    </div>
  )

  return href ? <Link href={href}>{inner}</Link> : inner
}

function EmployeeRow({ emp, status, detail }: any) {
  const initials = `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase()

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="relative flex-shrink-0">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
          style={{ backgroundColor: emp.color }}>
          {initials}
        </div>
        {status === 'working' && (
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-gray-800 truncate">
          {emp.firstName} {emp.lastName}
        </div>
        <div className="text-[10px] text-gray-400 truncate">{detail}</div>
      </div>
    </div>
  )
}

function WeekStatusCard({ title, period, weekDates, urgent, emptyAction }: any) {
  const st = period ? STATUS_LABELS[period.status] ?? STATUS_LABELS.DRAFT : null

  if (!period && emptyAction) {
    return (
      <Link href="/planning" className="block">
        <div className={cn(
          'rounded-xl border-2 border-dashed p-3 hover:bg-gray-50 transition-all',
          urgent ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'
        )}>
          <div className="flex items-center gap-2">
            <Calendar size={14} className={urgent ? 'text-amber-600' : 'text-gray-400'} />
            <div className="flex-1">
              <div className={cn('text-[12px] font-bold', urgent ? 'text-amber-700' : 'text-gray-600')}>
                {title}
              </div>
              <div className="text-[10px] text-gray-400">
                {urgent ? '⚠️ Aún no creada' : 'Sin cuadrante'}
              </div>
            </div>
            <ChevronRight size={14} className={urgent ? 'text-amber-500' : 'text-gray-300'} />
          </div>
        </div>
      </Link>
    )
  }

  if (!period) return null

  return (
    <Link href={`/planning/week/${period.id}`} className="block">
      <div className="rounded-xl border border-gray-200 p-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: st!.dot }} />
            <span className="text-[12px] font-bold text-gray-800">{title}</span>
          </div>
          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', st!.cls)}>
            {st!.label}
          </span>
        </div>
        <div className="text-[10px] text-gray-500 mb-2">{weekDates}</div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span>{period.assignmentsCount ?? 0} turnos</span>
          {period.hours != null && <span>· {fmtH(period.hours)}</span>}
          {period.issues > 0 && (
            <span className="text-red-500 font-semibold flex items-center gap-0.5">
              <AlertCircle size={10} /> {period.issues}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function QuickAction({ icon, label, href, color }: any) {
  const colorMap: Record<string, string> = {
    indigo:  'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    blue:    'bg-blue-50 text-blue-700 hover:bg-blue-100',
    amber:   'bg-amber-50 text-amber-700 hover:bg-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  }
  return (
    <Link href={href}
      className={cn('flex items-center gap-2 p-3 rounded-xl transition-colors text-[12px] font-semibold', colorMap[color])}>
      {icon} {label}
    </Link>
  )
}

function AbsenceItem({ absence: a, active, ...rest }: { absence: any; active?: boolean; [key: string]: any }) {
  const col = ABSENCE_COLORS[a.type]
  const initials = `${a.firstName[0]}${a.lastName[0]}`.toUpperCase()
  const start = parseISO(a.startDate)
  const end = parseISO(a.endDate)
  const total = differenceInDays(end, start) + 1

  return (
    <div className={cn(
      'flex items-center gap-2.5 p-2 rounded-xl border transition-all hover:shadow-sm',
      active ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'
    )}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
        style={{ backgroundColor: a.color }}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-semibold text-gray-800 truncate">{a.firstName} {a.lastName}</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: col.bg, color: col.text }}>
            {ABSENCE_LABELS[a.type]}
          </span>
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">
          {format(start, "d MMM", { locale: es })}
          {a.startDate !== a.endDate && ` – ${format(end, "d MMM", { locale: es })}`}
          {' · '}{total}d
        </div>
      </div>
      {active && (
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      )}
    </div>
  )
}

function VacationBalanceRow({ bal, over, ...rest }: { bal: any; over?: boolean; [key: string]: any }) {
  const initials = `${bal.firstName[0]}${bal.lastName[0]}`.toUpperCase()
  return (
    <div className={cn(
      'flex items-center gap-3 p-2 rounded-xl border',
      over ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/50'
    )}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
        style={{ backgroundColor: bal.color }}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-gray-800 truncate">{bal.firstName} {bal.lastName}</div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full"
              style={{
                width: `${Math.min(100, bal.pct)}%`,
                backgroundColor: over ? '#ef4444' : '#f59e0b',
              }}
            />
          </div>
          <span className={cn('text-[10px] font-bold', over ? 'text-red-600' : 'text-amber-600')}>
            {bal.used} / {bal.total}d
          </span>
        </div>
      </div>
      <span className={cn(
        'text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0',
        over ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
      )}>
        {over ? `+${Math.abs(bal.remaining)}d` : `${bal.remaining}d`}
      </span>
    </div>
  )
}

function BigMetric({ label, value, comparison, icon, color, compact }: any) {
  const colorMap: Record<string, { bg: string; text: string; iconBg: string }> = {
    indigo:  { bg: 'bg-white', text: 'text-indigo-700',  iconBg: 'bg-indigo-50' },
    emerald: { bg: 'bg-white', text: 'text-emerald-700', iconBg: 'bg-emerald-50' },
  }
  const c = colorMap[color] ?? colorMap.indigo

  return (
    <div className={cn('rounded-2xl border border-gray-200 p-4 shadow-sm', c.bg)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-gray-500 font-medium truncate">{label}</span>
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', c.iconBg)}>
          {icon}
        </div>
      </div>
      <div className={cn('text-[24px] font-bold leading-none', c.text)}>{value}</div>
      {comparison !== undefined && comparison !== 0 && (
        <div className={cn(
          'flex items-center gap-1 mt-2 text-[11px] font-semibold',
          comparison > 0 ? 'text-emerald-600' : 'text-red-600'
        )}>
          {comparison > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {Math.abs(comparison)}% vs mes anterior
        </div>
      )}
    </div>
  )
}

function CompactMetric({ icon, label, value, bg }: any) {
  return (
    <div className={cn('rounded-2xl p-3 border border-gray-200', bg)}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] font-medium text-gray-500">{label}</span>
      </div>
      <div className="text-[18px] font-bold text-gray-800">{value}</div>
    </div>
  )
}

// ── Mini gráfica de horas por día del mes (SVG) ────────────────────────────
function MonthChart({ daily, todayIdx }: { daily: any[]; todayIdx: number }) {
  const maxHours = Math.max(...daily.map(d => d.hours), 10)
  const width = 100  // viewBox
  const height = 36
  const barWidth = width / daily.length

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height + 8}`} className="w-full h-[140px]" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1="0" y1={height * p} x2={width} y2={height * p} stroke="#f3f4f6" strokeWidth="0.2" />
        ))}

        {/* Bars */}
        {daily.map((d, i) => {
          const h = (d.hours / maxHours) * height
          const x = i * barWidth
          const isToday = d.day === todayIdx
          const isPast = d.day < todayIdx
          const color = isToday ? '#4f46e5' : isPast ? '#a5b4fc' : '#c7d2fe'

          return (
            <g key={i}>
              <rect
                x={x + 0.15}
                y={height - h}
                width={barWidth - 0.3}
                height={h}
                fill={color}
                rx="0.5"
              >
                <title>{`Día ${d.day}: ${fmtH(d.hours)} · ${d.workers} pers.`}</title>
              </rect>
              {/* Day number for milestones */}
              {(d.day === 1 || d.day % 5 === 0 || isToday) && (
                <text
                  x={x + barWidth / 2}
                  y={height + 5}
                  textAnchor="middle"
                  fontSize="2.5"
                  fill={isToday ? '#4f46e5' : '#9ca3af'}
                  fontWeight={isToday ? 'bold' : 'normal'}
                >
                  {d.day}
                </text>
              )}
            </g>
          )
        })}

        {/* Today indicator line */}
        <line
          x1={(todayIdx - 0.5) * barWidth}
          y1="0"
          x2={(todayIdx - 0.5) * barWidth}
          y2={height}
          stroke="#4f46e5"
          strokeWidth="0.3"
          strokeDasharray="0.5 0.5"
        />
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-between text-[10px] text-gray-400 px-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-indigo-300" />
            <span>Pasado</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-indigo-600" />
            <span>Hoy</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-indigo-200" />
            <span>Próximos</span>
          </div>
        </div>
        <span>Máx: {fmtH(maxHours)}/día</span>
      </div>
    </div>
  )
}
