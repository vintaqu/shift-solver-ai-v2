'use client'

import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, Loader2, CheckCircle, X,
  Trash2, Info, RefreshCw, CalendarDays, Copy,
  Settings, Save, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  upsertDateSlot, bulkUpsertDateSlots, deleteDateSlot,
  copyWeekCoverage, copyDayCoverage, clearWeekCoverage, regenerateWeekFromTemplate,
  saveWeekAsTemplate, importTemplateToWeek,
} from '@/server/actions/coverageWeekly'

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

function demandColor(min: number): { bg: string; text: string; border: string; bar: string } {
  if (min === 0) return { bg: '#f9fafb', text: '#9ca3af', border: '#f3f4f6', bar: '#e5e7eb' }
  if (min === 1) return { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', bar: '#22c55e' }
  if (min === 2) return { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', bar: '#3b82f6' }
  if (min === 3) return { bg: '#fefce8', text: '#854d0e', border: '#fef08a', bar: '#eab308' }
  if (min === 4) return { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa', bar: '#f97316' }
  return { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', bar: '#ef4444' }
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
}

interface Props {
  weekStartISO: string
  slots: Slot[]
  roles: any[]
  skills: any[]
  locationId: string
  organizationId: string
  inheritance: { source: 'existing' | 'previous_week' | 'template' | 'empty'; count: number }
  activeTemplateName: string | null
  templates?: Array<{ id: string; name: string; description?: string | null; color: string; isActive: boolean; slotsCount: number }>
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function CoverageWeeklyClient({
  weekStartISO, slots: initialSlots, roles, skills, locationId, organizationId,
  inheritance, activeTemplateName, templates = [],
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showBanner, setShowBanner] = useState(inheritance.source !== 'existing')
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null)
  const [addingSlot, setAddingSlot] = useState<{ date: string; time: string } | null>(null)
  const [showCopyWeek, setShowCopyWeek] = useState(false)
  const [showCopyDay, setShowCopyDay] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showGearMenu, setShowGearMenu] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [showImportTemplate, setShowImportTemplate] = useState(false)
  const gearRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) setShowGearMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartISO, i)), [weekStartISO])

  // Normalizar fechas de los slots del servidor (llegan como ISO datetime completo)
  const normalizedSlots = useMemo(() => initialSlots.map(s => ({
    ...s,
    date: (s.date as any as string).slice(0, 10),
  })), [initialSlots])

  const slotMap = useMemo(() => {
    const map = new Map<string, Slot>()
    for (const s of normalizedSlots) map.set(`${s.date}|${s.startTime}`, s)
    return map
  }, [normalizedSlots])

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

  function goToWeek(newWeekStartISO: string) {
    router.push(`/coverage?week=${newWeekStartISO}`)
  }

  const bannerText = inheritance.source === 'previous_week'
    ? `Esta semana se ha copiado automáticamente de la semana anterior (${inheritance.count} slots).`
    : inheritance.source === 'template'
    ? `Esta semana se ha generado desde la plantilla activa${activeTemplateName ? ` "${activeTemplateName}"` : ''} (${inheritance.count} slots).`
    : inheritance.source === 'empty'
    ? 'Esta semana no tiene cobertura configurada todavía.'
    : null

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
          <button onClick={() => setAddingSlot({ date: weekDates[0], time: '09:00' })}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors">
            <Plus size={14} /> Añadir slot
          </button>

          {/* ── Menú de acciones (engranaje) ── */}
          <div className="relative" ref={gearRef}>
            <button onClick={() => setShowGearMenu(v => !v)}
              className={cn('w-9 h-9 rounded-xl border flex items-center justify-center transition-colors',
                showGearMenu ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}>
              <Settings size={15} />
            </button>

            {showGearMenu && (
              <div className="absolute right-0 top-11 z-30 w-[260px] bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden py-1.5">
                <div className="px-3.5 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Copiar</div>
                <MenuItem icon={<Copy size={14} />} label="Copiar un día…" desc="De cualquier fecha a otra"
                  onClick={() => { setShowGearMenu(false); setShowCopyDay(true) }} />
                <MenuItem icon={<CalendarDays size={14} />} label="Copiar una semana…" desc="De cualquier semana del año a otra"
                  onClick={() => { setShowGearMenu(false); setShowCopyWeek(true) }} />

                <div className="my-1 border-t border-gray-100" />
                <div className="px-3.5 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Plantillas</div>
                <MenuItem icon={<Save size={14} />} label="Guardar semana como plantilla" desc="Reutilízala más adelante"
                  onClick={() => { setShowGearMenu(false); setShowSaveTemplate(true) }} />
                <MenuItem icon={<FolderOpen size={14} />} label="Importar plantilla…" desc={`${templates.filter(t => t.slotsCount > 0).length} disponibles`}
                  onClick={() => { setShowGearMenu(false); setShowImportTemplate(true) }} />
                {activeTemplateName && (
                  <MenuItem icon={<RefreshCw size={14} />} label="Regenerar desde plantilla activa" desc={activeTemplateName}
                    onClick={() => {
                      setShowGearMenu(false)
                      startTransition(async () => {
                        try {
                          const r = await regenerateWeekFromTemplate(locationId, organizationId, weekStartISO)
                          toast.success(`${r.count} slots regenerados desde "${r.templateName}" ✓`)
                          router.refresh()
                        } catch (e: any) { toast.error(e.message) }
                      })
                    }} />
                )}

                <div className="my-1 border-t border-gray-100" />
                <MenuItem icon={<Trash2 size={14} />} label="Borrar toda la semana" desc="No se puede deshacer" danger
                  onClick={() => { setShowGearMenu(false); setShowClearConfirm(true) }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Banner de herencia ── */}
      {showBanner && bannerText && (
        <div className={cn(
          'flex-shrink-0 px-6 py-2 flex items-center gap-2 text-[12px] border-b',
          inheritance.source === 'empty' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-blue-50 text-blue-700 border-blue-100'
        )}>
          <Info size={13} className="flex-shrink-0" />
          <span className="flex-1">{bannerText}</span>
          <button onClick={() => setShowBanner(false)} className="text-current opacity-60 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="flex-shrink-0 flex items-center gap-6 px-6 py-2.5 bg-white border-b border-gray-100 text-[12px]">
        <span><strong className="text-indigo-600 text-[14px]">{kpis.total}</strong> <span className="text-gray-400">slots totales</span></span>
        <span><strong className="text-emerald-600 text-[14px]">{kpis.daysWithSlots}/7</strong> <span className="text-gray-400">días configurados</span></span>
        <span><strong className="text-amber-600 text-[14px]">{kpis.maxDemand}</strong> <span className="text-gray-400">demanda máxima</span></span>
        <span><strong className="text-red-500 text-[14px]">{kpis.required}</strong> <span className="text-gray-400">slots obligatorios</span></span>
      </div>

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
                        </div>
                        {(slot.laborRole || slot.notes) && (
                          <div className="pl-1.5 mt-0.5 flex items-center gap-1 flex-wrap">
                            {slot.laborRole && (
                              <span className="text-[8px] font-semibold px-1 rounded text-white leading-tight" style={{ backgroundColor: slot.laborRole.color }}>
                                {slot.laborRole.name.split(' ')[0]}
                              </span>
                            )}
                            {slot.notes && <span className="text-[8px] text-gray-500" title={slot.notes}>📝</span>}
                          </div>
                        )}
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
          locationId={locationId}
          organizationId={organizationId}
          roles={roles}
          onClose={() => { setEditingSlot(null); setAddingSlot(null) }}
          onSaved={() => { setEditingSlot(null); setAddingSlot(null); router.refresh() }}
        />
      )}

      {/* ── Modal copiar día ── */}
      {showCopyDay && (
        <CopyDayModal
          weekDates={weekDates}
          locationId={locationId}
          organizationId={organizationId}
          onClose={() => setShowCopyDay(false)}
          onCopied={() => { setShowCopyDay(false); router.refresh() }}
        />
      )}

      {/* ── Modal copiar semana ── */}
      {showCopyWeek && (
        <CopyWeekModal
          weekStartISO={weekStartISO}
          locationId={locationId}
          organizationId={organizationId}
          onClose={() => setShowCopyWeek(false)}
          onCopied={(targetWeek: string) => { setShowCopyWeek(false); goToWeek(targetWeek) }}
        />
      )}

      {/* ── Modal guardar semana como plantilla ── */}
      {showSaveTemplate && (
        <SaveTemplateModal
          weekStartISO={weekStartISO}
          slotsCount={kpis.total}
          locationId={locationId}
          organizationId={organizationId}
          onClose={() => setShowSaveTemplate(false)}
          onSaved={() => { setShowSaveTemplate(false); router.refresh() }}
        />
      )}

      {/* ── Modal importar plantilla ── */}
      {showImportTemplate && (
        <ImportTemplateModal
          templates={templates}
          weekStartISO={weekStartISO}
          locationId={locationId}
          organizationId={organizationId}
          onClose={() => setShowImportTemplate(false)}
          onImported={() => { setShowImportTemplate(false); router.refresh() }}
        />
      )}

      {/* ── Confirmar borrar semana ── */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowClearConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[400px] p-6">
            <h3 className="text-[15px] font-bold text-gray-900 mb-2">¿Borrar toda la cobertura de esta semana?</h3>
            <p className="text-[13px] text-gray-500 mb-5">
              Se eliminarán <strong>{kpis.total} slots</strong> de la semana del {weekRangeLabel(weekStartISO)}. Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100">Cancelar</button>
              <button
                disabled={isPending}
                onClick={() => startTransition(async () => {
                  try {
                    const r = await clearWeekCoverage(locationId, weekStartISO)
                    toast.success(`${r.deleted} slots eliminados`)
                    setShowClearConfirm(false)
                    router.refresh()
                  } catch (e: any) { toast.error(e.message) }
                })}
                className="px-5 py-2 rounded-xl bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 disabled:opacity-50">
                Sí, borrar todo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal: crear/editar slot ──────────────────────────────────────────────────
function SlotModal({ slot, defaultDate, defaultTime, weekDates, locationId, organizationId, roles, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isEdit = !!slot
  const [form, setForm] = useState({
    dates: isEdit ? [slot.date] : [defaultDate],
    startTime: slot?.startTime ?? defaultTime,
    endTime: slot?.endTime ?? nextSlot(defaultTime),
    minWorkers: slot?.minWorkers ?? 2,
    idealWorkers: slot?.idealWorkers ?? 2,
    laborRoleId: slot?.laborRoleId ?? '',
    isRequired: slot?.isRequired ?? true,
    notes: slot?.notes ?? '',
  })
  const colors = demandColor(form.minWorkers)

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
                <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value, endTime: nextSlot(e.target.value) }))} className={inputCls()} />
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-1">Fin</div>
                <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className={inputCls()} />
              </div>
            </div>
          </Field>

          <Field label="Personas necesarias">
            <div className="flex gap-6">
              <div>
                <div className="text-[11px] text-gray-400 mb-1">Mínimo</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setForm(f => ({ ...f, minWorkers: Math.max(0, f.minWorkers - 1) }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">−</button>
                  <span className="text-[20px] font-bold w-8 text-center" style={{ color: colors.bar }}>{form.minWorkers}</span>
                  <button onClick={() => setForm(f => ({ ...f, minWorkers: f.minWorkers + 1 }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">+</button>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-1">Ideal</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setForm(f => ({ ...f, idealWorkers: Math.max(f.minWorkers, f.idealWorkers - 1) }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">−</button>
                  <span className="text-[20px] font-bold text-gray-800 w-8 text-center">{form.idealWorkers}</span>
                  <button onClick={() => setForm(f => ({ ...f, idealWorkers: f.idealWorkers + 1 }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">+</button>
                </div>
              </div>
            </div>
          </Field>

          {roles.length > 0 && (
            <Field label="Rol requerido (opcional)">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setForm(f => ({ ...f, laborRoleId: '' }))}
                  className={cn('px-3 py-1.5 rounded-lg text-[12px] font-semibold border-2 transition-all', !form.laborRoleId ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-400 hover:border-gray-300')}>
                  Cualquiera
                </button>
                {roles.map((r: any) => (
                  <button key={r.id} onClick={() => setForm(f => ({ ...f, laborRoleId: f.laborRoleId === r.id ? '' : r.id }))}
                    className={cn('px-3 py-1.5 rounded-lg text-[12px] font-semibold border-2 text-white transition-all', form.laborRoleId === r.id ? 'scale-105' : 'opacity-50 hover:opacity-75')}
                    style={{ backgroundColor: r.color, borderColor: r.color }}>
                    {r.name}
                  </button>
                ))}
              </div>
            </Field>
          )}

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
                <button disabled={isPending} onClick={() => startTransition(async () => {
                  try { await deleteDateSlot(slot.id); toast.success('Slot eliminado'); onSaved() } catch (e: any) { toast.error(e.message) }
                  setConfirmDelete(false)
                })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {isPending ? <Loader2 size={12} className="animate-spin" /> : null} Sí, eliminar
                </button>
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-[12px] text-gray-500 hover:bg-gray-100 transition-colors">Cancelar</button>
              </>
            ) : (
              <>
                <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">Cancelar</button>
                {isEdit && (
                  <button onClick={() => setConfirmDelete(true)} disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] text-red-500 hover:bg-red-50 border border-red-200 transition-colors disabled:opacity-50">
                    <Trash2 size={13} /> Eliminar slot
                  </button>
                )}
              </>
            )}
          </div>
          <button
            disabled={isPending || (!isEdit && form.dates.length === 0)}
            onClick={() => startTransition(async () => {
              try {
                if (isEdit) {
                  await upsertDateSlot({
                    id: slot.id, locationId, organizationId, dateISO: slot.date,
                    startTime: form.startTime, endTime: form.endTime,
                    minWorkers: form.minWorkers, idealWorkers: form.idealWorkers,
                    laborRoleId: form.laborRoleId || null, isRequired: form.isRequired, notes: form.notes,
                  })
                  toast.success('Slot actualizado ✓')
                } else {
                  const result = await bulkUpsertDateSlots({
                    locationId, organizationId, datesISO: form.dates,
                    startTime: form.startTime, endTime: form.endTime,
                    minWorkers: form.minWorkers, idealWorkers: form.idealWorkers,
                    laborRoleId: form.laborRoleId || null, isRequired: form.isRequired, notes: form.notes,
                  })
                  const parts = []
                  if (result.updated > 0) parts.push(`${result.updated} actualizados`)
                  if (result.created > 0) parts.push(`${result.created} creados`)
                  toast.success(`Slots: ${parts.join(' · ') || 'sin cambios'} ✓`)
                }
                onSaved()
              } catch (e: any) { toast.error(e.message) }
            })}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {isEdit ? 'Guardar cambios' : 'Crear slot'}
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

// ─── Modal: copiar día (cualquier fecha → cualquier fecha) ─────────────────────
function CopyDayModal({ weekDates, locationId, organizationId, onClose, onCopied }: any) {
  const [isPending, startTransition] = useTransition()
  const [fromDate, setFromDate] = useState<string>(weekDates[0])
  const [toDate, setToDate] = useState<string>('')

  const fromLabel = fromDate ? fmtDayLabel(fromDate) : null
  const toLabel = toDate ? fmtDayLabel(toDate) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h3 className="text-[15px] font-bold text-gray-900">Copiar un día a otro</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Puedes elegir cualquier fecha del calendario</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Día origen">
            <input type="date" className={inputCls()} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            {fromLabel && <p className="text-[11px] text-gray-400 mt-1">{fromLabel.dayName} {fromLabel.dayNum} {fromLabel.month} · Semana {isoWeekNumber(fromDate)}</p>}
          </Field>
          <div className="flex justify-center text-gray-300 text-[16px]">↓</div>
          <Field label="Día destino">
            <input type="date" className={inputCls()} value={toDate} onChange={e => setToDate(e.target.value)} />
            {toLabel && <p className="text-[11px] text-gray-400 mt-1">{toLabel.dayName} {toLabel.dayNum} {toLabel.month} · Semana {isoWeekNumber(toDate)}</p>}
          </Field>
          {toDate && (
            <p className="text-[11px] text-amber-600">⚠️ La cobertura existente del día destino se reemplazará.</p>
          )}
        </div>
        <div className="flex justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100">Cancelar</button>
          <button
            disabled={isPending || !fromDate || !toDate || fromDate === toDate}
            onClick={() => startTransition(async () => {
              try {
                const r = await copyDayCoverage(locationId, organizationId, fromDate, toDate)
                toast.success(`${r.copied} slots copiados ✓`)
                onCopied()
              } catch (e: any) { toast.error(e.message) }
            })}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Copiar día
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: copiar semana (cualquier semana del año → otra) ────────────────────
function CopyWeekModal({ weekStartISO, locationId, organizationId, onClose, onCopied }: any) {
  const [isPending, startTransition] = useTransition()
  const [fromPick, setFromPick] = useState<string>(weekStartISO)
  const [toPick, setToPick] = useState<string>('')

  // Normalizar cualquier fecha elegida al lunes de su semana
  const fromWeek = fromPick ? mondayOfISO(fromPick) : ''
  const toWeek = toPick ? mondayOfISO(toPick) : ''

  function WeekInfo({ weekISO }: { weekISO: string }) {
    if (!weekISO) return null
    return (
      <p className="text-[11px] text-gray-400 mt-1">
        <strong className="text-indigo-600">Semana {isoWeekNumber(weekISO)}</strong> · {weekRangeLabel(weekISO)}
      </p>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h3 className="text-[15px] font-bold text-gray-900">Copiar una semana a otra</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Elige cualquier fecha — se usará la semana completa que la contiene</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Semana origen">
            <input type="date" className={inputCls()} value={fromPick} onChange={e => setFromPick(e.target.value)} />
            <WeekInfo weekISO={fromWeek} />
          </Field>
          <div className="flex justify-center text-gray-300 text-[16px]">↓</div>
          <Field label="Semana destino">
            <input type="date" className={inputCls()} value={toPick} onChange={e => setToPick(e.target.value)} />
            <WeekInfo weekISO={toWeek} />
          </Field>
          {toWeek && (
            <p className="text-[11px] text-amber-600">⚠️ La cobertura existente de la semana destino se reemplazará.</p>
          )}
        </div>
        <div className="flex justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100">Cancelar</button>
          <button
            disabled={isPending || !fromWeek || !toWeek || fromWeek === toWeek}
            onClick={() => startTransition(async () => {
              try {
                const r = await copyWeekCoverage(locationId, organizationId, fromWeek, toWeek)
                toast.success(`${r.copied} slots copiados a la semana ${isoWeekNumber(toWeek)} ✓`)
                onCopied(toWeek)
              } catch (e: any) { toast.error(e.message) }
            })}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Copiar semana
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: guardar semana como plantilla ──────────────────────────────────────
function SaveTemplateModal({ weekStartISO, slotsCount, locationId, organizationId, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#6366f1')
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0891b2', '#ec4899', '#64748b', '#84cc16']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)' }}>
          <h3 className="text-[15px] font-bold text-gray-900">Guardar semana como plantilla</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Semana {isoWeekNumber(weekStartISO)} ({weekRangeLabel(weekStartISO)}) · {slotsCount} slots
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Field label="Nombre de la plantilla *">
            <input className={inputCls()} value={name} onChange={e => setName(e.target.value)}
              placeholder="Ej: Semana estándar, Verano terraza…" autoFocus />
          </Field>
          <Field label="Descripción (opcional)">
            <input className={inputCls()} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Breve descripción…" />
          </Field>
          <Field label="Color">
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={cn('w-7 h-7 rounded-lg transition-all', color === c ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : 'hover:scale-110')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </Field>
        </div>
        <div className="flex justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100">Cancelar</button>
          <button
            disabled={isPending || !name.trim() || slotsCount === 0}
            onClick={() => startTransition(async () => {
              try {
                const r = await saveWeekAsTemplate(locationId, organizationId, weekStartISO, {
                  name: name.trim(), description: description.trim() || undefined, color,
                })
                toast.success(`Plantilla "${r.name}" guardada (${r.count} slots) ✓`)
                onSaved()
              } catch (e: any) { toast.error(e.message) }
            })}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar plantilla
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: importar plantilla a la semana actual ──────────────────────────────
function ImportTemplateModal({ templates, weekStartISO, locationId, organizationId, onClose, onImported }: any) {
  const [isPending, startTransition] = useTransition()
  const usable = templates.filter((t: any) => t.slotsCount > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[440px] flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0" style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h3 className="text-[15px] font-bold text-gray-900">Importar plantilla</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Se aplicará a la semana {isoWeekNumber(weekStartISO)} ({weekRangeLabel(weekStartISO)}). La cobertura actual se reemplazará.
          </p>
        </div>
        <div className="px-6 py-4 space-y-2 overflow-y-auto flex-1">
          {usable.length === 0 ? (
            <p className="text-[13px] text-gray-400 text-center py-6">
              No hay plantillas con slots configurados.<br />
              <span className="text-[11px]">Guarda primero una semana como plantilla desde el menú ⚙️</span>
            </p>
          ) : usable.map((t: any) => (
            <button
              key={t.id}
              disabled={isPending}
              onClick={() => startTransition(async () => {
                try {
                  const r = await importTemplateToWeek(t.id, locationId, organizationId, weekStartISO)
                  toast.success(`${r.count} slots importados desde "${r.templateName}" ✓`)
                  onImported()
                } catch (e: any) { toast.error(e.message) }
              })}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left disabled:opacity-50">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-gray-800 truncate">{t.name}</span>
                  {t.isActive && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Activa</span>}
                </div>
                {t.description && <div className="text-[11px] text-gray-400 truncate">{t.description}</div>}
                <div className="text-[10px] text-gray-400">{t.slotsCount} slots</div>
              </div>
              {isPending ? <Loader2 size={14} className="animate-spin text-indigo-400" /> : <FolderOpen size={14} className="text-indigo-400 flex-shrink-0" />}
            </button>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
          <button onClick={onClose} className="w-full py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100">Cancelar</button>
        </div>
      </div>
    </div>
  )
}
