'use client'

import { useState, useEffect, useTransition } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { Clock, MapPin, CheckCircle, Loader2, AlertCircle, LogIn, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { clockIn, clockOut } from '@/server/actions/timeclock'

interface Props {
  employeeId: string
  todayAssignment?: { startTime: string; endTime: string; breakMinutes: number } | null
  activeEntry?: { id: string; clockIn: Date; clockOut?: Date | null; scheduledStart?: string | null; scheduledEnd?: string | null } | null
}

export function ClockWidget({ employeeId, todayAssignment, activeEntry: initialEntry }: Props) {
  const [isPending, startTransition] = useTransition()
  const [now, setNow] = useState(new Date())
  const [activeEntry, setActiveEntry] = useState(initialEntry)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ok' | 'denied'>('idle')

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) return
    setLocationStatus('loading')
    navigator.geolocation.getCurrentPosition(
      pos => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationStatus('ok') },
      () => setLocationStatus('denied'),
      { timeout: 5000 }
    )
  }, [])

  const isWorking = !!activeEntry && !activeEntry.clockOut
  const workedSoFar = isWorking && activeEntry?.clockIn
    ? Math.round((now.getTime() - new Date(activeEntry.clockIn).getTime()) / 60000)
    : null

  const scheduledMin = todayAssignment ? (() => {
    const [sh, sm] = todayAssignment.startTime.split(':').map(Number)
    const [eh, em] = todayAssignment.endTime.split(':').map(Number)
    let s = sh * 60 + sm, e = eh * 60 + em
    if (e <= s) e += 24 * 60
    return e - s - todayAssignment.breakMinutes
  })() : null

  const extraMin = workedSoFar !== null && scheduledMin !== null ? workedSoFar - scheduledMin : null

  function handleClockIn() {
    startTransition(async () => {
      try {
        const entry = await clockIn({ employeeId, lat: location?.lat, lng: location?.lng })
        setActiveEntry(entry as any)
        toast.success('✓ Entrada fichada')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  function handleClockOut() {
    if (!activeEntry) return
    startTransition(async () => {
      try {
        await clockOut({ entryId: activeEntry.id, lat: location?.lat, lng: location?.lng })
        setActiveEntry((prev: any) => ({ ...prev, clockOut: new Date() }))
        toast.success('✓ Salida fichada')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-5 text-center" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)' }}>
        <div className="text-[44px] font-bold text-white tracking-tight font-mono leading-none">
          {format(now, 'HH:mm:ss')}
        </div>
        <div className="text-[12px] text-indigo-300 mt-1.5 capitalize">
          {format(now, "EEEE d 'de' MMMM yyyy", { locale: es })}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {todayAssignment ? (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-indigo-600" />
              <span className="text-[12px] font-semibold text-indigo-700">Tu turno hoy</span>
            </div>
            <span className="text-[13px] font-bold text-indigo-800">
              {todayAssignment.startTime} – {todayAssignment.endTime}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200">
            <AlertCircle size={14} className="text-gray-400" />
            <span className="text-[12px] text-gray-500">Sin turno asignado hoy</span>
          </div>
        )}

        {isWorking && workedSoFar !== null && (
          <div className="space-y-2">
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500">Tiempo trabajado</span>
              <span className="font-bold text-gray-800">{Math.floor(workedSoFar / 60)}h {workedSoFar % 60}m</span>
            </div>
            {extraMin !== null && extraMin > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-amber-600">Horas extra (descanso compensatorio)</span>
                <span className="font-bold text-amber-700">+{Math.floor(extraMin / 60)}h {extraMin % 60}m</span>
              </div>
            )}
            {scheduledMin !== null && (
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', extraMin && extraMin > 0 ? 'bg-amber-500' : 'bg-indigo-500')}
                  style={{ width: `${Math.min(120, (workedSoFar / scheduledMin) * 100)}%` }} />
              </div>
            )}
            <div className="text-[11px] text-gray-400 text-center">
              Entrada: {format(new Date(activeEntry!.clockIn), 'HH:mm')}
              {activeEntry?.scheduledEnd && ` · Fin previsto: ${activeEntry.scheduledEnd}`}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[11px]">
          <MapPin size={11} className={locationStatus === 'ok' ? 'text-emerald-500' : locationStatus === 'denied' ? 'text-red-400' : 'text-gray-300'} />
          <span className={locationStatus === 'ok' ? 'text-emerald-600' : locationStatus === 'denied' ? 'text-red-400' : 'text-gray-400'}>
            {locationStatus === 'ok' ? 'Ubicación obtenida' : locationStatus === 'denied' ? 'Sin ubicación (fichaje igualmente válido)' : locationStatus === 'loading' ? 'Obteniendo ubicación...' : ''}
          </span>
        </div>

        {!isWorking && !(activeEntry?.clockOut) ? (
          <button onClick={handleClockIn} disabled={isPending || !todayAssignment}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-[15px] transition-all shadow-lg shadow-indigo-200 active:scale-95">
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            Fichar entrada
          </button>
        ) : isWorking ? (
          <button onClick={handleClockOut} disabled={isPending}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-[15px] transition-all shadow-lg shadow-emerald-200 active:scale-95">
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
            Fichar salida
          </button>
        ) : (
          <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <CheckCircle size={14} className="text-emerald-600" />
            <span className="text-[12px] font-semibold text-emerald-700">Jornada completada ✓</span>
          </div>
        )}
      </div>
    </div>
  )
}
