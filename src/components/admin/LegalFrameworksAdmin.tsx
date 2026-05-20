'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Shield, Plus, Pencil, ToggleLeft, ToggleRight,
  X, Loader2, CheckCircle, AlertCircle, ChevronDown,
  ChevronUp, Scale, BookOpen, Globe, MapPin
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { upsertLegalFramework, toggleLegalFramework } from '@/server/actions/legalFrameworks'
import type { LegalRules } from '@/lib/legalFrameworks'

const SCOPE_CFG: Record<string, { label: string; color: string }> = {
  NACIONAL:    { label: 'Nacional',     color: '#6366f1' },
  AUTONOMICO:  { label: 'Autonómico',   color: '#0891b2' },
  PROVINCIAL:  { label: 'Provincial',   color: '#10b981' },
  EMPRESA:     { label: 'De empresa',   color: '#f59e0b' },
}

const RULE_GROUPS = [
  {
    label: 'Jornada diaria',
    icon: '📅',
    fields: [
      { key: 'maxDailyHours',       label: 'Máx horas/día',           unit: 'h',   ref: 'Art. 34.3 ET' },
      { key: 'maxDailyHoursYoung',  label: 'Máx horas/día (<18 años)',unit: 'h',   ref: 'Art. 34.3 ET' },
      { key: 'maxConsecutiveDays',  label: 'Máx días consecutivos',   unit: 'días', ref: 'Art. 37 ET' },
    ],
  },
  {
    label: 'Descansos',
    icon: '🛌',
    fields: [
      { key: 'minRestBetweenShifts', label: 'Descanso mínimo entre jornadas', unit: 'h',    ref: 'Art. 34.3 ET' },
      { key: 'minWeeklyRestDays',    label: 'Días descanso semanal',           unit: 'días', ref: 'Art. 37.1 ET' },
      { key: 'minWeeklyRestHours',   label: 'Horas descanso semanal',          unit: 'h',    ref: 'Art. 37.1 ET' },
    ],
  },
  {
    label: 'Pausas',
    icon: '☕',
    fields: [
      { key: 'breakRequiredAfterHours', label: 'Pausa obligatoria tras', unit: 'h', ref: 'Art. 34.4 ET' },
      { key: 'breakMinutes',            label: 'Duración de la pausa',   unit: 'min', ref: 'Art. 34.4 ET' },
    ],
    toggles: [
      { key: 'breakCountsAsWork', label: 'La pausa computa como tiempo trabajado' },
    ],
  },
  {
    label: 'Jornada semanal y anual',
    icon: '📊',
    fields: [
      { key: 'maxWeeklyHours',    label: 'Máx horas semanales ordinarias', unit: 'h', ref: 'Art. 34.1 ET' },
      { key: 'maxAnnualHours',    label: 'Máx horas anuales ordinarias',   unit: 'h', ref: 'Art. 34.1 ET' },
      { key: 'maxOvertimeAnnual', label: 'Máx horas extra anuales',        unit: 'h', ref: 'Art. 35.2 ET' },
    ],
    toggles: [
      { key: 'overtimeVoluntary', label: 'Horas extra son voluntarias (salvo fuerza mayor)' },
    ],
  },
  {
    label: 'Nocturnidad',
    icon: '🌙',
    fields: [
      { key: 'nightStart',           label: 'Inicio tramo nocturno',           unit: 'HH:MM', ref: 'Art. 36.1 ET' },
      { key: 'nightEnd',             label: 'Fin tramo nocturno',              unit: 'HH:MM', ref: 'Art. 36.1 ET' },
      { key: 'nightWorkerMaxHours',  label: 'Máx horas/día trabajador nocturno', unit: 'h',   ref: 'Art. 36.1 ET' },
    ],
  },
  {
    label: 'Vacaciones',
    icon: '🏖️',
    fields: [
      { key: 'vacationDaysMin', label: 'Días mínimos de vacaciones/año', unit: 'días', ref: 'Art. 38.1 ET' },
    ],
    selects: [
      { key: 'vacationDaysType', label: 'Tipo de días', options: [{ v: 'NATURALES', l: 'Naturales' }, { v: 'LABORABLES', l: 'Laborables' }] },
    ],
    toggles: [],
  },
  {
    label: 'Jornada partida',
    icon: '✂️',
    toggles: [
      { key: 'splitShiftAllowed', label: 'Se permite jornada partida' },
      { key: 'consecutiveRestDays', label: 'Los días de descanso deben ser consecutivos' },
    ],
    fields: [
      { key: 'splitShiftMinBlock',  label: 'Mínimo horas por tramo', unit: 'h', ref: '' },
      { key: 'splitShiftMaxBlock',  label: 'Máximo horas por tramo', unit: 'h', ref: '' },
      { key: 'splitShiftMinRest',   label: 'Descanso mínimo entre tramos', unit: 'h', ref: '' },
      { key: 'splitShiftMaxTotal',  label: 'Máximo horas totales jornada partida', unit: 'h', ref: '' },
    ],
  },
]

