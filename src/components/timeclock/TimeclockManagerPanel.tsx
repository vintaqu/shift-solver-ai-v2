'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Clock, AlertTriangle, CheckCircle, Edit2, MapPin,
  X, Loader2, ChevronDown, Filter, Download, TrendingUp,
  User, Calendar, Search
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { modifyClockEntry } from '@/server/actions/timeclock'

const STATUS_CFG = {
  PENDING:    { label: 'En curso',    color: 'bg-blue-100 text-blue-700 border-blue-200',   icon: '🔵' },
  COMPLETE:   { label: 'Completado',  color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '✅' },
  INCOMPLETE: { label: 'Auto-comp.',  color: 'bg-gray-100 text-gray-600 border-gray-200',   icon: '🤖' },
  OVERTIME:   { label: 'Horas extra', color: 'bg-amber-100 text-amber-700 border-amber-200',icon: '⏰' },
  INCIDENT:   { label: 'Incidencia',  color: 'bg-red-100 text-red-700 border-red-200',      icon: '⚠️' },
}

function fmtMin(min: number | null | undefined): string {
  if (min == null) return '—'
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  const sign = min < 0 ? '-' : ''
  return m > 0 ? `${sign}${h}h ${m}m` : `${sign}${h}h`
}

export function TimeclockManagerPanel({ entries, organizationId }: { entries: any[]; organizationId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [editModal, setEditModal] = useState<any | null>(null)

  const filtered = entries.filter(e => {
    const name = `${e.employee.firstName} ${e.employee.lastName}`.toLowerCase()
    const matchSearch = name.includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || e.status === filterStatus
    return matchSearch && matchStatus
  })

  // KPIs
  const totalWorked = entries.reduce((s, e) => s + (e.workedMinutes || 0), 0)
  const totalExtra = entries.reduce((s, e) => s + Math.max(0, e.extraMinutes || 0), 0)
  const incidents = entries.filter(e => e.status === 'INCIDENT' || e.status === 'INCOMPLETE').length

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Horas trabajadas', value: fmtMin(totalWorked), icon: <Clock size={16} className="text-indigo-600" />, bg: 'bg-indigo-50' },
          { label: 'Horas extra acum.', value: fmtMin(totalExtra), icon: <TrendingUp size={16} className="text-amber-600" />, bg: 'bg-amber-50' },
          { label: 'Incidencias', value: incidents, icon: <AlertTriangle size={16} className="text-red-500" />, bg: 'bg-red-50' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-2', k.bg)}>{k.icon}</div>
            <div className="text-[20px] font-bold text-gray-900">{k.value}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empleado..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 border border-gray-200">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'INCIDENT', label: '⚠️ Incidencias' },
            { key: 'OVERTIME', label: '⏰ Extra' },
            { key: 'INCOMPLETE', label: '🤖 Auto' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilterStatus(f.key)}
              className={cn('px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                filterStatus === f.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de fichajes */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-[13px]">Sin fichajes que coincidan</div>
          ) : filtered.map(entry => {
            const statusCfg = STATUS_CFG[entry.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.COMPLETE
            const wasModified = entry.entryType === 'MODIFIED'

            return (
              <div key={entry.id} className={cn('px-5 py-3.5 hover:bg-gray-50 transition-colors',
                entry.status === 'INCIDENT' && 'bg-red-50/30',
                entry.status === 'OVERTIME' && 'bg-amber-50/30')}>
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                    style={{ backgroundColor: entry.employee.color || '#6366f1' }}>
                    {entry.employee.firstName[0]}{entry.employee.lastName[0]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-gray-800">
                        {entry.employee.firstName} {entry.employee.lastName}
                      </span>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', statusCfg.color)}>
                        {statusCfg.icon} {statusCfg.label}
                      </span>
                      {wasModified && (
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                          ✏️ Modificado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-0.5 text-[11px] text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {format(new Date(entry.date), "d MMM", { locale: es })}
                      </span>
                      <span>
                        {entry.clockIn ? format(new Date(entry.clockIn), 'HH:mm') : '—'}
                        {' → '}
                        {entry.clockOut ? format(new Date(entry.clockOut), 'HH:mm') : '(en curso)'}
                      </span>
                      {entry.scheduledStart && (
                        <span className="text-gray-400">
                          Turno: {entry.scheduledStart}–{entry.scheduledEnd}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Horas */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-[14px] font-bold text-gray-800">{fmtMin(entry.workedMinutes)}</div>
                    {entry.extraMinutes !== 0 && entry.extraMinutes !== null && (
                      <div className={cn('text-[11px] font-semibold',
                        entry.extraMinutes > 0 ? 'text-amber-600' : 'text-red-500')}>
                        {entry.extraMinutes > 0 ? '+' : ''}{fmtMin(entry.extraMinutes)}
                      </div>
                    )}
                    {(entry.clockInLat || entry.clockOutLat) && (
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        <MapPin size={9} className="text-gray-300" />
                        <span className="text-[9px] text-gray-300">GPS</span>
                      </div>
                    )}
                  </div>

                  {/* Acción */}
                  <button onClick={() => setEditModal(entry)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors flex-shrink-0">
                    <Edit2 size={14} />
                  </button>
                </div>

                {/* Detalle modificación */}
                {wasModified && entry.modificationReason && (
                  <div className="mt-2 ml-13 pl-13 text-[11px] text-gray-400 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5">
                    ✏️ <strong>{entry.modifiedBy?.name ?? 'Manager'}</strong>: {entry.modificationReason}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal edición */}
      {editModal && (
        <EditClockModal
          entry={editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function EditClockModal({ entry, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [clockIn, setClockIn] = useState(
    entry.clockIn ? format(new Date(entry.clockIn), 'HH:mm') : ''
  )
  const [clockOut, setClockOut] = useState(
    entry.clockOut ? format(new Date(entry.clockOut), 'HH:mm') : ''
  )
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[440px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"
          style={{ background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)' }}>
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Modificar fichaje</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {entry.employee.firstName} {entry.employee.lastName} · {format(new Date(entry.date), "d MMM yyyy", { locale: es })}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Valores originales si fue modificado */}
          {entry.originalClockIn && (
            <div className="text-[11px] text-gray-400 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
              Valores originales: {format(new Date(entry.originalClockIn), 'HH:mm')} → {entry.originalClockOut ? format(new Date(entry.originalClockOut), 'HH:mm') : '—'}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Hora entrada
              </label>
              <input type="time" value={clockIn} onChange={e => setClockIn(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Hora salida
              </label>
              <input type="time" value={clockOut} onChange={e => setClockOut(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Motivo de la modificación <span className="text-red-500">*</span>
            </label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="Ej: El empleado olvidó fichar la salida, se ha confirmado que salió a las 17:00"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
            <p className="text-[10px] text-gray-400 mt-1">
              ⚖️ Requerido por RDL 8/2019 — queda registrado en auditoría
            </p>
          </div>
        </div>

        <div className="flex justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100">
            Cancelar
          </button>
          <button disabled={isPending || !reason.trim()}
            onClick={() => startTransition(async () => {
              try {
                await modifyClockEntry({ entryId: entry.id, clockIn: clockIn || undefined, clockOut: clockOut || undefined, reason })
                toast.success('Fichaje actualizado ✓')
                onSaved()
              } catch (e: any) { toast.error(e.message) }
            })}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
