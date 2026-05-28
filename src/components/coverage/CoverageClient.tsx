'use client'

import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, X, Loader2, CheckCircle,
  Copy, Trash2, Sparkles, Grid3x3,
  List, Info, AlertTriangle, Pencil,
  MoreHorizontal, LayoutGrid, Wand2, Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  upsertCoverageSlot, deleteCoverageSlot,
  copyDaySlots, loadCoverageTemplate, generateSlotsForDay
} from '@/server/actions/coverage'
import {
  createTemplate, deleteTemplate,
  activateTemplate, deactivateTemplate, duplicateTemplate,
} from '@/server/actions/coverageTemplates'
import { evaluateTemplateStatus } from '@/lib/coverageTemplateUtils'

// ─── Constantes ───────────────────────────────────────────────────────────────
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS_ES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const ALL_TIME_SLOTS_24H: string[] = []
for (let h = 0; h < 24; h++) {
  ALL_TIME_SLOTS_24H.push(`${String(h).padStart(2,'0')}:00`)
  ALL_TIME_SLOTS_24H.push(`${String(h).padStart(2,'0')}:30`)
}

function getSlotsInRange(open: string, close: string): string[] {
  const [oh, om] = open.split(':').map(Number)
  const [ch, cm] = close === '00:00' ? [24, 0] : close.split(':').map(Number)
  const openMin = oh * 60 + om
  const closeMin = ch * 60 + cm
  return ALL_TIME_SLOTS_24H.filter(t => {
    const [th, tm] = t.split(':').map(Number)
    const tMin = th * 60 + tm
    return tMin >= openMin && tMin < closeMin
  })
}

function nextSlot(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const next = h * 60 + m + 30
  if (next >= 24 * 60) return '00:00'
  return `${String(Math.floor(next / 60)).padStart(2,'0')}:${String(next % 60).padStart(2,'0')}`
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

function Field({ label, hint, children }: any) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      {hint && <p className="text-[11px] text-gray-400 mb-1">{hint}</p>}
      {children}
    </div>
  )
}

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

// ─── Modal base ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide = false }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div
        className={cn('relative bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]', wide ? 'w-full max-w-[640px]' : 'w-full max-w-[520px]')}
        onClick={e => e.stopPropagation()}
      >
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

