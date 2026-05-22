'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, X, Loader2, CheckCircle, AlertCircle,
  Copy, Trash2, Sparkles, BarChart2, Grid3x3,
  List, ChevronDown, Info, Download, Upload,
  AlertTriangle, Pencil, Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  upsertCoverageSlot, deleteCoverageSlot,
  copyDaySlots, loadCoverageTemplate, generateSlotsForDay
} from '@/server/actions/coverage'
import {
  createTemplate, updateTemplate, deleteTemplate,
  activateTemplate, deactivateTemplate, duplicateTemplate,
  getTemplatesForLocation
} from '@/server/actions/coverageTemplates'
import { evaluateTemplateStatus } from '@/lib/coverageTemplateUtils'

// ─── Constantes ───────────────────────────────────────────────────────────────
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Colores por nivel de demanda
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

function Field({ label, hint, children }: any) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      {hint && <p className="text-[11px] text-gray-400 mb-1">{hint}</p>}
      {children}
    </div>
  )
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Slot {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  minWorkers: number
  idealWorkers: number
  laborRoleId?: string | null
  skillId?: string | null
  isRequired: boolean
  notes?: string | null
  laborRole?: any
  skill?: any
}

interface Template {
  id: string
  name: string
  description: string | null
  color: string
  isDefault: boolean
  isActive: boolean
  activationType: string | null
  activeUntil: string | null
  schedStartMonth: number | null
  schedStartDay: number | null
  schedEndMonth: number | null
  schedEndDay: number | null
  slotsCount: number
  computedStatus: string
  updatedAt: string
  openingTime: string
  closingTime: string
}

interface Props {
  templates: Template[]
  initialTemplateId: string | null
  initialSlots: Slot[]
  roles: any[]
  skills: any[]
  locationId: string
  organizationId: string
  openingHours?: Record<string, { open: string; close: string }> | null
}

// ─── Slots 24h completos (00:00 → 23:30) ────────────────────────────────────
const ALL_TIME_SLOTS_24H: string[] = []
for (let h = 0; h < 24; h++) {
  ALL_TIME_SLOTS_24H.push(`${String(h).padStart(2,'0')}:00`)
  ALL_TIME_SLOTS_24H.push(`${String(h).padStart(2,'0')}:30`)
}

// ─── Slots en rango horario (puede cruzar medianoche) ────────────────────────
function getSlotsInRange(openTime: string, closeTime: string): string[] {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
  const openMin = toMin(openTime)
  const closeMin = closeTime === '00:00' ? 24 * 60 : toMin(closeTime)
  const crossesMidnight = closeMin < openMin && closeTime !== '00:00'
  return ALL_TIME_SLOTS_24H.filter(t => {
    const min = toMin(t)
    if (crossesMidnight) return min >= openMin || min < closeMin
    return min >= openMin && min < closeMin
  })
}

// ─── Slots por defecto 06:00 → 00:00 ─────────────────────────────────────────
function generateTimeSlots(): string[] {
  return getSlotsInRange('06:00', '00:00')
}

const ALL_TIME_SLOTS = generateTimeSlots()

