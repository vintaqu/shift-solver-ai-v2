'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  X, Sparkles, Loader2, CheckCircle, AlertCircle,
  AlertTriangle, Info, Lock, Zap, RefreshCw,
  BarChart2, Clock, Users, TrendingUp, ChevronDown,
  ChevronUp, ArrowRight, Wifi, WifiOff
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateSchedule, checkSolverStatus, type GenerateResult } from '@/server/actions/generate'
import type { ScheduleResponse } from '@/lib/scheduler'

// ─── Tipos ────────────────────────────────────────────────────────────────

interface Props {
  planningPeriodId: string
  weekLabel: string
  hasExistingAssignments: boolean
  onClose: () => void
}

type Step = 'config' | 'loading' | 'result' | 'error'

const SEVERITY_CFG = {
  BLOCKING: { icon: <AlertCircle size={13} />, cls: 'bg-red-50 border-red-200 text-red-700', dot: 'bg-red-500' },
  ERROR:    { icon: <AlertCircle size={13} />, cls: 'bg-red-50 border-red-200 text-red-600', dot: 'bg-red-400' },
  WARNING:  { icon: <AlertTriangle size={13} />, cls: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-400' },
  INFO:     { icon: <Info size={13} />, cls: 'bg-blue-50 border-blue-200 text-blue-600', dot: 'bg-blue-400' },
}

// Mensajes de carga — el solver tarda ~15-90s
const LOADING_MSGS = [
  { t: 0,  msg: 'Conectando con el solver OR-Tools...' },
  { t: 3,  msg: 'Analizando empleados y contratos...' },
  { t: 8,  msg: 'Procesando restricciones horarias individuales...' },
  { t: 14, msg: 'Calculando demanda por slot (30 min)...' },
  { t: 20, msg: 'Aplicando jerarquía de roles...' },
  { t: 28, msg: 'Verificando etiquetas requeridas por franja...' },
  { t: 36, msg: 'Aplicando convenio hostelería Tarragona...' },
  { t: 45, msg: 'Optimizando distribución de jornadas...' },
  { t: 55, msg: 'Maximizando jornadas continuas...' },
  { t: 65, msg: 'Equilibrando partidas entre trabajadores...' },
  { t: 75, msg: 'Verificando descansos de 12h entre jornadas...' },
  { t: 85, msg: 'Finalizando y validando el cuadrante...' },
]

// ═══════════════════════════════════════════════════════════════════════════
export function GenerateModal({ planningPeriodId, weekLabel, hasExistingAssignments, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<Step>('config')
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [solverOk, setSolverOk] = useState<boolean | null>(null)
  const [solverVersion, setSolverVersion] = useState<string>()
  const [elapsedMs, setElapsedMs] = useState(0)
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MSGS[0].msg)
  const [showIssues, setShowIssues] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  // Opciones
  const [keepLocked, setKeepLocked] = useState(true)
  const [onlyGaps, setOnlyGaps] = useState(false)
  const [seed, setSeed] = useState<number | undefined>()
  const [useSeed, setUseSeed] = useState(false)

  // Health check al abrir
  useEffect(() => {
    checkSolverStatus().then(({ ok, version }) => {
      setSolverOk(ok)
      setSolverVersion(version)
    })
  }, [])

  // Temporizador durante la carga
  useEffect(() => {
    if (step !== 'loading') return
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000
      setElapsedMs(elapsed)
      // Actualizar mensaje
      const msgs = [...LOADING_MSGS].reverse()
      const current = msgs.find(m => elapsed >= m.t)
      if (current) setLoadingMsg(current.msg)
    }, 500)
    return () => clearInterval(interval)
  }, [step])

  function handleGenerate() {
    setStep('loading')
    setElapsedMs(0)
    setLoadingMsg(LOADING_MSGS[0].msg)

    startTransition(async () => {
      const res = await generateSchedule(planningPeriodId, {
        seed: useSeed ? seed : undefined,
        keepLocked,
        onlyGaps,
      })
      setResult(res)
      setStep(res.success ? 'result' : 'error')
    })
  }

  function handleOpenPlanner() {
    onClose()
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[520px] flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#eef2ff 0%,#f5f3ff 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Generar cuadrante con IA</h2>
              <p className="text-[12px] text-indigo-500 font-medium">{weekLabel} · OR-Tools CP-SAT</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* ── STEP: Config ── */}
        {step === 'config' && (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

            {/* Estado del solver */}
            <div className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl border text-[12px] font-medium',
              solverOk === null ? 'bg-gray-50 border-gray-200 text-gray-500' :
              solverOk ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
              'bg-red-50 border-red-200 text-red-700'
            )}>
              {solverOk === null ? <Loader2 size={14} className="animate-spin" /> :
               solverOk ? <Wifi size={14} /> : <WifiOff size={14} />}
              <div className="flex-1">
                {solverOk === null ? 'Verificando solver...' :
                 solverOk ? `Solver disponible${solverVersion ? ` · v${solverVersion}` : ''}` :
                 'Solver no disponible — comprueba la API'}
              </div>
              {solverOk && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600 font-semibold">
                  ONLINE
                </span>
              )}
            </div>

            {/* Opciones */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Opciones de generación</div>

              {/* Mantener bloqueados */}
              {hasExistingAssignments && (
                <Toggle
                  icon={<Lock size={14} className="text-amber-500" />}
                  label="Mantener turnos bloqueados"
                  desc="Los turnos con 🔒 no serán tocados por el solver"
                  value={keepLocked}
                  onChange={setKeepLocked}
                  accentColor="amber"
                />
              )}

              {/* Solo huecos */}
              {hasExistingAssignments && (
                <Toggle
                  icon={<Zap size={14} className="text-blue-500" />}
                  label="Solo cubrir huecos vacíos"
                  desc="Respeta todos los turnos existentes y solo genera los que faltan"
                  value={onlyGaps}
                  onChange={setOnlyGaps}
                  accentColor="blue"
                />
              )}

              {/* Seed */}
              <div className={cn(
                'rounded-xl border p-3 transition-all',
                useSeed ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white'
              )}>
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setUseSeed(!useSeed)}>
                  <div className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0', useSeed ? 'bg-violet-600' : 'bg-gray-200')}>
                    <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', useSeed ? 'left-5' : 'left-0.5')} />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-gray-700">Rotación alternativa (seed)</div>
                    <div className="text-[11px] text-gray-400">Genera una solución igualmente óptima pero con distinta distribución</div>
                  </div>
                </div>
                {useSeed && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      value={seed ?? ''}
                      onChange={e => setSeed(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Ej: 42"
                      className="w-24 border border-violet-300 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                    />
                    <button
                      onClick={() => setSeed(Math.floor(Math.random() * 9999) + 1)}
                      className="text-[11px] text-violet-600 hover:underline"
                    >
                      Aleatorio
                    </button>
                    <span className="text-[11px] text-gray-400">Seed actual: {seed ?? 'ninguno'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Info proceso */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1.5">
              <div className="text-[11px] font-bold text-blue-700">¿Qué va a hacer el solver?</div>
              {[
                '✓ Cubrir la demanda exacta por slot de 30 min',
                '✓ Respetar roles jerárquicos (Camarero → Semi → Encargado → Dueño)',
                '✓ Verificar etiquetas requeridas por franja',
                '✓ Aplicar convenio hostelería Tarragona (12h descanso, 2 días seguidos, ≤9h/día)',
                '✓ Respetar restricciones individuales de cada empleado',
                '✓ Maximizar jornadas continuas y repartir partidas',
              ].map(t => (
                <div key={t} className="text-[11px] text-blue-700">{t}</div>
              ))}
              <div className="text-[10px] text-blue-400 mt-1">⏱ Tiempo estimado: 15-90 segundos</div>
            </div>
          </div>
        )}

        {/* ── STEP: Loading ── */}
        {step === 'loading' && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-6 text-center">
            {/* Spinner animado */}
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-indigo-100 flex items-center justify-center">
                <Sparkles size={32} className="text-indigo-600" />
              </div>
              <div className="absolute -inset-2">
                <div className="w-24 h-24 rounded-2xl border-[3px] border-indigo-200 border-t-indigo-600 animate-spin" />
              </div>
            </div>

            <div>
              <h3 className="text-[16px] font-bold text-gray-900">Generando cuadrante...</h3>
              <p className="text-[13px] text-indigo-500 mt-1 transition-all min-h-[20px]">{loadingMsg}</p>
            </div>

            {/* Barra de progreso indeterminada */}
            <div className="w-full max-w-[280px] h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                style={{
                  width: `${Math.min(95, (elapsedMs / 90) * 100)}%`,
                  transition: 'width 0.5s ease-out',
                }}
              />
            </div>

            <div className="text-[12px] text-gray-400">
              {elapsedMs.toFixed(0)}s transcurridos · OR-Tools CP-SAT en Railway
            </div>
          </div>
        )}

        {/* ── STEP: Result ── */}
        {step === 'result' && result && (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            {/* Header resultado */}
            <div className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl border',
              result.estado === 'OPTIMAL' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
            )}>
              {result.estado === 'OPTIMAL'
                ? <CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />
                : <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />}
              <div>
                <div className={cn('text-[14px] font-bold', result.estado === 'OPTIMAL' ? 'text-emerald-800' : 'text-amber-800')}>
                  {result.estado === 'OPTIMAL' ? '¡Cuadrante ÓPTIMO generado!' : 'Cuadrante FACTIBLE generado (no óptimo)'}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {result.tiempo_calculo?.toFixed(1)}s · {result.total_continuadas} continuas · {result.total_partidas} partidas
                </div>
              </div>
            </div>

            {/* Métricas principales */}
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: 'Cobertura',
                  value: `${result.cobertura_pct}%`,
                  sub: `${result.slots_asignados}/${result.slots_demanda} slots`,
                  color: (result.cobertura_pct ?? 0) >= 98 ? 'text-emerald-600' : (result.cobertura_pct ?? 0) >= 90 ? 'text-amber-600' : 'text-red-600',
                  bg: (result.cobertura_pct ?? 0) >= 98 ? 'bg-emerald-50' : (result.cobertura_pct ?? 0) >= 90 ? 'bg-amber-50' : 'bg-red-50',
                  icon: <BarChart2 size={16} />,
                },
                {
                  label: 'Horas asignadas',
                  value: `${result.horas_asignadas?.toFixed(1)}h`,
                  sub: 'en la semana',
                  color: 'text-indigo-600',
                  bg: 'bg-indigo-50',
                  icon: <Clock size={16} />,
                },
                {
                  label: 'Turnos continuos',
                  value: result.total_continuadas?.toString() ?? '—',
                  sub: `${result.total_partidas} partidos`,
                  color: 'text-blue-600',
                  bg: 'bg-blue-50',
                  icon: <TrendingUp size={16} />,
                },
                {
                  label: 'Huecos sin cubrir',
                  value: result.slots_huecos?.toString() ?? '0',
                  sub: 'slots-persona',
                  color: (result.slots_huecos ?? 0) === 0 ? 'text-emerald-600' : 'text-red-600',
                  bg: (result.slots_huecos ?? 0) === 0 ? 'bg-emerald-50' : 'bg-red-50',
                  icon: <Users size={16} />,
                },
              ].map(m => (
                <div key={m.label} className={cn('rounded-xl p-3 flex items-center gap-2.5', m.bg)}>
                  <div className={m.color}>{m.icon}</div>
                  <div>
                    <div className={cn('text-[18px] font-bold', m.color)}>{m.value}</div>
                    <div className="text-[10px] text-gray-500">{m.label}</div>
                    <div className="text-[10px] text-gray-400">{m.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Issues */}
            {(result.issuesCount ?? 0) > 0 && (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setShowIssues(!showIssues)}
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className={result.blockingCount ? 'text-red-500' : 'text-amber-500'} />
                    <span className="text-[13px] font-semibold text-gray-700">
                      {result.issuesCount} aviso{(result.issuesCount ?? 0) > 1 ? 's' : ''}
                    </span>
                    <div className="flex gap-1">
                      {(result.blockingCount ?? 0) > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                          {result.blockingCount} crítico{(result.blockingCount ?? 0) > 1 ? 's' : ''}
                        </span>
                      )}
                      {(result.warningCount ?? 0) > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          {result.warningCount} aviso{(result.warningCount ?? 0) > 1 ? 's' : ''}
                        </span>
                      )}
                      {(result.infoCount ?? 0) > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {result.infoCount} info
                        </span>
                      )}
                    </div>
                  </div>
                  {showIssues ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </button>

                {showIssues && result.solverResponse && (
                  <div className="border-t border-gray-100 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    <IssueList response={result.solverResponse} />
                  </div>
                )}
              </div>
            )}

            {/* Sin issues */}
            {(result.issuesCount ?? 0) === 0 && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-700">
                <CheckCircle size={14} />
                Sin alertas — el cuadrante cumple todas las restricciones legales e individuales
              </div>
            )}
          </div>
        )}

        {/* ── STEP: Error ── */}
        {step === 'error' && result && (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-[14px] font-bold text-red-800">No se pudo generar el cuadrante</div>
                <div className="text-[12px] text-red-600 mt-1">{result.error}</div>
                {result.errorCode && (
                  <div className="text-[10px] text-red-400 mt-1 font-mono">Código: {result.errorCode}</div>
                )}
              </div>
            </div>

            {/* Diagnóstico del solver si INFEASIBLE */}
            {result.solverResponse?.diagnostico && (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="text-[12px] font-bold text-gray-700">Diagnóstico del solver</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    Capacidad: {result.solverResponse.diagnostico.capacidad_total_h}h ·
                    Demanda: {result.solverResponse.diagnostico.demanda_total_h}h ·
                    Déficit: {result.solverResponse.diagnostico.deficit_h}h
                  </div>
                </div>
                <div className="divide-y divide-gray-100 max-h-52 overflow-y-auto">
                  {result.solverResponse.diagnostico.propuestas.map((p, i) => {
                    const sv = { critica: 'BLOCKING', alta: 'ERROR', media: 'WARNING', baja: 'INFO' }[p.severidad] as keyof typeof SEVERITY_CFG
                    const cfg = SEVERITY_CFG[sv] ?? SEVERITY_CFG.INFO
                    return (
                      <div key={i} className={cn('flex items-start gap-2 px-4 py-3 border text-[11px]', cfg.cls)}>
                        <span className="flex-shrink-0 mt-0.5">{cfg.icon}</span>
                        <div>
                          <div className="font-semibold">{p.titulo}</div>
                          <div className="opacity-80 mt-0.5">{p.mensaje}</div>
                          <div className="mt-1 font-medium">→ {p.accion_sugerida}</div>
                          {(p.afecta_trabajador || p.afecta_dia) && (
                            <div className="text-[10px] opacity-60 mt-0.5">
                              {p.afecta_trabajador && `Empleado: ${p.afecta_trabajador}`}
                              {p.afecta_dia && ` · Día: ${p.afecta_dia}`}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="text-[12px] text-gray-500 bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-1">
              <div className="font-semibold text-gray-700">Posibles causas:</div>
              <div>• No hay suficientes empleados para cubrir la demanda configurada</div>
              <div>• Las restricciones individuales son demasiado restrictivas</div>
              <div>• Las horas contratadas no alcanzan para cubrir todos los slots</div>
              <div className="pt-1 text-indigo-600 font-medium">→ Revisa la configuración de empleados, contratos y cobertura</div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">
            {step === 'result' ? 'Cerrar' : 'Cancelar'}
          </button>

          <div className="flex items-center gap-2">
            {step === 'config' && (
              <button
                disabled={isPending || solverOk === false}
                onClick={handleGenerate}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Sparkles size={14} /> Generar cuadrante
              </button>
            )}

            {step === 'loading' && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-100 text-indigo-600 text-[12px] font-medium">
                <Loader2 size={13} className="animate-spin" /> Procesando...
              </div>
            )}

            {step === 'result' && (
              <>
                <button
                  onClick={() => { setStep('config'); setResult(null) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw size={12} /> Regenerar
                </button>
                <button
                  onClick={handleOpenPlanner}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Ver cuadrante <ArrowRight size={14} />
                </button>
              </>
            )}

            {step === 'error' && (
              <button
                onClick={() => { setStep('config'); setResult(null) }}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors"
              >
                <RefreshCw size={14} /> Intentar de nuevo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Toggle reutilizable ───────────────────────────────────────────────────
function Toggle({ icon, label, desc, value, onChange, accentColor = 'indigo' }: {
  icon: React.ReactNode; label: string; desc: string
  value: boolean; onChange: (v: boolean) => void; accentColor?: string
}) {
  const colorMap: Record<string, { bg: string; border: string; toggle: string }> = {
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-300', toggle: 'bg-indigo-600' },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-300',  toggle: 'bg-amber-500' },
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-300',   toggle: 'bg-blue-600' },
  }
  const c = colorMap[accentColor] ?? colorMap.indigo

  return (
    <div
      className={cn('flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all', value ? `${c.bg} ${c.border}` : 'border-gray-200 bg-white hover:border-gray-300')}
      onClick={() => onChange(!value)}
    >
      <div className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0 mt-0.5', value ? c.toggle : 'bg-gray-200')}>
        <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', value ? 'left-5' : 'left-0.5')} />
      </div>
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0 mt-0.5">{icon}</span>
        <div>
          <div className="text-[13px] font-medium text-gray-700">{label}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{desc}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Lista de issues del solver ────────────────────────────────────────────
function IssueList({ response }: { response: ScheduleResponse }) {
  const items = [
    ...response.huecos_cobertura.map(h => ({
      sev: 'ERROR' as const,
      msg: `${h.dia} ${h.inicio}–${h.fin}: faltan ${h.falta_personas} persona(s)`,
      hint: `Cubierto ${h.cubierto}/${h.demanda_total}`,
    })),
    ...response.huecos_etiqueta.map(h => ({
      sev: 'WARNING' as const,
      msg: `${h.dia} ${h.inicio}–${h.fin}: sin [${h.etiquetas_requeridas.join(', ')}]`,
      hint: `Asignados: ${h.asignados.join(', ')}`,
    })),
    ...response.gaps_entre_jornadas
      .filter(g => g.gap_horas != null && g.gap_horas < 12)
      .map(g => ({
        sev: 'BLOCKING' as const,
        msg: `${g.trabajador}: ${g.gap_horas?.toFixed(1)}h descanso en ${g.cruce} (<12h)`,
        hint: 'Ajusta manualmente',
      })),
    ...response.pausas_obligatorias.map(p => ({
      sev: 'INFO' as const,
      msg: `${p.trabajador} el ${p.dia}: pausa 20min obligatoria`,
      hint: `${p.inicio}–${p.fin} (${p.duracion_horas}h continuo)`,
    })),
  ]

  return (
    <>
      {items.map((item, i) => {
        const cfg = SEVERITY_CFG[item.sev]
        return (
          <div key={i} className={cn('flex items-start gap-2 px-4 py-2.5 text-[11px] border-l-2', cfg.cls, { 'border-l-red-500': item.sev === 'BLOCKING' || item.sev === 'ERROR', 'border-l-amber-400': item.sev === 'WARNING', 'border-l-blue-400': item.sev === 'INFO' })}>
            <span className="flex-shrink-0 mt-0.5">{cfg.icon}</span>
            <div>
              <div className="font-medium">{item.msg}</div>
              <div className="opacity-70 mt-0.5">{item.hint}</div>
            </div>
          </div>
        )
      })}
    </>
  )
}