function inputCls() {
  return 'w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300'
}
function Field({ label, hint, children }: any) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      {hint && <p className="text-[10px] text-gray-400 mb-1">{hint}</p>}
      {children}
    </div>
  )
}

export function LegalFrameworksAdmin({ frameworks }: { frameworks: any[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editModal, setEditModal] = useState<any | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(true)

  const visibleFrameworks = showInactive ? frameworks : frameworks.filter(f => f.isActive)
  const inactiveCount = frameworks.filter(f => !f.isActive).length

  return (
    <div className="min-h-full" style={{ background: '#f5f6fa' }}>
      <div className="max-w-[1100px] mx-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Scale size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Biblioteca de marcos legales</h1>
              <p className="text-sm text-gray-500">Solo accesible por Super Admin · {frameworks.length} marcos configurados</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {inactiveCount > 0 && (
              <button
                onClick={() => setShowInactive(!showInactive)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium border transition-colors',
                  showInactive
                    ? 'bg-gray-100 border-gray-200 text-gray-600'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                )}
              >
                <ToggleRight size={14} />
                {showInactive ? `Ocultar inactivos (${inactiveCount})` : `Mostrar inactivos (${inactiveCount})`}
              </button>
            )}
            <button
              onClick={() => setEditModal({ isNew: true })}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors"
            >
              <Plus size={15} /> Nuevo marco
            </button>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-[12px] text-indigo-800">
          <div className="font-bold mb-1 flex items-center gap-2"><BookOpen size={14} /> ¿Qué son los marcos legales?</div>
          <p>Cada marco define los parámetros de un convenio colectivo o del Estatuto de los Trabajadores. Los owners y managers los asignan a cada empleado. El motor de validación los usa para detectar incumplimientos automáticamente.</p>
        </div>

        {/* Lista de marcos */}
        <div className="space-y-3">
          {visibleFrameworks.map(f => {
            const scopeCfg = SCOPE_CFG[f.scope] ?? SCOPE_CFG.NACIONAL
            const isExpanded = expandedId === f.id
            const rules = f.rules as LegalRules

            return (
              <div key={f.id} className={cn('bg-white rounded-2xl border shadow-sm overflow-hidden transition-all', f.isActive ? 'border-gray-200' : 'border-gray-200 opacity-60')}>

                {/* Cabecera */}
                <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : f.id)}>

                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-[20px]"
                    style={{ backgroundColor: scopeCfg.color + '15' }}>
                    <Scale size={18} style={{ color: scopeCfg.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-bold text-gray-800">{f.name}</span>
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{f.code}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: scopeCfg.color }}>
                        {scopeCfg.label}
                      </span>
                      {f.sector && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">{f.sector}</span>}
                      {f.province && <span className="text-[10px] text-gray-500 flex items-center gap-0.5"><MapPin size={9} />{f.province}</span>}
                    </div>
                    {f.description && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{f.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                      <span>📋 {f._count?.organizations ?? 0} organizaciones</span>
                      <span>👤 {f._count?.employees ?? 0} empleados directos</span>
                      <span>⚖️ Máx {(rules as any).maxAnnualHours}h/año · {(rules as any).minRestBetweenShifts}h descanso · {(rules as any).vacationDaysMin}d vacaciones</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); setEditModal({ ...f, isNew: false }) }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); startTransition(async () => {
                        await toggleLegalFramework(f.id)
                        toast.success(f.isActive ? 'Marco desactivado' : 'Marco activado')
                        router.refresh()
                      })}}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                      {f.isActive
                        ? <ToggleRight size={16} className="text-emerald-500" />
                        : <ToggleLeft size={16} className="text-gray-300" />}
                    </button>
                    {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                </div>

                {/* Detalle expandido */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { label: 'Máx horas/día', value: `${rules.maxDailyHours}h`, ref: 'Art. 34.3 ET' },
                        { label: 'Descanso entre jornadas', value: `${rules.minRestBetweenShifts}h`, ref: 'Art. 34.3 ET' },
                        { label: 'Días descanso semanal', value: `${rules.minWeeklyRestDays}d ${rules.consecutiveRestDays ? '(consecutivos)' : ''}`, ref: 'Art. 37.1 ET' },
                        { label: 'Pausa obligatoria', value: `${rules.breakMinutes}min tras ${rules.breakRequiredAfterHours}h`, ref: 'Art. 34.4 ET' },
                        { label: 'Horas semanales', value: `${rules.maxWeeklyHours}h/sem`, ref: 'Art. 34.1 ET' },
                        { label: 'Horas anuales', value: `${rules.maxAnnualHours}h/año`, ref: 'Art. 34.1 ET' },
                        { label: 'Horas extra máx', value: `${rules.maxOvertimeAnnual}h/año`, ref: 'Art. 35.2 ET' },
                        { label: 'Vacaciones', value: `${rules.vacationDaysMin}d ${rules.vacationDaysType.toLowerCase()}`, ref: 'Art. 38.1 ET' },
                        { label: 'Nocturnidad', value: `${rules.nightStart}–${rules.nightEnd}`, ref: 'Art. 36.1 ET' },
                        { label: 'Jornada partida', value: rules.splitShiftAllowed ? `Sí (${rules.splitShiftMinBlock}–${rules.splitShiftMaxBlock}h/tramo)` : 'No', ref: '' },
                        { label: 'Pausa computa', value: rules.breakCountsAsWork ? 'Sí, como trabajo' : 'No', ref: '' },
                        { label: 'Máx días seguidos', value: `${rules.maxConsecutiveDays} días`, ref: '' },
                      ].map(item => (
                        <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-3">
                          <div className="text-[10px] text-gray-400 mb-0.5">{item.label}</div>
                          <div className="text-[13px] font-bold text-gray-800">{item.value}</div>
                          {item.ref && <div className="text-[9px] text-indigo-400 mt-0.5">{item.ref}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal editar/crear */}
      {editModal !== null && (
        <FrameworkEditModal
          framework={editModal.isNew ? null : editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); router.refresh() }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL EDITAR MARCO LEGAL
// ═══════════════════════════════════════════════════════════════════════════
function FrameworkEditModal({ framework, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [activeGroup, setActiveGroup] = useState(0)

  const defaultRules: LegalRules = framework?.rules ?? {
    maxDailyHours: 9, maxDailyHoursYoung: 8, maxConsecutiveDays: 6,
    minRestBetweenShifts: 12, minWeeklyRestDays: 2, minWeeklyRestHours: 36, consecutiveRestDays: true,
    breakRequiredAfterHours: 6, breakMinutes: 15, breakCountsAsWork: false,
    maxWeeklyHours: 40, maxAnnualHours: 1826, maxOvertimeAnnual: 80, overtimeVoluntary: true,
    nightStart: '22:00', nightEnd: '06:00', nightWorkerMaxHours: 8,
    vacationDaysMin: 30, vacationDaysType: 'NATURALES',
    splitShiftAllowed: false, splitShiftMinBlock: 3, splitShiftMaxBlock: 5,
    splitShiftMinRest: 1.5, splitShiftMaxTotal: 9,
    references: {},
  }

  const [meta, setMeta] = useState({
    code: framework?.code ?? '',
    name: framework?.name ?? '',
    description: framework?.description ?? '',
    scope: framework?.scope ?? 'NACIONAL',
    sector: framework?.sector ?? '',
    province: framework?.province ?? '',
  })
  const [rules, setRules] = useState<LegalRules>(defaultRules)

  function setRule(key: string, value: any) {
    setRules(r => ({ ...r, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[760px] flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">
              {framework ? `Editar: ${framework.name}` : 'Nuevo marco legal'}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Solo el Super Admin puede crear o modificar marcos legales</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar grupos */}
          <div className="w-44 flex-shrink-0 border-r border-gray-100 py-3 overflow-y-auto bg-gray-50">
            <button onClick={() => setActiveGroup(-1)}
              className={cn('w-full text-left px-4 py-2 text-[12px] font-semibold transition-colors',
                activeGroup === -1 ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-100')}>
              📋 Datos generales
            </button>
            {RULE_GROUPS.map((g, i) => (
              <button key={i} onClick={() => setActiveGroup(i)}
                className={cn('w-full text-left px-4 py-2 text-[12px] font-semibold transition-colors',
                  activeGroup === i ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-100')}>
                {g.icon} {g.label}
              </button>
            ))}
          </div>

          {/* Contenido */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Datos generales */}
            {activeGroup === -1 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Código único *" hint="Ej: ET, HOSTELERIA_TARRAGONA">
                    <input className={inputCls()} value={meta.code}
                      onChange={e => setMeta(m => ({ ...m, code: e.target.value.toUpperCase().replace(/\s/g, '_') }))} />
                  </Field>
                  <Field label="Ámbito">
                    <select className={inputCls()} value={meta.scope} onChange={e => setMeta(m => ({ ...m, scope: e.target.value }))}>
                      {Object.entries(SCOPE_CFG).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Nombre completo *">
                  <input className={inputCls()} value={meta.name} onChange={e => setMeta(m => ({ ...m, name: e.target.value }))} placeholder="Ej: Conv. Hostelería Tarragona" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sector" hint="Ej: HOSTELERIA, COMERCIO">
                    <input className={inputCls()} value={meta.sector} onChange={e => setMeta(m => ({ ...m, sector: e.target.value.toUpperCase() }))} placeholder="HOSTELERIA" />
                  </Field>
                  <Field label="Provincia" hint="Solo para convenios provinciales">
                    <input className={inputCls()} value={meta.province} onChange={e => setMeta(m => ({ ...m, province: e.target.value }))} placeholder="Tarragona" />
                  </Field>
                </div>
                <Field label="Descripción">
                  <textarea className={inputCls() + ' resize-none h-20'} value={meta.description}
                    onChange={e => setMeta(m => ({ ...m, description: e.target.value }))} />
                </Field>
              </>
            )}

            {/* Grupos de reglas */}
            {activeGroup >= 0 && (() => {
              const group = RULE_GROUPS[activeGroup]
              return (
                <div className="space-y-4">
                  <h3 className="text-[13px] font-bold text-gray-700">{group.icon} {group.label}</h3>

                  {/* Toggles */}
                  {group.toggles?.map(toggle => (
                    <div key={toggle.key}
                      className={cn('flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                        (rules as any)[toggle.key] ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200')}
                      onClick={() => setRule(toggle.key, !(rules as any)[toggle.key])}>
                      <div className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0', (rules as any)[toggle.key] ? 'bg-indigo-600' : 'bg-gray-200')}>
                        <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', (rules as any)[toggle.key] ? 'left-5' : 'left-0.5')} />
                      </div>
                      <span className="text-[13px] font-medium text-gray-700">{toggle.label}</span>
                    </div>
                  ))}

                  {/* Selects */}
                  {(group as any).selects?.map((sel: any) => (
                    <Field key={sel.key} label={sel.label}>
                      <select className={inputCls()} value={(rules as any)[sel.key]}
                        onChange={e => setRule(sel.key, e.target.value)}>
                        {sel.options.map((o: any) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </Field>
                  ))}

                  {/* Campos numéricos/texto */}
                  <div className="grid grid-cols-2 gap-3">
                    {group.fields.map(field => (
                      <Field key={field.key} label={field.label} hint={field.ref}>
                        <div className="flex items-center gap-2">
                          <input
                            type={field.unit === 'HH:MM' ? 'time' : 'number'}
                            step={field.unit === 'h' ? '0.5' : '1'}
                            min={0}
                            className={inputCls()}
                            value={(rules as any)[field.key] ?? ''}
                            onChange={e => setRule(field.key, field.unit === 'HH:MM' ? e.target.value : parseFloat(e.target.value))}
                          />
                          {field.unit !== 'HH:MM' && (
                            <span className="text-[11px] text-gray-400 whitespace-nowrap">{field.unit}</span>
                          )}
                        </div>
                      </Field>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button
            disabled={isPending || !meta.name || !meta.code}
            onClick={() => startTransition(async () => {
              try {
                await upsertLegalFramework({
                  id: framework?.id,
                  ...meta,
                  sector: meta.sector || null,
                  province: meta.province || null,
                  rules,
                })
                toast.success(framework ? 'Marco actualizado ✓' : 'Marco creado ✓')
                onSaved()
              } catch (e: any) { toast.error(e.message) }
            })}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {framework ? 'Guardar cambios' : 'Crear marco'}
          </button>
        </div>
      </div>
    </div>
  )
}
