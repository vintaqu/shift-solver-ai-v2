'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { format, parseISO, isToday, isTomorrow, addDays, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Clock, Calendar, Sun, Moon, LogOut, Plus,
  CheckCircle, AlertCircle, ChevronRight, Loader2, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ABSENCE_LABELS, ABSENCE_COLORS, STATUS_LABELS } from '@/lib/absenceUtils'
import { createAbsence } from '@/server/actions/absences'

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DAYS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function durationH(s: string, e: string, brk = 0) {
  const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  let sm = toM(s), em = toM(e)
  if (em <= sm) em += 24 * 60
  return Math.max(0, (em - sm - brk) / 60)
}

function fmtH(h: number) {
  const hrs = Math.floor(h)
  const m = Math.round((h - hrs) * 60)
  return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`
}

export function EmployeePortalClient({ employee, currentWeekShifts, nextWeekShifts, absences, monthHours, monthTarget, now: nowISO }: any) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<'week' | 'next' | 'absences'>('week')
  const [showAbsenceModal, setShowAbsenceModal] = useState(false)
  const now = parseISO(nowISO)

  const org = employee.organization
  const brandColor = org?.brandColor || '#4f46e5'
  const contract = employee.contracts?.[0]
  const initials = `${employee.firstName[0]}${employee.lastName[0]}`.toUpperCase()
  const monthPct = monthTarget > 0 ? Math.min(100, (monthHours / monthTarget) * 100) : 0

  // Turno de hoy
  const todayShift = currentWeekShifts.find((s: any) => isToday(parseISO(s.date)))
  const tomorrowShift = currentWeekShifts.find((s: any) => isTomorrow(parseISO(s.date)))

  // Semana del lunes al domingo con sus turnos
  function buildWeek(shifts: any[], weekOffset = 0) {
    const monday = addDays(startOfWeek(now, { weekStartsOn: 1 }), weekOffset * 7)
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(monday, i)
      const dayStr = format(day, 'yyyy-MM-dd')
      const shift = shifts.find((s: any) => format(parseISO(s.date), 'yyyy-MM-dd') === dayStr)
      return { day, shift }
    })
  }

  const currentWeek = buildWeek(currentWeekShifts, 0)
  const nextWeek = buildWeek(nextWeekShifts, 1)

  const weekHours = currentWeekShifts.reduce((a: number, s: any) => a + durationH(s.startTime, s.endTime, s.breakMinutes), 0)

  return (
    <div className="min-h-screen" style={{ background: `${brandColor}08` }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 shadow-sm"
        style={{ background: brandColor }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[13px] font-bold shadow-md"
              style={{ backgroundColor: employee.color }}>
              {initials}
            </div>
            <div>
              <div className="text-white font-bold text-[15px]">{employee.firstName} {employee.lastName}</div>
              <div className="text-white/70 text-[11px]">{org?.name}</div>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: `/r/${employee.organization?.slug ?? ''}/login` })}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
          >
            <LogOut size={16} className="text-white" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* ── Hoy ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Hoy</div>
            <div className="text-[13px] font-semibold text-gray-700 capitalize">
              {format(now, "EEEE d 'de' MMMM", { locale: es })}
            </div>
          </div>
          {todayShift ? (
            <div className="p-4">
              <div className="flex items-center gap-3 p-3 rounded-xl border-2"
                style={{ backgroundColor: `${brandColor}10`, borderColor: `${brandColor}30` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: brandColor }}>
                  <Clock size={18} className="text-white" />
                </div>
                <div>
                  <div className="text-[16px] font-bold text-gray-900">
                    {todayShift.startTime} – {todayShift.endTime}
                  </div>
                  <div className="text-[12px] text-gray-500">
                    {fmtH(durationH(todayShift.startTime, todayShift.endTime, todayShift.breakMinutes))}
                    {todayShift.isSplit && ' · Jornada partida'}
                    {todayShift.breakMinutes > 0 && ` · ${todayShift.breakMinutes}min pausa`}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 flex items-center gap-3 text-gray-400">
              <Sun size={20} className="text-amber-400" />
              <span className="text-[13px]">Día libre hoy 🎉</span>
            </div>
          )}
          {tomorrowShift && (
            <div className="px-4 pb-3 flex items-center gap-2 text-[12px] text-gray-500">
              <ChevronRight size={12} />
              <span>Mañana: <strong>{tomorrowShift.startTime} – {tomorrowShift.endTime}</strong></span>
            </div>
          )}
        </div>

        {/* ── Métricas del mes ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3.5">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Horas este mes</div>
            <div className="text-[22px] font-bold text-gray-900">{fmtH(monthHours)}</div>
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${monthPct}%`, backgroundColor: brandColor }} />
            </div>
            <div className="text-[10px] text-gray-400 mt-1">de {fmtH(monthTarget)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3.5">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Esta semana</div>
            <div className="text-[22px] font-bold text-gray-900">{fmtH(weekHours)}</div>
            <div className="text-[10px] text-gray-400 mt-1">
              {currentWeekShifts.length} turno{currentWeekShifts.length !== 1 ? 's' : ''}
              {' · '}contrato {contract?.weeklyHours ?? '?'}h/sem
            </div>
          </div>
        </div>

        {/* ── Tabs semana / próxima / ausencias ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100">
            {([
              { id: 'week', label: 'Esta semana' },
              { id: 'next', label: 'Próxima semana' },
              { id: 'absences', label: 'Mis ausencias' },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  'flex-1 py-2.5 text-[12px] font-semibold transition-all border-b-2',
                  tab === t.id ? 'text-indigo-600 border-indigo-600' : 'text-gray-400 border-transparent hover:text-gray-600'
                )}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Semana actual */}
          {(tab === 'week' || tab === 'next') && (
            <div className="p-4 space-y-2">
              {(tab === 'week' ? currentWeek : nextWeek).map(({ day, shift }, i) => {
                const isT = isToday(day)
                const isFuture = day > now
                const isPast = !isT && day < now
                return (
                  <div key={i}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl transition-all',
                      isT ? 'border-2' : 'border border-gray-100 bg-gray-50/50',
                      isPast && 'opacity-50'
                    )}
                    style={isT ? { borderColor: `${brandColor}40`, backgroundColor: `${brandColor}08` } : {}}>
                    {/* Día */}
                    <div className={cn('text-center w-10 flex-shrink-0')}>
                      <div className={cn('text-[10px] font-bold uppercase', isT ? 'text-gray-500' : 'text-gray-400')}>
                        {DAYS_ES[i]}
                      </div>
                      <div className={cn(
                        'text-[16px] font-bold w-8 h-8 rounded-full flex items-center justify-center mx-auto',
                        isT ? 'text-white' : 'text-gray-700'
                      )}
                        style={isT ? { backgroundColor: brandColor } : {}}>
                        {format(day, 'd')}
                      </div>
                    </div>

                    {/* Turno o libre */}
                    {shift ? (
                      <div className="flex-1">
                        <div className="text-[13px] font-bold text-gray-800">
                          {shift.startTime} – {shift.endTime}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {fmtH(durationH(shift.startTime, shift.endTime, shift.breakMinutes))}
                          {shift.isSplit && ' · Partido'}
                          {shift.breakMinutes > 0 && ` · ${shift.breakMinutes}m pausa`}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 text-[12px] text-gray-400">
                        Día libre
                      </div>
                    )}

                    {/* Estado cuadrante */}
                    {shift?.planningPeriod && (
                      <div className={cn(
                        'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                        shift.planningPeriod.status === 'PUBLISHED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      )}>
                        {shift.planningPeriod.status === 'PUBLISHED' ? '✓' : '⏳'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Ausencias */}
          {tab === 'absences' && (
            <div className="p-4 space-y-3">
              <button
                onClick={() => setShowAbsenceModal(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-[13px] font-semibold transition-colors"
                style={{ borderColor: `${brandColor}40`, color: brandColor }}>
                <Plus size={15} /> Solicitar ausencia
              </button>

              {absences.length === 0 ? (
                <div className="text-center py-6 text-[12px] text-gray-400">Sin ausencias registradas</div>
              ) : (
                <div className="space-y-2">
                  {absences.map((a: any) => {
                    const col = ABSENCE_COLORS[a.type]
                    const st = STATUS_LABELS[a.status]
                    return (
                      <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                        <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: col.dot }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-bold text-gray-800">{ABSENCE_LABELS[a.type]}</span>
                            <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', st.cls)}>{st.label}</span>
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {format(parseISO(a.startDate), "d MMM", { locale: es })}
                            {a.startDate !== a.endDate && ` – ${format(parseISO(a.endDate), "d MMM yyyy", { locale: es })}`}
                            {' · '}{a.totalDays}d
                          </div>
                          {a.managerNote && a.status === 'REJECTED' && (
                            <div className="text-[10px] text-red-500 mt-0.5">Motivo: {a.managerNote}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal solicitar ausencia ── */}
      {showAbsenceModal && (
        <AbsenceRequestModal
          employee={employee}
          brandColor={brandColor}
          onClose={() => setShowAbsenceModal(false)}
          onSaved={() => { setShowAbsenceModal(false); router.refresh() }}
        />
      )}
    </div>
  )
}

// ── Modal solicitar ausencia (vista empleado) ──────────────────────────────
function AbsenceRequestModal({ employee, brandColor, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    type: 'VACACIONES',
    startDate: '',
    endDate: '',
    comment: '',
  })
  const [error, setError] = useState('')

  const TYPES_AVAILABLE = ['VACACIONES', 'PERMISO', 'ASUNTO_PROPIO']

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white w-full sm:max-w-[420px] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white rounded-t-2xl">
          <h2 className="text-[15px] font-bold text-gray-900">Solicitar ausencia</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Tipo</label>
            <div className="space-y-2">
              {TYPES_AVAILABLE.map(t => {
                const col = ABSENCE_COLORS[t]
                return (
                  <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all text-[12px] font-semibold',
                      form.type === t ? 'border-transparent' : 'border-gray-200 bg-white text-gray-600'
                    )}
                    style={form.type === t ? { backgroundColor: col.bg, color: col.text, borderColor: col.border } : {}}>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.dot }} />
                    {ABSENCE_LABELS[t]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Desde</label>
              <input type="date" value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Hasta</label>
              <input type="date" value={form.endDate} min={form.startDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>

          {/* Comentario */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Motivo (opcional)</label>
            <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              placeholder="Explica el motivo de tu solicitud..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <button
            disabled={!form.startDate || !form.endDate || isPending}
            onClick={() => startTransition(async () => {
              try {
                await createAbsence({
                  organizationId: employee.organizationId,
                  employeeId: employee.id,
                  type: form.type,
                  startDate: form.startDate,
                  endDate: form.endDate,
                  comment: form.comment,
                  blocksPlanningPeriods: true,
                })
                toast.success('Solicitud enviada ✓ Tu manager la revisará pronto')
                onSaved()
              } catch (e: any) { setError(e.message) }
            })}
            className="w-full py-3 rounded-xl text-white font-semibold text-[14px] disabled:opacity-40 transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: brandColor }}
          >
            {isPending ? <><Loader2 size={15} className="animate-spin" /> Enviando...</> : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  )
}
