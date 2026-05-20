'use client'

// ============================================================
// GenerateScheduleModal
// components/planning/GenerateScheduleModal.tsx
// ============================================================

import { useState, useTransition } from 'react'
import { format, addWeeks } from 'date-fns'
import { es } from 'date-fns/locale'
import { Sparkles, X, AlertCircle, CheckCircle, Loader2, Lock, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GenerateScheduleModalProps {
  weekStart: Date
  onClose: () => void
  onGenerate: (weekStart: Date) => Promise<void>
}

type GenerateStep = 'config' | 'loading' | 'result'

export function GenerateScheduleModal({
  weekStart,
  onClose,
  onGenerate,
}: GenerateScheduleModalProps) {
  const [step, setStep] = useState<GenerateStep>('config')
  const [selectedWeek, setSelectedWeek] = useState(weekStart)
  const [keepLocked, setKeepLocked] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [loadingMsg, setLoadingMsg] = useState('')

  const LOADING_MESSAGES = [
    'Analizando empleados y contratos...',
    'Procesando restricciones horarias...',
    'Calculando cobertura por slot...',
    'Aplicando convenio hostelería Tarragona...',
    'Optimizando distribución de turnos...',
    'Equilibrando horas entre trabajadores...',
    'Validando resultado...',
  ]

  const handleGenerate = () => {
    setStep('loading')
    let msgIndex = 0

    const interval = setInterval(() => {
      setLoadingMsg(LOADING_MESSAGES[msgIndex % LOADING_MESSAGES.length])
      msgIndex++
    }, 1200)

    startTransition(async () => {
      try {
        await onGenerate(selectedWeek)
        clearInterval(interval)
        setStep('result')
      } catch {
        clearInterval(interval)
        setStep('config')
      }
    })
  }

  const weekOptions = Array.from({ length: 4 }, (_, i) => addWeeks(weekStart, i))

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-violet-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-gray-800">Generar cuadrante automático</h2>
              <p className="text-[11px] text-gray-500">Powered by OR-Tools</p>
            </div>
          </div>
          <button
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white/80 transition-colors"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        {/* Config step */}
        {step === 'config' && (
          <div className="px-5 py-5 space-y-5">
            {/* Week selector */}
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-2 block">
                Semana a generar
              </label>
              <div className="space-y-1.5">
                {weekOptions.map((w) => (
                  <button
                    key={w.toISOString()}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-[13px] transition-colors',
                      selectedWeek.toISOString() === w.toISOString()
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                    )}
                    onClick={() => setSelectedWeek(w)}
                  >
                    <span className="font-medium">
                      {format(w, "'Semana del' d 'de' MMMM", { locale: es })}
                    </span>
                    {selectedWeek.toISOString() === w.toISOString() && (
                      <CheckCircle size={14} className="text-indigo-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="space-y-2.5">
              <label className="text-[11px] font-medium text-gray-500 block">Opciones</label>

              <label className="flex items-start gap-3 cursor-pointer">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={keepLocked}
                    onChange={(e) => setKeepLocked(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={cn(
                    'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                    keepLocked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300',
                  )}>
                    {keepLocked && <CheckCircle size={10} className="text-white" />}
                  </div>
                </div>
                <div>
                  <div className="text-[13px] font-medium text-gray-700 flex items-center gap-1.5">
                    <Lock size={11} /> Mantener turnos bloqueados
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Los turnos con 🔒 no serán modificados por la IA
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <div className="w-4 h-4 rounded border-2 border-gray-300 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[13px] font-medium text-gray-700">
                    Solo cubrir huecos vacíos
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Respeta los turnos ya asignados y completa los que faltan
                  </div>
                </div>
              </label>
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={13} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-amber-700">
                La generación puede tardar 30–60 segundos. Se aplicarán todas las restricciones del convenio colectivo de hostelería de Tarragona.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                className="text-[12px] font-medium px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                className="flex items-center gap-2 text-[12px] font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                onClick={handleGenerate}
              >
                <Sparkles size={13} />
                Generar cuadrante
              </button>
            </div>
          </div>
        )}

        {/* Loading step */}
        {step === 'loading' && (
          <div className="px-5 py-10 flex flex-col items-center gap-5 text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center">
                <Sparkles size={28} className="text-indigo-600" />
              </div>
              <div className="absolute -inset-1">
                <div className="w-[72px] h-[72px] rounded-2xl border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
              </div>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-gray-800 mb-1">
                Generando cuadrante...
              </h3>
              <p className="text-[13px] text-gray-400 h-5 transition-all">
                {loadingMsg}
              </p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full animate-[loading_2s_ease-in-out_infinite]" style={{ width: '60%' }} />
            </div>
          </div>
        )}

        {/* Result step */}
        {step === 'result' && (
          <div className="px-5 py-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={22} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-gray-800">Cuadrante generado</h3>
                <p className="text-[12px] text-gray-400">Abre el editor para revisar y ajustar</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Score', value: '87/100' },
                { label: 'Turnos', value: '42' },
                { label: 'Advertencias', value: '2' },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                  <div className="text-[18px] font-semibold text-gray-800">{s.value}</div>
                  <div className="text-[10px] text-gray-400">{s.label}</div>
                </div>
              ))}
            </div>

            <button
              className="w-full flex items-center justify-center gap-2 text-[13px] font-medium px-4 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              onClick={onClose}
            >
              Abrir en editor <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