function ModalFooter({ onClose, onSave, isPending, saveLabel = 'Guardar', disabled = false, onDelete, confirmDelete, onConfirmDelete, onCancelDelete }: any) {
  return (
    <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-100">
      <div className="flex items-center gap-2">
        {confirmDelete ? (
          <>
            <span className="text-[12px] text-red-600 font-medium">¿Eliminar este slot?</span>
            <button onClick={onConfirmDelete} disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
              {isPending ? <Loader2 size={12} className="animate-spin" /> : null} Sí, eliminar
            </button>
            <button onClick={onCancelDelete}
              className="px-3 py-1.5 rounded-lg text-[12px] text-gray-500 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            {onDelete && (
              <button onClick={onDelete} disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] text-red-500 hover:bg-red-50 border border-red-200 transition-colors disabled:opacity-50">
                <Trash2 size={13} /> Eliminar slot
              </button>
            )}
          </>
        )}
      </div>
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

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  active:             { label: 'Activa',      cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  scheduled_active:   { label: 'Programada',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  scheduled_upcoming: { label: 'Próxima',     cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  // 'default' removed — only active/inactive matters
  inactive:           { label: 'Inactiva',    cls: 'bg-gray-100 text-gray-500 border-gray-200' },
}

// ─── Template Bar ─────────────────────────────────────────────────────────────
function TemplateSidebar({ templates, selectedTemplateId, onSwitch, onManage, onNewTemplate }: any) {
  return (
    <div className="w-[220px] min-w-[220px] flex flex-col bg-white border-r border-gray-200 overflow-hidden h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[13px] font-bold text-gray-900">Plantillas</h2>
          <span className="text-[10px] text-gray-400">{templates.length} total</span>
        </div>
        <p className="text-[11px] text-gray-400">Selecciona una para editar sus slots</p>
      </div>

      {/* Lista de plantillas */}
      <div className="flex-1 overflow-y-auto py-1">
        {templates.map((t: any) => {
          const isSelected = t.id === selectedTemplateId
          const cfg = STATUS_CFG[t.computedStatus] ?? STATUS_CFG.inactive
          return (
            <button
              key={t.id}
              onClick={() => onSwitch(t.id)}
              className={cn(
                'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors border-l-2',
                isSelected
                  ? 'bg-indigo-50 border-l-indigo-600'
                  : 'border-l-transparent hover:bg-gray-50'
              )}
            >
              {/* Color dot */}
              <div className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: t.color }} />

              <div className="flex-1 min-w-0">
                <div className={cn('text-[12px] font-semibold truncate', isSelected ? 'text-indigo-700' : 'text-gray-800')}>
                  {t.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', cfg.cls)}>
                    {cfg.label}
                  </span>
                  <span className="text-[10px] text-gray-400">{t.slotsCount} slots</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer acciones */}
      <div className="border-t border-gray-100 p-3 space-y-2">
        <button
          onClick={onManage}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors"
        >
          <Settings size={12} /> Gestionar plantillas
        </button>
      </div>
    </div>
  )
}

// ─── Template Manager Modal ───────────────────────────────────────────────────
function TemplateManagerModal({ templates: initialTemplates, locationId, organizationId, onClose, onChanged }: any) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [view, setView] = useState<'list' | 'create' | 'activate'>('list')
  const [templates, setTemplates] = useState(initialTemplates)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({
    name: '', description: '', color: '#6366f1',
    openingTime: '09:00', closingTime: '23:00',
  })
  const [activating, setActivating] = useState<any>(null)
  const [activateForm, setActivateForm] = useState({
    type: 'MANUAL' as 'MANUAL' | 'SCHEDULED',
    activeUntil: '', hasEndDate: false,
    schedStartMonth: 6, schedStartDay: 1,
    schedEndMonth: 9, schedEndDay: 30,
  })

  const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#0891b2','#ec4899','#64748b','#84cc16']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[640px] flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

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

          {/* ── LISTA ── */}
          {view === 'list' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {templates.map((t: any) => {
                  const stCfg = STATUS_CFG[t.computedStatus] ?? STATUS_CFG.inactive
                  return (
                    <div key={t.id} className={cn(
                      'rounded-xl border-2 p-4 transition-all',
                      t.isActive ? 'border-emerald-300 bg-emerald-50/30' :
                      'border-gray-200 bg-white'
                    )}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ backgroundColor: t.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[14px] font-bold text-gray-800">{t.name}</span>

                            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', stCfg.cls)}>
                              ● {stCfg.label}
                            </span>
                          </div>
                          {t.description && <p className="text-[11px] text-gray-500 mt-0.5">{t.description}</p>}
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                            <span>{t.slotsCount} slots</span>
                            {t.activationType === 'SCHEDULED' && t.schedStartMonth && (
                              <span>· {MONTHS_ES_SHORT[t.schedStartMonth - 1]} – {MONTHS_ES_SHORT[(t.schedEndMonth ?? 1) - 1]} (anual)</span>
                            )}
                          </div>
                        </div>

                        {/* Acciones */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!t.isActive ? (
                            <button
                              onClick={() => { setActivating(t); setView('activate') }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 transition-colors"
                            >
                              Activar
                            </button>
                          ) : (
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
                          )}
                          <button
                            onClick={() => {
                              const name = prompt(`Nombre para la copia de "${t.name}":`, `${t.name} (copia)`)
                              if (!name) return
                              startTransition(async () => {
                                try {
                                  await duplicateTemplate(t.id, name)
                                  toast.success('Plantilla duplicada ✓')
                                  onChanged()
                                } catch (e: any) { toast.error(e.message) }
                              })
                            }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors text-[11px]"
                            title="Duplicar"
                          >
                            <Copy size={14} />
                          </button>
                          {!t.isActive && (
                            <button
                              onClick={() => setConfirmDeleteId(t.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <button
                onClick={() => setView('create')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-[13px] text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
              >
                <Plus size={16} /> Nueva plantilla
              </button>
            </div>
          )}

          {/* ── CREAR PLANTILLA ── */}
          {view === 'create' && (
            <div className="space-y-4">
              <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-indigo-600 transition-colors mb-2">
                ← Volver
              </button>

              <Field label="Nombre de la plantilla">
                <input
                  className={inputCls(!createForm.name.trim())}
                  placeholder="Ej: Temporada alta, Verano terraza…"
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                />
              </Field>

              <Field label="Descripción (opcional)">
                <input
                  className={inputCls()}
                  placeholder="Breve descripción…"
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                />
              </Field>

              <Field label="Color identificativo">
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setCreateForm(f => ({ ...f, color: c }))}
                      className={cn('w-8 h-8 rounded-lg transition-all', createForm.color === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110')}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </Field>

              <Field label="Horario de apertura y cierre">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-gray-400 mb-1">Apertura</div>
                    <input type="time" className={inputCls()} value={createForm.openingTime}
                      onChange={e => setCreateForm(f => ({ ...f, openingTime: e.target.value }))} />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400 mb-1">Cierre</div>
                    <input type="time" className={inputCls()} value={createForm.closingTime}
                      onChange={e => setCreateForm(f => ({ ...f, closingTime: e.target.value }))} />
                  </div>
                </div>
              </Field>

              <Field label="Tipo de activación">
                <div className="space-y-2">
                  {[
                    { value: 'MANUAL', title: 'Activación manual', desc: 'Activa la plantilla ahora. Puedes desactivarla manualmente cuando quieras.' },
                    { value: 'SCHEDULED', title: 'Programada por fechas', desc: 'Se activa automáticamente en un rango de fechas anual (ej. verano, navidades).' },
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={cn('flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all', activateForm.type === opt.value ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white hover:border-gray-300')}
                      onClick={() => setActivateForm(f => ({ ...f, type: opt.value as any }))}
                    >
                      <div className={cn('w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center', activateForm.type === opt.value ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300')}>
                        {activateForm.type === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-gray-800">{opt.title}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </Field>

              {activateForm.type === 'MANUAL' && (
                <div>
                  <div className={cn('flex items-center gap-2 mb-2 cursor-pointer')} onClick={() => setActivateForm(f => ({ ...f, hasEndDate: !f.hasEndDate }))}>
                    <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center', activateForm.hasEndDate ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300')}>
                      {activateForm.hasEndDate && <CheckCircle size={10} className="text-white" />}
                    </div>
                    <span className="text-[12px] text-gray-600">Establecer fecha de fin de activación</span>
                  </div>
                  {activateForm.hasEndDate && (
                    <input
                      type="date"
                      className={inputCls()}
                      value={activateForm.activeUntil}
                      onChange={e => setActivateForm(f => ({ ...f, activeUntil: e.target.value }))}
                    />
                  )}
                </div>
              )}

              {activateForm.type === 'SCHEDULED' && (
                <Field label="Rango de fechas anual">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] text-gray-400 mb-1">Mes inicio</div>
                      <select className={inputCls()} value={activateForm.schedStartMonth} onChange={e => setActivateForm(f => ({ ...f, schedStartMonth: Number(e.target.value) }))}>
                        {MONTHS_ES_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-400 mb-1">Día inicio</div>
                      <input type="number" min={1} max={31} className={inputCls()} value={activateForm.schedStartDay} onChange={e => setActivateForm(f => ({ ...f, schedStartDay: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-400 mb-1">Mes fin</div>
                      <select className={inputCls()} value={activateForm.schedEndMonth} onChange={e => setActivateForm(f => ({ ...f, schedEndMonth: Number(e.target.value) }))}>
                        {MONTHS_ES_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-400 mb-1">Día fin</div>
                      <input type="number" min={1} max={31} className={inputCls()} value={activateForm.schedEndDay} onChange={e => setActivateForm(f => ({ ...f, schedEndDay: Number(e.target.value) }))} />
                    </div>
                  </div>
                </Field>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
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

// ─── Menú ··· acciones secundarias ───────────────────────────────────────────
function ActionsMenu({ onGenerate, onCopyDay, onAddSlot, onClearAll }: any) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const items = [
    { icon: <Sparkles size={14} />, label: 'Generar slots automáticamente', desc: 'Rellena todo el horario de una vez', action: onGenerate },
    { icon: <Copy size={14} />, label: 'Copiar día a otro día', desc: 'Duplica la configuración de un día', action: onCopyDay },
    { icon: <Plus size={14} />, label: 'Añadir slot individual', desc: 'Crea un slot de 30 min concreto', action: onAddSlot },
    { divider: true },
    { icon: <Trash2 size={14} />, label: 'Borrar todos los slots', desc: 'Vacía la plantilla actual', action: onClearAll, danger: true },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition-colors',
          open ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        )}
      >
        <MoreHorizontal size={14} /> Más opciones
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl border border-gray-200 shadow-xl z-40 py-1.5">
          {items.map((item, i) =>
            (item as any).divider ? (
              <div key={i} className="my-1 border-t border-gray-100" />
            ) : (
              <button
                key={i}
                onClick={() => { setOpen(false); item.action?.() }}
                className={cn('w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors', (item as any).danger && 'hover:bg-red-50')}
              >
                <span className={cn('mt-0.5 flex-shrink-0', (item as any).danger ? 'text-red-500' : 'text-gray-400')}>{item.icon}</span>
                <div>
                  <div className={cn('text-[13px] font-medium', (item as any).danger ? 'text-red-600' : 'text-gray-800')}>{item.label}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{item.desc}</div>
                </div>
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ─── Estado vacío ─────────────────────────────────────────────────────────────
function EmptyState({ onLoadTemplate, onGenerate }: any) {
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
          <LayoutGrid size={28} className="text-indigo-400" />
        </div>
        <h2 className="text-[17px] font-bold text-gray-900 mb-2">Sin cobertura configurada</h2>
        <p className="text-[13px] text-gray-500 mb-8 leading-relaxed">
          Define cuántas personas necesitas en cada franja horaria. El algoritmo usará esto para generar el cuadrante automáticamente.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={onLoadTemplate}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all group"
          >
            <div className="text-2xl">🍽️</div>
            <div>
              <div className="text-[13px] font-semibold text-gray-800 group-hover:text-indigo-700">Cargar ejemplo</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Restaurante, cafetería o bar</div>
            </div>
          </button>
          <button
            onClick={onGenerate}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-indigo-600 bg-indigo-600 hover:bg-indigo-700 transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Wand2 size={20} className="text-white" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-white">Configurar manualmente</div>
              <div className="text-[11px] text-indigo-200 mt-0.5">Define tu horario y demanda</div>
            </div>
          </button>
        </div>
        <p className="text-[11px] text-gray-400">
          También puedes hacer click en cualquier celda de la cuadrícula para añadir un slot
        </p>
      </div>
    </div>
  )
}

// ─── Modal: Cargar ejemplo ────────────────────────────────────────────────────
function TemplatesModal({ locationId, organizationId, templateId, onClose, onLoaded }: any) {
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<string>('')

  const OPTS = [
    { id: 'restaurante_tipico', icon: '🍽️', name: 'Restaurante típico', desc: 'Desayuno, mediodía y noche. Más demanda en fin de semana.', slots: '~60 slots · 7 días' },
    { id: 'cafe_desayunos',     icon: '☕', name: 'Cafetería / Desayunos', desc: 'Solo mañanas 7:00–16:00. Brunch reforzado en fin de semana.', slots: '~30 slots · 7 días' },
    { id: 'bar_noches',         icon: '🌙', name: 'Bar nocturno', desc: 'Solo tardes-noches 18:00–00:00. Pico máximo viernes y sábado.', slots: '~20 slots · 7 días' },
  ]

  return (
    <Modal title="Cargar configuración de ejemplo" onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-[12px] text-amber-800">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          <span>Esto <strong>reemplazará</strong> los slots actuales de esta plantilla.</span>
        </div>
        <div className="space-y-2">
          {OPTS.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={cn('w-full flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all', selected === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300')}
            >
              <span className="text-2xl">{t.icon}</span>
              <div className="flex-1">
                <div className="text-[13px] font-bold text-gray-800">{t.name}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{t.desc}</div>
                <div className="text-[10px] text-indigo-500 font-semibold mt-1">{t.slots}</div>
              </div>
              {selected === t.id && <CheckCircle size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />}
            </button>
          ))}
        </div>
        <ModalFooter
          onClose={onClose}
          saveLabel="Cargar configuración"
          disabled={!selected}
          isPending={isPending}
          onSave={() => startTransition(async () => {
            try {
              const result = await loadCoverageTemplate(locationId, organizationId, selected as any, templateId)
              toast.success(`${result.loaded} slots cargados ✓`)
              onLoaded()
            } catch (e: any) { toast.error(e.message) }
          })}
        />
      </div>
    </Modal>
  )
}

// ─── Modal: Generar slots ─────────────────────────────────────────────────────
function GenerateSlotsModal({ locationId, organizationId, templateId, defaultOpenTime = '09:00', defaultCloseTime = '23:00', onClose, onGenerated }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    days: [0,1,2,3,4,5,6] as number[],
    openTime: defaultOpenTime,
    closeTime: defaultCloseTime,
    defaultMin: 2,
    defaultIdeal: 3,
  })

  const previewCount = useMemo(() => {
    if (!form.openTime || !form.closeTime) return 0
    const [oh, om] = form.openTime.split(':').map(Number)
    const [ch, cm] = form.closeTime === '00:00' ? [24, 0] : form.closeTime.split(':').map(Number)
    const mins = (ch * 60 + cm) - (oh * 60 + om)
    return Math.max(0, Math.floor(mins / 30)) * form.days.length
  }, [form])

  function toggleDay(d: number) {
    setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] }))
  }

  return (
    <Modal title="Generar slots de cobertura" onClose={onClose}>
      <div className="space-y-5">
        <Field label="Días a configurar">
          <div className="grid grid-cols-7 gap-1">
            {DAYS_SHORT.map((d, i) => (
              <button key={i} onClick={() => toggleDay(i)}
                className={cn('py-2.5 rounded-xl text-[12px] font-bold transition-all', form.days.includes(i) ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {d}
              </button>
            ))}
          </div>
          <button onClick={() => setForm(f => ({ ...f, days: f.days.length === 7 ? [] : [0,1,2,3,4,5,6] }))} className="mt-2 text-[11px] text-indigo-500 hover:underline">
            {form.days.length === 7 ? 'Deseleccionar todos' : 'Seleccionar todos'}
          </button>
        </Field>
        <Field label="Horario">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Apertura</div>
              <input type="time" value={form.openTime} onChange={e => setForm(f => ({ ...f, openTime: e.target.value }))} className={inputCls()} />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Cierre</div>
              <input type="time" value={form.closeTime} onChange={e => setForm(f => ({ ...f, closeTime: e.target.value }))} className={inputCls()} />
            </div>
          </div>
        </Field>
        <Field label="Personas por franja (valores iniciales)">
          <div className="flex gap-6">
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Mínimo</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, defaultMin: Math.max(1, f.defaultMin - 1) }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">−</button>
                <span className="text-[20px] font-bold text-gray-800 w-8 text-center">{form.defaultMin}</span>
                <button onClick={() => setForm(f => ({ ...f, defaultMin: f.defaultMin + 1 }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">+</button>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Ideal</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, defaultIdeal: Math.max(f.defaultMin, f.defaultIdeal - 1) }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">−</button>
                <span className="text-[20px] font-bold text-gray-800 w-8 text-center">{form.defaultIdeal}</span>
                <button onClick={() => setForm(f => ({ ...f, defaultIdeal: f.defaultIdeal + 1 }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">+</button>
              </div>
            </div>
          </div>
        </Field>
        {previewCount > 0 && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-[12px] text-indigo-800">
            Se crearán <strong>{previewCount} slots</strong> de 30 min para {form.days.length} día{form.days.length !== 1 ? 's' : ''}. Podrás ajustar cada franja individualmente después.
          </div>
        )}
        <ModalFooter
          onClose={onClose}
          saveLabel={`Generar ${previewCount} slots`}
          isPending={isPending}
          disabled={form.days.length === 0 || previewCount === 0}
          onSave={() => startTransition(async () => {
            try {
              let total = 0
              for (const day of form.days) {
                const result = await generateSlotsForDay(locationId, organizationId, day, form.openTime, form.closeTime, form.defaultMin, form.defaultIdeal, templateId)
                total += result.generated
              }
              toast.success(`${total} slots generados ✓`)
              onGenerated()
            } catch (e: any) { toast.error(e.message) }
          })}
        />
      </div>
    </Modal>
  )
}

// ─── Modal: Copiar día ────────────────────────────────────────────────────────
function CopyDayModal({ locationId, organizationId, templateId, dayRanges, onClose, onCopied }: any) {
  const [isPending, startTransition] = useTransition()
  const [fromDay, setFromDay] = useState(0)
  const [toDay, setToDay] = useState<number | null>(null)

  const availableFrom = Object.entries(dayRanges)
    .filter(([, r]: any) => r.count > 0)
    .map(([d]) => Number(d))

  return (
    <Modal title="Copiar slots de un día a otro" onClose={onClose}>
      <div className="space-y-5">
        <Field label="Copiar desde">
          <div className="grid grid-cols-7 gap-1">
            {DAYS_SHORT.map((d, i) => (
              <button key={i} onClick={() => { if (availableFrom.includes(i)) setFromDay(i) }} disabled={!availableFrom.includes(i)}
                className={cn('py-2.5 rounded-xl text-[12px] font-bold transition-all',
                  !availableFrom.includes(i) ? 'opacity-30 cursor-not-allowed bg-gray-100 text-gray-400' :
                  fromDay === i ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {d}
              </button>
            ))}
          </div>
          {availableFrom.length === 0 && <p className="text-[11px] text-amber-600 mt-2">No hay ningún día con slots configurados.</p>}
        </Field>
        <Field label="Copiar hacia">
          <div className="grid grid-cols-7 gap-1">
            {DAYS_SHORT.map((d, i) => (
              <button key={i} onClick={() => setToDay(i === fromDay ? null : i)} disabled={i === fromDay}
                className={cn('py-2.5 rounded-xl text-[12px] font-bold transition-all',
                  i === fromDay ? 'opacity-30 cursor-not-allowed bg-gray-100 text-gray-400' :
                  toDay === i ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {d}
                {(dayRanges[i]?.count ?? 0) > 0 && i !== fromDay && <span className={cn('text-[9px] font-normal', toDay === i ? 'opacity-80' : 'text-amber-500')}>⚠️</span>}
              </button>
            ))}
          </div>
          {toDay !== null && (dayRanges[toDay]?.count ?? 0) > 0 && toDay !== fromDay && (
            <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle size={10} /> Se borrarán los {dayRanges[toDay].count} slots actuales del {DAYS[toDay]}
            </p>
          )}
        </Field>
        <ModalFooter
          onClose={onClose}
          saveLabel={toDay !== null ? `Copiar ${DAYS_SHORT[fromDay]} → ${DAYS_SHORT[toDay]}` : 'Selecciona un día destino'}
          disabled={toDay === null || availableFrom.length === 0}
          isPending={isPending}
          onSave={() => startTransition(async () => {
            if (toDay === null) return
            try {
              const result = await copyDaySlots(locationId, organizationId, fromDay, toDay, templateId)
              toast.success(`${result.copied} slots copiados de ${DAYS[fromDay]} a ${DAYS[toDay]} ✓`)
              onCopied()
            } catch (e: any) { toast.error(e.message) }
          })}
        />
      </div>
    </Modal>
  )
}

// ─── Modal: Crear/Editar slot ─────────────────────────────────────────────────
function SlotModal({ slot, defaultDay, defaultTime, locationId, organizationId, templateId, roles, skills, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
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
        <Field label="Día de la semana">
          <div className="grid grid-cols-7 gap-1">
            {DAYS_SHORT.map((d, i) => (
              <button key={i} onClick={() => setForm(f => ({ ...f, dayOfWeek: i }))}
                className={cn('py-2 rounded-xl text-[12px] font-bold transition-all', form.dayOfWeek === i ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {d}
              </button>
            ))}
          </div>
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
                <button onClick={() => setForm(f => ({ ...f, minWorkers: Math.max(1, f.minWorkers - 1) }))} className="w-8 h-8 rounded-lg bg-gray-100 font-bold hover:bg-gray-200">−</button>
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
      <ModalFooter
        onClose={onClose}
        saveLabel={isEdit ? 'Guardar cambios' : 'Crear slot'}
        isPending={isPending}
        onDelete={isEdit ? () => setConfirmDelete(true) : undefined}
        confirmDelete={confirmDelete}
        onConfirmDelete={() => startTransition(async () => {
          try {
            await deleteCoverageSlot(slot.id)
            toast.success('Slot eliminado')
            onSaved()
          } catch (e: any) { toast.error(e.message) }
          setConfirmDelete(false)
        })}
        onCancelDelete={() => setConfirmDelete(false)}
        onSave={() => startTransition(async () => {
          try {
            await upsertCoverageSlot({ id: slot?.id, locationId, organizationId, templateId, ...form, laborRoleId: form.laborRoleId || null, skillId: form.skillId || null })
            toast.success(isEdit ? 'Slot actualizado ✓' : 'Slot creado ✓')
            onSaved()
          } catch (e: any) { toast.error(e.message) }
        })}
      />
    </Modal>
  )
}

// ─── Vista Matriz ─────────────────────────────────────────────────────────────
function MatrixView({ slotMap, visibleTimes, selectedDay, onEditSlot, onAddSlot }: any) {
  const days = selectedDay !== null ? [selectedDay] : [0,1,2,3,4,5,6]

  return (
    <div>
      <div className="flex items-center gap-3 px-6 py-2.5 bg-white border-b border-gray-100 flex-wrap">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Demanda por franja:</span>
        {[0,1,2,3,4,5].map(n => {
          const c = demandColor(n)
          return (
            <div key={n} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: c.bar }} />
              <span className="text-[11px] text-gray-500">{n === 0 ? 'Sin datos' : `${n} pers.`}{n === 5 ? '+' : ''}</span>
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
              <th className="sticky left-0 bg-gray-50 border-b border-r border-gray-200 px-3 py-2.5 text-[11px] font-semibold text-gray-500 text-left w-[80px] z-10">Hora</th>
              {days.map((d: number) => (
                <th key={d} className="border-b border-r border-gray-200 px-2 py-2.5 text-center bg-gray-50 min-w-[120px]">
                  <div className="text-[13px] font-bold text-gray-800">{DAYS[d]}</div>
                  <div className="text-[10px] text-gray-400 font-normal mt-0.5">{Object.values(slotMap[d]).filter(Boolean).length} slots</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleTimes.map((time: string) => (
              <tr key={time} className="group">
                <td className="sticky left-0 bg-white border-b border-r border-gray-100 px-3 py-0 z-10">
                  <span className={cn('text-[11px] font-mono font-semibold', time.endsWith(':00') ? 'text-gray-700' : 'text-gray-400')}>{time}</span>
                </td>
                {days.map((d: number) => {
                  const slot = slotMap[d][time]
                  const colors = demandColor(slot?.minWorkers ?? 0)
                  return (
                    <td key={d} className="border-b border-r border-gray-100 p-1 cursor-pointer transition-all"
                      style={{ backgroundColor: slot ? colors.bg : undefined }}
                      onClick={() => slot ? onEditSlot(slot) : onAddSlot(d, time)}>
                      {slot ? (
                        <div className="rounded-lg px-2 py-1.5 h-[40px] flex flex-col justify-between relative group/cell border"
                          style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ backgroundColor: colors.bar }} />
                          <div className="pl-1 flex items-center justify-between">
                            <span className="text-[14px] font-bold" style={{ color: colors.text }}>{slot.minWorkers}</span>
                            {slot.idealWorkers > slot.minWorkers && <span className="text-[10px] font-medium opacity-60" style={{ color: colors.text }}>/{slot.idealWorkers}</span>}
                          </div>
                          {slot.laborRole && (
                            <div className="pl-1">
                              <span className="text-[8px] font-semibold px-1 rounded text-white" style={{ backgroundColor: slot.laborRole.color }}>{slot.laborRole.name.split(' ')[0]}</span>
                            </div>
                          )}
                          <button className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-indigo-500 text-white opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-center justify-center shadow-sm z-10"
                            onClick={e => { e.stopPropagation(); onEditSlot(slot) }}>
                            <Pencil size={9} />
                          </button>
                        </div>
                      ) : (
                        <div className="h-[40px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Plus size={14} className="text-gray-300" />
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

// ─── Vista Lista ──────────────────────────────────────────────────────────────
function ListView({ slots, onEdit, onDelete }: any) {
  const grouped = useMemo(() => {
    const g: Record<number, Slot[]> = {}
    for (let d = 0; d < 7; d++) g[d] = []
    for (const s of slots) g[s.dayOfWeek].push(s)
    for (const d in g) g[d].sort((a: Slot, b: Slot) => a.startTime.localeCompare(b.startTime))
    return g
  }, [slots])

  return (
    <div className="p-6 space-y-6">
      {Object.entries(grouped).map(([dayStr, daySlots]) => {
        const d = Number(dayStr)
        if ((daySlots as Slot[]).length === 0) return null
        return (
          <div key={d}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[13px] font-bold text-gray-800">{DAYS[d]}</span>
              <span className="text-[11px] text-gray-400">{(daySlots as Slot[]).length} slots</span>
            </div>
            <div className="space-y-1.5">
              {(daySlots as Slot[]).map((slot) => {
                const colors = demandColor(slot.minWorkers)
                return (
                  <div key={slot.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors">
                    <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: colors.bar }} />
                    <span className="text-[12px] font-mono text-gray-600 w-24 flex-shrink-0">{slot.startTime} – {slot.endTime}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[13px] font-bold" style={{ color: colors.text }}>{slot.minWorkers}</span>
                      {slot.idealWorkers > slot.minWorkers && <span className="text-[11px] text-gray-400">/{slot.idealWorkers}</span>}
                      <span className="text-[11px] text-gray-400 ml-1">pers.</span>
                    </div>
                    {slot.laborRole && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: slot.laborRole.color }}>{slot.laborRole.name}</span>
                    )}
                    {slot.isRequired && <span className="text-[10px] text-red-500 font-semibold ml-auto">Obligatorio</span>}
                    <div className={cn('flex items-center gap-1', !slot.isRequired && 'ml-auto')}>
                      <button onClick={() => onEdit(slot)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors"><Pencil size={13} /></button>
                      <button onClick={() => onDelete(slot.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {slots.length === 0 && (
        <div className="text-center py-12">
          <Grid3x3 size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-[13px]">Sin slots configurados</p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export function CoverageClient({ templates, initialTemplateId, initialSlots, roles, skills, locationId, organizationId }: {
  templates: any[]
  initialTemplateId: string | null
  initialSlots: Slot[]
  roles: any[]
  skills: any[]
  locationId: string
  organizationId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId)
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showTemplateManager, setShowTemplateManager] = useState(false)

  // Modales
  const [slotModal, setSlotModal] = useState<null | 'create' | Slot>(null)
  const [createDay, setCreateDay] = useState(0)
  const [createTime, setCreateTime] = useState('09:00')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showCopyDay, setShowCopyDay] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)

  const activeTemplate = templates.find(t => t.id === selectedTemplateId)

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId)
    router.push(`/coverage?template=${templateId}`)
  }

  const slotMap = useMemo(() => {
    const map: Record<number, Record<string, Slot>> = {}
    for (let d = 0; d < 7; d++) map[d] = {}
    for (const slot of initialSlots) map[slot.dayOfWeek][slot.startTime] = slot
    return map
  }, [initialSlots])

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
          max: daySlots.sort((a, b) => b.startTime.localeCompare(a.startTime))[0].endTime,
          count: daySlots.length,
          totalMin: Math.max(...daySlots.map(s => s.minWorkers)),
        }
      }
    }
    return ranges
  }, [initialSlots])

  const visibleTimes = useMemo(() => {
    const open = activeTemplate?.openingTime ?? '06:00'
    const close = activeTemplate?.closingTime ?? '00:00'
    const templateSlots = getSlotsInRange(open, close)
    if (initialSlots.length === 0) return templateSlots
    const existingTimes = new Set(initialSlots.map(s => s.startTime))
    const allVisible = new Set([...templateSlots, ...ALL_TIME_SLOTS_24H.filter(t => existingTimes.has(t))])
    return ALL_TIME_SLOTS_24H.filter(t => allVisible.has(t))
  }, [initialSlots, activeTemplate])

  const stats = {
    totalSlots: initialSlots.length,
    daysConfigured: new Set(initialSlots.map(s => s.dayOfWeek)).size,
    maxDemand: initialSlots.length > 0 ? Math.max(...initialSlots.map(s => s.minWorkers)) : 0,
    requiredSlots: initialSlots.filter(s => s.isRequired).length,
  }

  function openCreate(day: number, time: string) {
    setCreateDay(day); setCreateTime(time); setSlotModal('create')
  }

  function handleClearAll() {
    if (!confirm('¿Borrar todos los slots de esta plantilla? Esta acción no se puede deshacer.')) return
    startTransition(async () => {
      try {
        for (const slot of initialSlots) await deleteCoverageSlot(slot.id)
        toast.success('Todos los slots eliminados')
        router.refresh()
      } catch (e: any) { toast.error(e.message) }
    })
  }

  const hasSlots = initialSlots.length > 0

  return (
    <div className="flex h-[calc(100vh-52px)] overflow-hidden bg-[#F7F8FA]">

      {/* ── Sidebar plantillas ── */}
      <TemplateSidebar
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onSwitch={handleTemplateChange}
        onManage={() => setShowTemplateManager(true)}
      />

      {/* ── Panel derecho ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Necesidades de cobertura</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {hasSlots
                ? `${stats.totalSlots} slots · ${stats.daysConfigured}/7 días · demanda máx. ${stats.maxDemand} pers.`
                : 'Define cuántas personas necesitas en cada franja horaria'}
            </p>
          </div>
          {hasSlots && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openCreate(selectedDay ?? 0, '09:00')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors"
              >
                <Plus size={14} /> Añadir slot
              </button>
              <ActionsMenu
                onGenerate={() => setShowGenerate(true)}
                onCopyDay={() => setShowCopyDay(true)}
                onAddSlot={() => openCreate(selectedDay ?? 0, '09:00')}
                onClearAll={handleClearAll}
              />
            </div>
          )}
        </div>

        {hasSlots && (
          <div className="flex items-center gap-6 mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <span className="text-[22px] font-bold text-indigo-600">{stats.totalSlots}</span>
              <span className="text-[11px] text-gray-400">slots totales</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[22px] font-bold text-emerald-600">{stats.daysConfigured}/7</span>
              <span className="text-[11px] text-gray-400">días configurados</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[22px] font-bold text-amber-600">{stats.maxDemand}</span>
              <span className="text-[11px] text-gray-400">demanda máxima</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[22px] font-bold text-red-500">{stats.requiredSlots}</span>
              <span className="text-[11px] text-gray-400">slots obligatorios</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {/* Filtro días */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                <button onClick={() => setSelectedDay(null)} className={cn('px-3 py-1 rounded-lg text-[12px] font-semibold transition-colors', selectedDay === null ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>Todos</button>
                {DAYS_SHORT.map((d, i) => (
                  <button key={i} onClick={() => setSelectedDay(selectedDay === i ? null : i)}
                    className={cn('px-2 py-1 rounded-lg text-[12px] font-semibold transition-colors', selectedDay === i ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                    {d}
                  </button>
                ))}
              </div>
              {/* Vista */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                <button onClick={() => setViewMode('matrix')} className={cn('flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-semibold transition-colors', viewMode === 'matrix' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')}>
                  <LayoutGrid size={13} /> Matriz
                </button>
                <button onClick={() => setViewMode('list')} className={cn('flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-semibold transition-colors', viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')}>
                  <List size={13} /> Lista
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Contenido ── */}
      <div className="flex-1 overflow-auto" style={{ background: '#F7F8FA' }}>
        {!hasSlots ? (
          <EmptyState onLoadTemplate={() => setShowTemplates(true)} onGenerate={() => setShowGenerate(true)} />
        ) : viewMode === 'matrix' ? (
          <MatrixView slotMap={slotMap} visibleTimes={visibleTimes} selectedDay={selectedDay} onEditSlot={(slot: Slot) => setSlotModal(slot)} onAddSlot={openCreate} />
        ) : (
          <ListView slots={initialSlots} onEdit={(slot: Slot) => setSlotModal(slot)} onDelete={async (id: string) => {
            try { await deleteCoverageSlot(id); toast.success('Slot eliminado'); router.refresh() } catch (e: any) { toast.error(e.message) }
          }} />
        )}
      </div>

      </div>{/* fin panel derecho */}

      {/* ── Modales ── */}
      {showTemplateManager && (
        <TemplateManagerModal
          templates={templates}
          locationId={locationId}
          organizationId={organizationId}
          onClose={() => setShowTemplateManager(false)}
          onChanged={() => { setShowTemplateManager(false); router.refresh() }}
        />
      )}
      {showTemplates && (
        <TemplatesModal locationId={locationId} organizationId={organizationId} templateId={selectedTemplateId}
          onClose={() => setShowTemplates(false)} onLoaded={() => { setShowTemplates(false); router.refresh() }} />
      )}
      {showGenerate && (
        <GenerateSlotsModal locationId={locationId} organizationId={organizationId} templateId={selectedTemplateId}
          defaultOpenTime={activeTemplate?.openingTime ?? '09:00'} defaultCloseTime={activeTemplate?.closingTime ?? '23:00'}
          onClose={() => setShowGenerate(false)} onGenerated={() => { setShowGenerate(false); router.refresh() }} />
      )}
      {showCopyDay && (
        <CopyDayModal locationId={locationId} organizationId={organizationId} templateId={selectedTemplateId} dayRanges={dayRanges}
          onClose={() => setShowCopyDay(false)} onCopied={() => { setShowCopyDay(false); router.refresh() }} />
      )}
      {slotModal !== null && (
        <SlotModal
          slot={slotModal === 'create' ? null : slotModal}
          defaultDay={createDay} defaultTime={createTime}
          locationId={locationId} organizationId={organizationId} templateId={selectedTemplateId}
          roles={roles} skills={skills}
          onClose={() => setSlotModal(null)} onSaved={() => { setSlotModal(null); router.refresh() }}
        />
      )}
    </div>
  )
}