function nextSlot(time: string): string {
  const idx = ALL_TIME_SLOTS.indexOf(time)
  return ALL_TIME_SLOTS[idx + 1] ?? '00:00'
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export function CoverageClient({ templates, initialTemplateId, initialSlots, roles, skills, locationId, organizationId, openingHours }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplateId)
  const [currentSlots, setCurrentSlots] = useState<Slot[]>(initialSlots)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [view, setView] = useState<'matrix' | 'list'>('matrix')

  // Rango horario de la plantilla activa
  const activeTemplate = templates.find(t => t.id === selectedTemplateId)
  const templateOpenTime = activeTemplate?.openingTime ?? '06:00'
  const templateCloseTime = activeTemplate?.closingTime ?? '00:00'
  const templateTimeSlots = getSlotsInRange(templateOpenTime, templateCloseTime)

  // Cuando el usuario cambia de plantilla, recargar página con la nueva
  async function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId)
    router.refresh()
  }
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [slotModal, setSlotModal] = useState<null | 'create' | Slot>(null)
  const [createDay, setCreateDay] = useState(0)
  const [createTime, setCreateTime] = useState('08:00')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showCopyDay, setShowCopyDay] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)

  // Agrupar slots por día y hora
  const slotMap = useMemo(() => {
    const map: Record<number, Record<string, Slot>> = {}
    for (let d = 0; d < 7; d++) map[d] = {}
    for (const slot of initialSlots) {
      map[slot.dayOfWeek][slot.startTime] = slot
    }
    return map
  }, [initialSlots])

  // Rango horario activo por día (min y max de los slots existentes)
  const dayRanges = useMemo(() => {
    const ranges: Record<number, { min: string; max: string; count: number; totalMin: number }> = {}
    for (let d = 0; d < 7; d++) {
      const daySlots = initialSlots.filter(s => s.dayOfWeek === d)
      if (daySlots.length === 0) {
        ranges[d] = { min: '--', max: '--', count: 0, totalMin: 0 }
      } else {
        const times = daySlots.map(s => s.startTime).sort()
        ranges[d] = {
          min: times[0],
          max: daySlots.sort((a,b) => b.startTime.localeCompare(a.startTime))[0].endTime,
          count: daySlots.length,
          totalMin: Math.max(...daySlots.map(s => s.minWorkers)),
        }
      }
    }
    return ranges
  }, [initialSlots])

  // Slots de tiempo visibles (union de todos los días)
  const visibleTimes = useMemo(() => {
    // Siempre usar el rango de la plantilla como base
    // Si hay slots fuera del rango (ej. migración), incluirlos también
    const templateSlotSet = new Set(templateTimeSlots)
    if (initialSlots.length === 0) return templateTimeSlots
    const existingTimes = new Set(initialSlots.map(s => s.startTime))
    // Unión: rango de la plantilla + slots existentes (en orden cronológico de 24h)
    const allVisible = new Set([...templateTimeSlots, ...ALL_TIME_SLOTS_24H.filter(t => existingTimes.has(t))])
    return ALL_TIME_SLOTS_24H.filter(t => allVisible.has(t))
  }, [initialSlots, templateTimeSlots])

  // Stats globales
  const stats = {
    totalSlots: initialSlots.length,
    daysConfigured: new Set(initialSlots.map(s => s.dayOfWeek)).size,
    maxDemand: initialSlots.length > 0 ? Math.max(...initialSlots.map(s => s.minWorkers)) : 0,
    requiredSlots: initialSlots.filter(s => s.isRequired).length,
    withRole: initialSlots.filter(s => s.laborRoleId).length,
  }

  function openCreateFor(day: number, time: string) {
    setCreateDay(day)
    setCreateTime(time)
    setSlotModal('create')
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f5f6fa' }}>

      {/* ── Template Bar ── */}
      <TemplateBar
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onManage={() => setShowTemplateManager(true)}
        onSwitch={(id) => handleTemplateChange(id)}
      />

      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Necesidades de cobertura</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Define cuántas personas necesitas en cada franja horaria · {stats.totalSlots} slots configurados
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplates(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 text-[12px] font-medium hover:bg-gray-50 transition-colors"
            >
              <Download size={13} /> Plantilla
            </button>
            <button
              onClick={() => setShowGenerate(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 text-[12px] font-medium hover:bg-gray-50 transition-colors"
            >
              <Sparkles size={13} /> Generar slots
            </button>
            <button
              onClick={() => setShowCopyDay(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 text-[12px] font-medium hover:bg-gray-50 transition-colors"
            >
              <Copy size={13} /> Copiar día
            </button>
            <button
              onClick={() => { setCreateDay(selectedDay ?? 0); setCreateTime('08:00'); setSlotModal('create') }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus size={14} /> Añadir slot
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {[
            { label: 'Slots totales', value: stats.totalSlots, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Días configurados', value: `${stats.daysConfigured}/7`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Demanda máxima', value: `${stats.maxDemand} pers.`, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Slots obligatorios', value: stats.requiredSlots, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Con rol requerido', value: stats.withRole, color: 'text-violet-600', bg: 'bg-violet-50' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-2.5">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[14px] flex-shrink-0', s.bg, s.color)}>
                {typeof s.value === 'number' ? s.value : s.value.toString().charAt(0)}
              </div>
              <div>
                <div className={cn('text-[16px] font-bold', s.color)}>{s.value}</div>
                <div className="text-[10px] text-gray-400">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* View switcher + Day filter */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 border border-gray-200">
            <button onClick={() => setView('matrix')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all', view === 'matrix' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500')}>
              <Grid3x3 size={13} /> Matriz
            </button>
            <button onClick={() => setView('list')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all', view === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500')}>
              <List size={13} /> Lista
            </button>
          </div>

          {/* Filtro por día */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setSelectedDay(null)}
              className={cn('px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all border', selectedDay === null ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300')}
            >
              Todos
            </button>
            {DAYS_SHORT.map((d, i) => (
              <button
                key={i}
                onClick={() => setSelectedDay(selectedDay === i ? null : i)}
                className={cn('px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all border', selectedDay === i ? 'bg-indigo-600 text-white border-indigo-600' : dayRanges[i].count === 0 ? 'bg-gray-50 text-gray-300 border-gray-100' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300')}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="flex-1 overflow-auto p-6">
        {view === 'matrix' ? (
          <MatrixView
            slotMap={slotMap}
            visibleTimes={visibleTimes}
            selectedDay={selectedDay}
            onEditSlot={(slot: any) => setSlotModal(slot)}
            onDeleteSlot={(id: string) => {
              startTransition(async () => {
                await deleteCoverageSlot(id)
                toast.success('Slot eliminado')
                router.refresh()
              })
            }}
            onAddSlot={openCreateFor}
          />
        ) : (
          <ListView
            slots={initialSlots}
            selectedDay={selectedDay}
            roles={roles}
            skills={skills}
            onEdit={(slot: any) => setSlotModal(slot)}
            onDelete={(id: string) => {
              startTransition(async () => {
                await deleteCoverageSlot(id)
                toast.success('Slot eliminado')
                router.refresh()
              })
            }}
          />
        )}
      </div>

      {/* ── Modales ── */}
      {slotModal !== null && (
        <SlotModal
          slot={slotModal === 'create' ? null : slotModal}
          defaultDay={createDay}
          defaultTime={createTime}
          locationId={locationId}
          organizationId={organizationId}
          roles={roles}
          skills={skills}
          onClose={() => setSlotModal(null)}
          onSaved={() => { setSlotModal(null); router.refresh() }}
        />
      )}

      {showTemplates && (
        <TemplatesModal
          locationId={locationId}
          organizationId={organizationId}
          onClose={() => setShowTemplates(false)}
          onLoaded={() => { setShowTemplates(false); router.refresh() }}
        />
      )}

      {showCopyDay && (
        <CopyDayModal
          locationId={locationId}
          organizationId={organizationId}
          dayRanges={dayRanges}
          onClose={() => setShowCopyDay(false)}
          onCopied={() => { setShowCopyDay(false); router.refresh() }}
        />
      )}

      {showGenerate && (
        <GenerateSlotsModal
          locationId={locationId}
          organizationId={organizationId}
          openingHours={openingHours ?? null}
          defaultOpenTime={templateOpenTime}
          defaultCloseTime={templateCloseTime}
          onClose={() => setShowGenerate(false)}
          onGenerated={() => { setShowGenerate(false); router.refresh() }}
        />
      )}

      {showTemplateManager && (
        <TemplateManagerModal
          templates={templates}
          locationId={locationId}
          organizationId={organizationId}
          onClose={() => setShowTemplateManager(false)}
          onChanged={() => { setShowTemplateManager(false); router.refresh() }}
        />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// VISTA MATRIZ — la pieza central
// ═════════════════════════════════════════════════════════════════════════════
function MatrixView({ slotMap, visibleTimes, selectedDay, onEditSlot, onDeleteSlot, onAddSlot }: {
  slotMap: Record<number, Record<string, Slot>>
  visibleTimes: string[]
  selectedDay: number | null
  onEditSlot: (slot: Slot) => void
  onDeleteSlot: (id: string) => void
  onAddSlot: (day: number, time: string) => void
}) {
  const days = selectedDay !== null ? [selectedDay] : [0,1,2,3,4,5,6]

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Leyenda */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50 flex-wrap">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Demanda por franja:</span>
        {[0,1,2,3,4,5].map(n => {
          const c = demandColor(n)
          return (
            <div key={n} className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded border" style={{ backgroundColor: c.bg, borderColor: c.border }} />
              <span className="text-[11px] text-gray-600">{n === 0 ? 'Sin datos' : `${n} pers.`}{n === 5 ? '+' : ''}</span>
            </div>
          )
        })}
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-400">
          <Info size={11} /> Click en celda para editar · Click en vacío para añadir
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-gray-50 border-b border-r border-gray-200 px-3 py-2.5 text-[11px] font-semibold text-gray-500 text-left w-[80px] z-10">
                Hora
              </th>
              {days.map(d => (
                <th key={d} className="border-b border-r border-gray-200 px-2 py-2.5 text-center bg-gray-50 min-w-[120px]">
                  <div className="text-[13px] font-bold text-gray-800">{DAYS[d]}</div>
                  <div className="text-[10px] text-gray-400 font-normal mt-0.5">
                    {Object.values(slotMap[d]).filter(Boolean).length} slots
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleTimes.map((time, ti) => (
              <tr key={time} className="group">
                {/* Hora */}
                <td className="sticky left-0 bg-white border-b border-r border-gray-100 px-3 py-0 z-10">
                  <span className={cn(
                    'text-[11px] font-mono font-semibold',
                    time.endsWith(':00') ? 'text-gray-700' : 'text-gray-400'
                  )}>
                    {time}
                  </span>
                </td>
                {/* Celdas */}
                {days.map((d: any) => {
                  const slot = slotMap[d][time]
                  const colors = demandColor(slot?.minWorkers ?? 0)

                  return (
                    <td
                      key={d}
                      className="border-b border-r border-gray-100 p-1 cursor-pointer transition-all"
                      style={{ backgroundColor: slot ? colors.bg : undefined }}
                      onClick={() => slot ? onEditSlot(slot) : onAddSlot(d, time)}
                    >
                      {slot ? (
                        <div
                          className="rounded-lg px-2 py-1.5 h-[40px] flex flex-col justify-between relative group/cell border"
                          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                        >
                          {/* Barra de demanda */}
                          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ backgroundColor: colors.bar }} />

                          <div className="pl-1 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[14px] font-bold" style={{ color: colors.text }}>
                                {slot.minWorkers}
                              </span>
                              {slot.idealWorkers > slot.minWorkers && (
                                <span className="text-[10px] font-medium opacity-60" style={{ color: colors.text }}>
                                  /{slot.idealWorkers}
                                </span>
                              )}
                            </div>
                            {slot.isRequired && (
                              <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ backgroundColor: colors.bar + '30', color: colors.text }}>
                                ●
                              </span>
                            )}
                          </div>

                          <div className="pl-1 flex items-center gap-1">
                            {slot.laborRole && (
                              <span className="text-[8px] font-semibold px-1 rounded text-white" style={{ backgroundColor: slot.laborRole.color }}>
                                {slot.laborRole.name.split(' ')[0]}
                              </span>
                            )}
                            {slot.skill && (
                              <span className="text-[8px] font-semibold px-1 rounded text-white" style={{ backgroundColor: slot.skill.color }}>
                                {slot.skill.name}
                              </span>
                            )}
                          </div>

                          {/* Delete hover */}
                          <button
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white items-center justify-center text-[10px] hidden group-hover/cell:flex shadow-md z-10"
                            onClick={e => { e.stopPropagation(); onDeleteSlot(slot.id) }}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="h-[40px] rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:!opacity-100 border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                          <Plus size={12} className="text-gray-300 hover:text-indigo-400" />
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// VISTA LISTA
// ═════════════════════════════════════════════════════════════════════════════
function ListView({ slots, selectedDay, roles, skills, onEdit, onDelete }: any) {
  const filtered = selectedDay !== null ? slots.filter((s: Slot) => s.dayOfWeek === selectedDay) : slots
  const grouped: Record<number, Slot[]> = {}
  for (const s of filtered) {
    if (!grouped[s.dayOfWeek]) grouped[s.dayOfWeek] = []
    grouped[s.dayOfWeek].push(s)
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([day, daySlots]) => (
        <div key={day} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-[13px] font-bold text-gray-800">{DAYS[Number(day)]}</h3>
            <span className="text-[11px] text-gray-400">{(daySlots as Slot[]).length} slots · máx. {Math.max(...(daySlots as Slot[]).map(s => s.minWorkers))} personas</span>
          </div>
          <div className="divide-y divide-gray-100">
            {(daySlots as Slot[]).sort((a: any, b: any) => a.startTime.localeCompare(b.startTime)).map((slot: any) => {
              const colors = demandColor(slot.minWorkers)
              return (
                <div key={slot.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors group">
                  <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: colors.bar }} />
                  <div className="w-28 flex-shrink-0">
                    <span className="text-[13px] font-mono font-semibold text-gray-700">{slot.startTime} – {slot.endTime}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
                      <span className="text-[14px] font-bold" style={{ color: colors.text }}>{slot.minWorkers}</span>
                      {slot.idealWorkers > slot.minWorkers && <span className="text-[11px] opacity-60" style={{ color: colors.text }}>/{slot.idealWorkers}</span>}
                      <span className="text-[10px] ml-1" style={{ color: colors.text }}>personas</span>
                    </div>
                    {slot.isRequired && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Obligatorio</span>
                    )}
                    {slot.laborRole && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: slot.laborRole.color }}>
                        {slot.laborRole.name}
                      </span>
                    )}
                    {slot.skill && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: slot.skill.color }}>
                        {slot.skill.name}
                      </span>
                    )}
                    {slot.notes && <span className="text-[11px] text-gray-400 italic">📝 {slot.notes}</span>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onEdit(slot)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => onDelete(slot.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {Object.keys(grouped).length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <Grid3x3 size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Sin slots configurados</p>
          <p className="text-gray-400 text-sm mt-1">Usa "Plantilla" para cargar una configuración rápida o añade slots manualmente</p>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MODAL: Crear / Editar slot
// ═════════════════════════════════════════════════════════════════════════════
function SlotModal({ slot, defaultDay, defaultTime, locationId, organizationId, roles, skills, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    dayOfWeek: slot?.dayOfWeek ?? defaultDay,
    startTime: slot?.startTime ?? defaultTime,
    endTime: slot?.endTime ?? nextSlot(defaultTime),
    minWorkers: slot?.minWorkers ?? 2,
    idealWorkers: slot?.idealWorkers ?? 2,
    laborRoleId: slot?.laborRoleId ?? '',
    skillId: slot?.skillId ?? '',
    isRequired: slot?.isRequired ?? true,
    notes: slot?.notes ?? '',
  })

  const colors = demandColor(form.minWorkers)
  const isEdit = !!slot

  return (
    <Modal title={isEdit ? 'Editar slot de cobertura' : 'Nuevo slot de cobertura'} onClose={onClose}>
      <div className="space-y-5">

        {/* Día */}
        <Field label="Día de la semana">
          <div className="grid grid-cols-7 gap-1">
            {DAYS_SHORT.map((d, i) => (
              <button
                key={i}
                onClick={() => setForm(f => ({ ...f, dayOfWeek: i }))}
                className={cn(
                  'py-2 rounded-xl text-[12px] font-bold transition-all',
                  form.dayOfWeek === i ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>

        {/* Horas */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hora inicio">
            <select className={inputCls()} value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}>
              {ALL_TIME_SLOTS_24H.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Hora fin">
            <select className={inputCls()} value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}>
              {ALL_TIME_SLOTS.slice(1).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        {/* Número de personas */}
        <Field label="Número de personas requeridas">
          <div className="p-4 rounded-2xl border-2 text-center" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: colors.text }}>
              Personas necesarias en este slot
            </div>
            <div className="flex items-center justify-center gap-6">
              {/* Mínimo */}
              <div className="text-center">
                <div className="text-[11px] text-gray-500 mb-1">Mínimo obligatorio</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setForm(f => ({ ...f, minWorkers: Math.max(0, f.minWorkers - 1) }))}
                    className="w-8 h-8 rounded-lg bg-white border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >−</button>
                  <span className="text-[28px] font-bold w-10 text-center" style={{ color: colors.text }}>
                    {form.minWorkers}
                  </span>
                  <button
                    onClick={() => setForm(f => ({ ...f, minWorkers: f.minWorkers + 1, idealWorkers: Math.max(f.idealWorkers, f.minWorkers + 1) }))}
                    className="w-8 h-8 rounded-lg bg-white border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >+</button>
                </div>
              </div>

              <div className="text-gray-300 text-[20px]">/</div>

              {/* Ideal */}
              <div className="text-center">
                <div className="text-[11px] text-gray-500 mb-1">Ideal</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setForm(f => ({ ...f, idealWorkers: Math.max(f.minWorkers, f.idealWorkers - 1) }))}
                    className="w-8 h-8 rounded-lg bg-white border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >−</button>
                  <span className="text-[28px] font-bold w-10 text-center text-gray-500">
                    {form.idealWorkers}
                  </span>
                  <button
                    onClick={() => setForm(f => ({ ...f, idealWorkers: f.idealWorkers + 1 }))}
                    className="w-8 h-8 rounded-lg bg-white border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >+</button>
                </div>
              </div>
            </div>

            {/* Barra visual */}
            <div className="flex gap-1 mt-4 justify-center">
              {Array.from({ length: Math.max(form.idealWorkers, 6) }, (_, i) => (
                <div key={i} className="w-6 h-6 rounded-lg border-2 transition-all"
                  style={{
                    backgroundColor: i < form.minWorkers ? colors.bar : i < form.idealWorkers ? colors.bar + '40' : 'transparent',
                    borderColor: i < form.minWorkers ? colors.bar : i < form.idealWorkers ? colors.bar + '60' : colors.border,
                  }}
                />
              ))}
            </div>
            <div className="text-[10px] mt-2" style={{ color: colors.text }}>
              {form.minWorkers} mín · {form.idealWorkers} ideal
            </div>
          </div>
        </Field>

        {/* Rol requerido */}
        <Field label="Rol requerido (opcional)" hint="Al menos 1 persona con este rol debe estar presente">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setForm(f => ({ ...f, laborRoleId: '' }))}
              className={cn('px-3 py-2 rounded-xl text-[12px] font-medium border-2 transition-all', !form.laborRoleId ? 'bg-gray-100 border-gray-400 text-gray-700' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300')}
            >
              Sin requisito
            </button>
            {roles.map((r: any) => (
              <button
                key={r.id}
                onClick={() => setForm(f => ({ ...f, laborRoleId: r.id }))}
                className={cn('px-3 py-2 rounded-xl text-[12px] font-semibold border-2 transition-all text-white', form.laborRoleId === r.id ? 'shadow-md scale-105' : 'opacity-50 hover:opacity-80')}
                style={{ backgroundColor: r.color, borderColor: r.color }}
              >
                {r.name}
              </button>
            ))}
          </div>
        </Field>

        {/* Etiqueta requerida */}
        <Field label="Etiqueta requerida (opcional)" hint="Al menos 1 persona con esta habilidad debe estar presente">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setForm(f => ({ ...f, skillId: '' }))}
              className={cn('px-3 py-2 rounded-xl text-[12px] font-medium border-2 transition-all', !form.skillId ? 'bg-gray-100 border-gray-400 text-gray-700' : 'bg-white border-gray-200 text-gray-400')}
            >
              Sin etiqueta
            </button>
            {skills.map((s: any) => (
              <button
                key={s.id}
                onClick={() => setForm(f => ({ ...f, skillId: s.id }))}
                className={cn('px-3 py-2 rounded-xl text-[12px] font-semibold border-2 text-white transition-all', form.skillId === s.id ? 'shadow-md scale-105' : 'opacity-50 hover:opacity-75')}
                style={{ backgroundColor: s.color, borderColor: s.color }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </Field>

        {/* Obligatorio */}
        <div
          className={cn('flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all', form.isRequired ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white')}
          onClick={() => setForm(f => ({ ...f, isRequired: !f.isRequired }))}
        >
          <div className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0 mt-0.5', form.isRequired ? 'bg-red-500' : 'bg-gray-300')}>
            <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', form.isRequired ? 'left-5' : 'left-0.5')} />
          </div>
          <div>
            <div className={cn('text-[13px] font-semibold', form.isRequired ? 'text-red-800' : 'text-gray-600')}>
              {form.isRequired ? '🔴 Slot obligatorio' : 'Slot opcional'}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {form.isRequired ? 'No puede quedar sin cubrir — el sistema lo priorizará' : 'Puede quedar sin cubrir si no hay personal disponible'}
            </div>
          </div>
        </div>

        {/* Notas */}
        <Field label="Notas (opcional)">
          <input className={inputCls()} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ej: Horario pico desayunos, necesita barista..." />
        </Field>
      </div>

      <ModalFooter
        onClose={onClose}
        saveLabel={isEdit ? 'Guardar cambios' : 'Crear slot'}
        isPending={isPending}
        onSave={() => startTransition(async () => {
          try {
            await upsertCoverageSlot({
              id: slot?.id,
              locationId,
              organizationId,
              ...form,
              laborRoleId: form.laborRoleId || null,
              skillId: form.skillId || null,
            })
            toast.success(isEdit ? 'Slot actualizado ✓' : 'Slot creado ✓')
            onSaved()
          } catch (e: any) { toast.error(e.message) }
        })}
      />
    </Modal>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MODAL: Plantillas predefinidas
// ═════════════════════════════════════════════════════════════════════════════
function TemplatesModal({ locationId, organizationId, onClose, onLoaded }: any) {
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<string>('')

  const TEMPLATES = [
    {
      id: 'restaurante_tipico',
      name: 'Restaurante típico',
      icon: '🍽️',
      desc: 'Lun–Jue apertura 6:00, fin de semana con más demanda en noche (20:00–00:00 hasta 4 personas)',
      slots: '~80 slots · 7 días',
    },
    {
      id: 'cafe_desayunos',
      name: 'Cafetería / Desayunos',
      icon: '☕',
      desc: 'Solo mañanas 7:00–16:00, fin de semana más demanda en brunch (3–4 personas)',
      slots: '~30 slots · 7 días',
    },
    {
      id: 'bar_noches',
      name: 'Bar nocturno',
      icon: '🌙',
      desc: 'Solo tardes-noches 18:00–00:00, viernes y sábado pico máximo (4–5 personas)',
      slots: '~20 slots · 7 días',
    },
  ]

  return (
    <Modal title="Cargar plantilla de cobertura" onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-[12px] text-amber-800">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span>Cargar una plantilla <strong>borrará todos los slots actuales</strong> y los reemplazará con la configuración seleccionada.</span>
        </div>

        <div className="space-y-2">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={cn(
                'w-full flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all',
                selected === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'
              )}
            >
              <span className="text-[28px]">{t.icon}</span>
              <div className="flex-1">
                <div className="text-[14px] font-bold text-gray-800">{t.name}</div>
                <div className="text-[12px] text-gray-500 mt-0.5">{t.desc}</div>
                <div className="text-[11px] text-gray-400 mt-1 font-medium">{t.slots}</div>
              </div>
              {selected === t.id && <CheckCircle size={18} className="text-indigo-600 flex-shrink-0 mt-1" />}
            </button>
          ))}
        </div>
      </div>

      <ModalFooter
        onClose={onClose}
        saveLabel="Cargar plantilla"
        isPending={isPending}
        disabled={!selected}
        onSave={() => startTransition(async () => {
          try {
            const result = await loadCoverageTemplate(locationId, organizationId, selected as any)
            toast.success(`Plantilla cargada — ${result.loaded} slots creados ✓`)
            onLoaded()
          } catch (e: any) { toast.error(e.message) }
        })}
      />
    </Modal>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MODAL: Copiar día a otro día
// ═════════════════════════════════════════════════════════════════════════════
function CopyDayModal({ locationId, organizationId, dayRanges, onClose, onCopied }: any) {
  const [isPending, startTransition] = useTransition()
  const [fromDay, setFromDay] = useState(0)
  const [toDay, setToDay] = useState(1)

  return (
    <Modal title="Copiar configuración de un día" onClose={onClose}>
      <div className="space-y-5">
        <Field label="Copiar desde">
          <div className="grid grid-cols-7 gap-1">
            {DAYS_SHORT.map((d, i) => (
              <button key={i} onClick={() => setFromDay(i)}
                className={cn('py-2.5 rounded-xl text-[12px] font-bold transition-all flex flex-col items-center gap-0.5',
                  fromDay === i ? 'bg-indigo-600 text-white shadow-md' : dayRanges[i].count === 0 ? 'bg-gray-50 text-gray-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}>
                {d}
                <span className={cn('text-[9px] font-normal', fromDay === i ? 'opacity-80' : 'text-gray-400')}>
                  {dayRanges[i].count}s
                </span>
              </button>
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-center text-gray-400 text-[20px]">↓</div>

        <Field label="Copiar hacia">
          <div className="grid grid-cols-7 gap-1">
            {DAYS_SHORT.map((d, i) => (
              <button key={i} onClick={() => i !== fromDay && setToDay(i)}
                className={cn('py-2.5 rounded-xl text-[12px] font-bold transition-all flex flex-col items-center gap-0.5',
                  i === fromDay ? 'opacity-30 cursor-not-allowed bg-gray-100 text-gray-400' :
                  toDay === i ? 'bg-emerald-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}>
                {d}
                {dayRanges[i].count > 0 && i !== fromDay && (
                  <span className={cn('text-[9px] font-normal', toDay === i ? 'opacity-80' : 'text-amber-500')}>
                    ⚠️
                  </span>
                )}
              </button>
            ))}
          </div>
          {dayRanges[toDay]?.count > 0 && toDay !== fromDay && (
            <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle size={10} /> Se borrarán los {dayRanges[toDay].count} slots actuales del {DAYS[toDay]}
            </p>
          )}
        </Field>
      </div>

      <ModalFooter
        onClose={onClose}
        saveLabel={`Copiar ${DAYS_SHORT[fromDay]} → ${DAYS_SHORT[toDay]}`}
        isPending={isPending}
        onSave={() => startTransition(async () => {
          try {
            const result = await copyDaySlots(locationId, organizationId, fromDay, toDay)
            toast.success(`${result.copied} slots copiados de ${DAYS[fromDay]} a ${DAYS[toDay]} ✓`)
            onCopied()
          } catch (e: any) { toast.error(e.message) }
        })}
      />
    </Modal>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MODAL: Generar slots automáticamente
// ═════════════════════════════════════════════════════════════════════════════
function GenerateSlotsModal({ locationId, organizationId, openingHours, defaultOpenTime = '06:00', defaultCloseTime = '00:00', onClose, onGenerated }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    days: [0,1,2,3,4] as number[],
    openTime: defaultOpenTime,
    closeTime: defaultCloseTime,
    defaultMin: 2,
    defaultIdeal: 3,
  })

  function toggleDay(d: number) {
    setForm(f => ({
      ...f,
      days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d]
    }))
  }

  return (
    <Modal title="Generar slots de 30 minutos" onClose={onClose}>
      <div className="space-y-5">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[12px] text-blue-800">
          <strong>Generación rápida:</strong> Crea slots de 30 min desde la apertura hasta el cierre con la demanda que indiques. Podrás ajustar cada slot individualmente después.
        </div>

        <Field label="Días a generar">
          <div className="grid grid-cols-7 gap-1">
            {DAYS_SHORT.map((d, i) => (
              <button key={i} onClick={() => toggleDay(i)}
                className={cn('py-2.5 rounded-xl text-[12px] font-bold transition-all',
                  form.days.includes(i) ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                )}>
                {d}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Apertura">
            <select className={inputCls()} value={form.openTime} onChange={e => setForm(f => ({ ...f, openTime: e.target.value }))}>
              {ALL_TIME_SLOTS_24H.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Cierre">
            <select className={inputCls()} value={form.closeTime} onChange={e => setForm(f => ({ ...f, closeTime: e.target.value }))}>
              {[...ALL_TIME_SLOTS_24H.slice(1), '00:00'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Personas por defecto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Mínimo</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, defaultMin: Math.max(1, f.defaultMin - 1) }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200 transition-colors">−</button>
                <span className="text-[20px] font-bold text-gray-800 w-8 text-center">{form.defaultMin}</span>
                <button onClick={() => setForm(f => ({ ...f, defaultMin: f.defaultMin + 1, defaultIdeal: Math.max(f.defaultIdeal, f.defaultMin + 1) }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200 transition-colors">+</button>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Ideal</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, defaultIdeal: Math.max(f.defaultMin, f.defaultIdeal - 1) }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200 transition-colors">−</button>
                <span className="text-[20px] font-bold text-gray-800 w-8 text-center">{form.defaultIdeal}</span>
                <button onClick={() => setForm(f => ({ ...f, defaultIdeal: f.defaultIdeal + 1 }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200 transition-colors">+</button>
              </div>
            </div>
          </div>
        </Field>
      </div>

      <ModalFooter
        onClose={onClose}
        saveLabel={`Generar para ${form.days.length} días`}
        isPending={isPending}
        disabled={form.days.length === 0}
        onSave={() => startTransition(async () => {
          try {
            let total = 0
            for (const day of form.days) {
              const result = await generateSlotsForDay(locationId, organizationId, day, form.openTime, form.closeTime, form.defaultMin, form.defaultIdeal)
              total += result.generated
            }
            toast.success(`${total} slots generados ✓`)
            onGenerated()
          } catch (e: any) { toast.error(e.message) }
        })}
      />
    </Modal>
  )
}

// ─── Componentes genéricos ────────────────────────────────────────────────────
function Modal({ title, onClose, children }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[520px] flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
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

function ModalFooter({ onClose, onSave, isPending, saveLabel = 'Guardar', disabled = false }: any) {
  return (
    <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-100">
      <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">
        Cancelar
      </button>
      <button
        onClick={onSave}
        disabled={isPending || disabled}
        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
        {saveLabel}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE BAR — barra superior de selección de plantilla
// ═══════════════════════════════════════════════════════════════════════════
const STATUS_CFG_TMPL: Record<string, { label: string; dot: string; cls: string }> = {
  active:             { label: 'Activa',      dot: '#10b981', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  scheduled_active:   { label: 'Programada',  dot: '#3b82f6', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  scheduled_upcoming: { label: 'Próxima',     dot: '#f59e0b', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  default:            { label: 'Por defecto', dot: '#6366f1', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  inactive:           { label: 'Inactiva',    dot: '#9ca3af', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
}

const MONTHS_ES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function TemplateBar({ templates, selectedTemplateId, onManage, onSwitch }: {
  templates: any[]
  selectedTemplateId: string | null
  onManage: () => void
  onSwitch: (id: string) => void
}) {
  const active = templates.find(t => t.isActive) ?? templates.find(t => t.isDefault)

  return (
    <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-2.5 flex items-center gap-3">
      {/* Plantilla activa actual */}
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-gray-400 font-medium">Plantilla activa:</span>
        {active ? (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: active.color }} />
            <span className="font-bold text-gray-800">{active.name}</span>
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', STATUS_CFG_TMPL[active.computedStatus]?.cls)}>
              {STATUS_CFG_TMPL[active.computedStatus]?.label}
            </span>
            {active.activationType === 'MANUAL' && active.activeUntil && (
              <span className="text-[10px] text-gray-400">
                · hasta {new Date(active.activeUntil).toLocaleDateString('es-ES')}
              </span>
            )}
            {active.activationType === 'SCHEDULED' && active.schedStartMonth && (
              <span className="text-[10px] text-gray-400">
                · {MONTHS_ES_SHORT[active.schedStartMonth - 1]} – {MONTHS_ES_SHORT[(active.schedEndMonth ?? 1) - 1]}
              </span>
            )}
          </div>
        ) : (
          <span className="text-gray-400 italic">Ninguna</span>
        )}
      </div>

      {/* Separador */}
      <div className="h-4 w-px bg-gray-200" />

      {/* Selector rápido de plantilla para editar */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <span className="text-[11px] text-gray-400 whitespace-nowrap">Editar:</span>
        {templates.map(t => (
          <button
            key={t.id}
            onClick={() => onSwitch(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap border transition-all',
              selectedTemplateId === t.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            )}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
            {t.name}
            <span className="text-[9px] opacity-60">({t.slotsCount})</span>
          </button>
        ))}
      </div>

      {/* Gestionar */}
      <button
        onClick={onManage}
        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap"
      >
        ⚙️ Gestionar plantillas
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE MANAGER MODAL
// ═══════════════════════════════════════════════════════════════════════════
function TemplateManagerModal({ templates, locationId, organizationId, onClose, onChanged }: any) {
  const [isPending, startTransition] = useTransition()
  const [view, setView] = useState<'list' | 'create' | 'activate'>('list')
  const [createForm, setCreateForm] = useState({ name: '', description: '', color: '#6366f1', isDefault: false, openingTime: '06:00', closingTime: '00:00' })
  const [activating, setActivating] = useState<any | null>(null)
  const [activateForm, setActivateForm] = useState({
    type: 'MANUAL' as 'MANUAL' | 'SCHEDULED',
    activeUntil: '',
    hasEndDate: false,
    schedStartMonth: 6,
    schedStartDay: 1,
    schedEndMonth: 9,
    schedEndDay: 30,
  })
  const [duplicateName, setDuplicateName] = useState('')
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#0891b2','#ec4899','#64748b','#84cc16']

  function handleActivate(template: any) {
    setActivating(template)
    setView('activate')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[640px] flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Gestión de plantillas de cobertura</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Solo puede haber una plantilla activa al mismo tiempo</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ── LISTA DE PLANTILLAS ── */}
          {view === 'list' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {templates.map((t: any) => {
                  const stCfg = STATUS_CFG_TMPL[t.computedStatus] ?? STATUS_CFG_TMPL.inactive
                  return (
                    <div key={t.id}
                      className={cn('rounded-xl border-2 p-4 transition-all',
                        t.isActive ? 'border-emerald-300 bg-emerald-50/30' :
                        t.isDefault ? 'border-indigo-200 bg-indigo-50/20' : 'border-gray-200 bg-white'
                      )}>
                      <div className="flex items-start gap-3">
                        {/* Color */}
                        <div className="w-10 h-10 rounded-xl flex-shrink-0 shadow-sm" style={{ backgroundColor: t.color }} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[14px] font-bold text-gray-800">{t.name}</span>
                            {t.isDefault && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                                Por defecto
                              </span>
                            )}
                            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', stCfg.cls)}>
                              <span className="mr-1">●</span>{stCfg.label}
                            </span>
                          </div>

                          {t.description && (
                            <p className="text-[11px] text-gray-500 mt-0.5">{t.description}</p>
                          )}

                          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                            <span>{t.slotsCount} slots</span>
                            {t.activationType === 'MANUAL' && t.activeUntil && (
                              <span>· Activa hasta {new Date(t.activeUntil).toLocaleDateString('es-ES')}</span>
                            )}
                            {t.activationType === 'SCHEDULED' && t.schedStartMonth && (
                              <span>· {MONTHS_ES_SHORT[t.schedStartMonth - 1]} {t.schedStartDay} – {MONTHS_ES_SHORT[(t.schedEndMonth ?? 1) - 1]} {t.schedEndDay} (anual)</span>
                            )}
                          </div>
                        </div>

                        {/* Acciones */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!t.isActive ? (
                            <button
                              onClick={() => handleActivate(t)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 transition-colors"
                            >
                              Activar
                            </button>
                          ) : (
                            !t.isDefault && (
                              <button
                                onClick={() => startTransition(async () => {
                                  try {
                                    await deactivateTemplate(t.id)
                                    toast.success('Plantilla desactivada')
                                    onChanged()
                                  } catch (e: any) { toast.error(e.message) }
                                })}
                                className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-[11px] font-semibold hover:bg-red-50 transition-colors"
                              >
                                Desactivar
                              </button>
                            )
                          )}
                          <button
                            onClick={() => {
                              const name = prompt(`Nombre para la copia de "${t.name}":`, `${t.name} (copia)`)
                              if (!name) return
                              startTransition(async () => {
                                await duplicateTemplate(t.id, name)
                                toast.success('Plantilla duplicada ✓')
                                onChanged()
                              })
                            }}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                            title="Duplicar"
                          >
                            <Copy size={13} />
                          </button>
                          {!t.isDefault && !t.isActive && (
                            <button
                              onClick={() => {
                                if (!confirm(`¿Eliminar "${t.name}" y todos sus slots?`)) return
                                startTransition(async () => {
                                  try {
                                    await deleteTemplate(t.id)
                                    toast.success('Plantilla eliminada')
                                    onChanged()
                                  } catch (e: any) { toast.error(e.message) }
                                })
                              }}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Crear nueva */}
              <button
                onClick={() => setView('create')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-indigo-300 text-indigo-600 text-[13px] font-semibold hover:bg-indigo-50 transition-colors"
              >
                <Plus size={15} /> Nueva plantilla
              </button>
            </div>
          )}

          {/* ── CREAR PLANTILLA ── */}
          {view === 'create' && (
            <div className="space-y-4">
              <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-indigo-600 transition-colors mb-2">
                ← Volver a la lista
              </button>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Nombre *</label>
                <input
                  className={inputCls()}
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Verano terraza, Navidades, Fin de semana..."
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Descripción (opcional)</label>
                <textarea
                  className={inputCls() + ' resize-none h-16'}
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Cuándo usar esta plantilla..."
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Color identificativo</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setCreateForm(f => ({ ...f, color: c }))}
                      className={cn('w-8 h-8 rounded-xl transition-all', createForm.color === c && 'ring-2 ring-offset-2 ring-gray-800 scale-110')}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Horario de operación */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Apertura
                  </label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={createForm.openingTime}
                    onChange={e => setCreateForm(f => ({ ...f, openingTime: e.target.value }))}>
                    {ALL_TIME_SLOTS_24H.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Cierre
                  </label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={createForm.closingTime}
                    onChange={e => setCreateForm(f => ({ ...f, closingTime: e.target.value }))}>
                    {[...ALL_TIME_SLOTS_24H.slice(1), '00:00'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-gray-400">
                La grid de cobertura mostrará solo las franjas dentro de este rango.
              </p>

              <div
                className={cn('flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all', createForm.isDefault ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200')}
                onClick={() => setCreateForm(f => ({ ...f, isDefault: !f.isDefault }))}
              >
                <div className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0 mt-0.5', createForm.isDefault ? 'bg-indigo-600' : 'bg-gray-200')}>
                  <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', createForm.isDefault ? 'left-5' : 'left-0.5')} />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-gray-700">Marcar como plantilla por defecto</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Se usa cuando ninguna otra está activa. Ideal para la configuración habitual.</div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <button onClick={() => setView('list')} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">
                  Cancelar
                </button>
                <button
                  disabled={!createForm.name.trim() || isPending}
                  onClick={() => startTransition(async () => {
                    try {
                      await createTemplate({ organizationId, locationId, ...createForm })
                      toast.success('Plantilla creada ✓')
                      onChanged()
                    } catch (e: any) { toast.error(e.message) }
                  })}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Crear plantilla
                </button>
              </div>
            </div>
          )}

          {/* ── ACTIVAR PLANTILLA ── */}
          {view === 'activate' && activating && (
            <div className="space-y-4">
              <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-indigo-600 transition-colors mb-2">
                ← Volver
              </button>

              <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50">
                <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ backgroundColor: activating.color }} />
                <div>
                  <div className="text-[14px] font-bold text-gray-800">{activating.name}</div>
                  <div className="text-[11px] text-gray-500">{activating.slotsCount} slots configurados</div>
                </div>
              </div>

              {/* Tipo de activación */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Tipo de activación</label>
                <div className="space-y-2">
                  <label
                    className={cn('flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all', activateForm.type === 'MANUAL' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200')}
                    onClick={() => setActivateForm(f => ({ ...f, type: 'MANUAL' }))}>
                    <div className={cn('w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0', activateForm.type === 'MANUAL' ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300')} />
                    <div>
                      <div className="text-[13px] font-bold text-gray-800">Activación manual</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">Se activa ahora y permanece hasta que la desactives o pongas una fecha de fin.</div>
                    </div>
                  </label>

                  <label
                    className={cn('flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all', activateForm.type === 'SCHEDULED' ? 'border-blue-500 bg-blue-50' : 'border-gray-200')}
                    onClick={() => setActivateForm(f => ({ ...f, type: 'SCHEDULED' }))}>
                    <div className={cn('w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0', activateForm.type === 'SCHEDULED' ? 'bg-blue-600 border-blue-600' : 'border-gray-300')} />
                    <div>
                      <div className="text-[13px] font-bold text-gray-800">Programación anual recurrente</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">Se activa y desactiva automáticamente cada año en las fechas que indiques.</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Opciones MANUAL */}
              {activateForm.type === 'MANUAL' && (
                <div className="pl-4 border-l-2 border-indigo-200 space-y-3">
                  <div
                    className={cn('flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all', activateForm.hasEndDate ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200')}
                    onClick={() => setActivateForm(f => ({ ...f, hasEndDate: !f.hasEndDate }))}>
                    <div className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0 mt-0.5', activateForm.hasEndDate ? 'bg-indigo-600' : 'bg-gray-200')}>
                      <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', activateForm.hasEndDate ? 'left-5' : 'left-0.5')} />
                    </div>
                    <div>
                      <div className="text-[13px] font-medium text-gray-700">Desactivar automáticamente en una fecha</div>
                      <div className="text-[11px] text-gray-400">Si no marcas esto, queda activa indefinidamente</div>
                    </div>
                  </div>
                  {activateForm.hasEndDate && (
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Fecha de fin</label>
                      <input
                        type="date"
                        className={inputCls()}
                        value={activateForm.activeUntil}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => setActivateForm(f => ({ ...f, activeUntil: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Opciones SCHEDULED */}
              {activateForm.type === 'SCHEDULED' && (
                <div className="pl-4 border-l-2 border-blue-200 space-y-3">
                  <p className="text-[11px] text-blue-700 bg-blue-50 rounded-lg px-3 py-2 border border-blue-200">
                    📅 Define el rango anual. Cada año se activará el día de inicio y se desactivará el día de fin automáticamente.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Mes inicio</label>
                      <select className={inputCls()} value={activateForm.schedStartMonth} onChange={e => setActivateForm(f => ({ ...f, schedStartMonth: +e.target.value }))}>
                        {MONTHS_ES_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 mt-2">Día inicio</label>
                      <input type="number" min={1} max={31} className={inputCls()} value={activateForm.schedStartDay}
                        onChange={e => setActivateForm(f => ({ ...f, schedStartDay: +e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Mes fin</label>
                      <select className={inputCls()} value={activateForm.schedEndMonth} onChange={e => setActivateForm(f => ({ ...f, schedEndMonth: +e.target.value }))}>
                        {MONTHS_ES_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 mt-2">Día fin</label>
                      <input type="number" min={1} max={31} className={inputCls()} value={activateForm.schedEndDay}
                        onChange={e => setActivateForm(f => ({ ...f, schedEndDay: +e.target.value }))} />
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-2 border border-gray-200">
                    Resumen: activa del <strong>{activateForm.schedStartDay} {MONTHS_ES_SHORT[activateForm.schedStartMonth - 1]}</strong> al <strong>{activateForm.schedEndDay} {MONTHS_ES_SHORT[activateForm.schedEndMonth - 1]}</strong> cada año
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2 border-t border-gray-100">
                <button onClick={() => setView('list')} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">
                  Cancelar
                </button>
                <button
                  disabled={isPending}
                  onClick={() => startTransition(async () => {
                    try {
                      if (activateForm.type === 'MANUAL') {
                        await activateTemplate(activating.id, {
                          type: 'MANUAL',
                          activeUntil: activateForm.hasEndDate && activateForm.activeUntil ? activateForm.activeUntil : null,
                        })
                      } else {
                        await activateTemplate(activating.id, {
                          type: 'SCHEDULED',
                          schedStartMonth: activateForm.schedStartMonth,
                          schedStartDay: activateForm.schedStartDay,
                          schedEndMonth: activateForm.schedEndMonth,
                          schedEndDay: activateForm.schedEndDay,
                        })
                      }
                      toast.success(`Plantilla "${activating.name}" activada ✓`)
                      onChanged()
                    } catch (e: any) { toast.error(e.message) }
                  })}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Activar plantilla
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
