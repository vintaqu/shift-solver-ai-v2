'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, differenceInCalendarDays, isWithinInterval, addDays, isWeekend } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Plus, Search, Filter, Check, X, Clock, Calendar,
  AlertTriangle, AlertCircle, CheckCircle, ChevronDown,
  Users, Loader2, Pencil, Trash2, Info, Sun, Briefcase,
  ChevronRight, BarChart2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  createAbsence, approveAbsence, rejectAbsence,
  deleteAbsence, updateAbsence,
} from '@/server/actions/absences'
import { ABSENCE_LABELS, ABSENCE_COLORS, STATUS_LABELS, calcDays } from '@/lib/absenceUtils'

// ── Tipos ──────────────────────────────────────────────────────────────────
interface Employee {
  id: string; firstName: string; lastName: string
  color: string; vacationDaysType: string; vacationDaysPerYear: number
}
interface Absence {
  id: string; employeeId: string; type: string; status: string
  startDate: string; endDate: string; totalDays: number
  comment: string | null; managerNote: string | null
  blocksPlanningPeriods: boolean; createdAt: string
  employee: Employee
}

const TYPES = Object.keys(ABSENCE_LABELS)
const CURRENT_YEAR = new Date().getFullYear()

function inputCls(err = false) {
  return cn(
    'w-full border rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:border-transparent',
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

// ═══════════════════════════════════════════════════════════════════════════
export function AbsencesClient({ absences: initial, employees, organizationId }: {
  absences: Absence[]; employees: Employee[]; organizationId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterEmp, setFilterEmp] = useState('all')
  const [filterYear, setFilterYear] = useState(CURRENT_YEAR)
  const [createModal, setCreateModal] = useState(false)
  const [editModal, setEditModal] = useState<Absence | null>(null)
  const [rejectModal, setRejectModal] = useState<string | null>(null)
  const [approveModal, setApproveModal] = useState<Absence | null>(null)
  const [detailPanel, setDetailPanel] = useState<Absence | null>(null)

  // ── Filtrado ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return initial.filter(a => {
      const yr = new Date(a.startDate).getFullYear()
      const matchYear = yr === filterYear
      const matchSearch = `${a.employee.firstName} ${a.employee.lastName}`.toLowerCase().includes(search.toLowerCase())
      const matchStatus = filterStatus === 'all' || a.status === filterStatus
      const matchType = filterType === 'all' || a.type === filterType
      const matchEmp = filterEmp === 'all' || a.employeeId === filterEmp
      return matchYear && matchSearch && matchStatus && matchType && matchEmp
    })
  }, [initial, search, filterStatus, filterType, filterEmp, filterYear])

  // ── Estadísticas ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const yearAbsences = initial.filter(a => new Date(a.startDate).getFullYear() === filterYear)
    return {
      pending: yearAbsences.filter(a => a.status === 'PENDING').length,
      approved: yearAbsences.filter(a => a.status === 'APPROVED').length,
      rejected: yearAbsences.filter(a => a.status === 'REJECTED').length,
      totalDays: yearAbsences.filter(a => a.status === 'APPROVED').reduce((acc, a) => acc + a.totalDays, 0),
      vacDays: yearAbsences.filter(a => a.type === 'VACACIONES' && a.status === 'APPROVED').reduce((acc, a) => acc + a.totalDays, 0),
    }
  }, [initial, filterYear])

  // ── Saldo de vacaciones por empleado ─────────────────────────────────────
  function empVacBalance(emp: Employee): { used: number; total: number; remaining: number } {
    const used = initial
      .filter(a => a.employeeId === emp.id && a.type === 'VACACIONES' && a.status === 'APPROVED' && new Date(a.startDate).getFullYear() === filterYear)
      .reduce((acc, a) => acc + a.totalDays, 0)
    const total = emp.vacationDaysPerYear ?? 23
    return { used, total, remaining: total - used }
  }

  // ── Acciones rápidas ──────────────────────────────────────────────────────
  function handleApprove(absence: Absence) {
    if (absence.type === 'VACACIONES') {
      const bal = empVacBalance(absence.employee)
      if (bal.remaining < absence.totalDays) {
        setApproveModal(absence)
        return
      }
    }
    startTransition(async () => {
      try {
        await approveAbsence(absence.id)
        toast.success('Ausencia aprobada ✓')
        router.refresh()
      } catch (e: any) { toast.error(e.message) }
    })
  }

  function handleReject(id: string) { setRejectModal(id) }

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta solicitud?')) return
    startTransition(async () => {
      try {
        await deleteAbsence(id)
        toast.success('Solicitud eliminada')
        router.refresh()
      } catch (e: any) { toast.error(e.message) }
    })
  }

  const pendingAbsences = filtered.filter(a => a.status === 'PENDING')
  const restAbsences = filtered.filter(a => a.status !== 'PENDING')

  return (
    <div className="flex flex-col h-full" style={{ background: '#f5f6fa' }}>

      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Ausencias y vacaciones</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {stats.pending > 0 && <span className="text-amber-600 font-medium">{stats.pending} pendiente{stats.pending > 1 ? 's' : ''} · </span>}
              {stats.approved} aprobada{stats.approved !== 1 ? 's' : ''} en {filterYear}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Selector año */}
            <div className="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5">
              <button onClick={() => setFilterYear(y => y - 1)} className="text-gray-400 hover:text-gray-600 text-[14px] font-bold">‹</button>
              <span className="text-[13px] font-semibold text-gray-700 px-2">{filterYear}</span>
              <button onClick={() => setFilterYear(y => y + 1)} className="text-gray-400 hover:text-gray-600 text-[14px] font-bold">›</button>
            </div>
            <button
              onClick={() => setCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus size={15} /> Nueva solicitud
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          {[
            { label: 'Pendientes', value: stats.pending, cls: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', icon: <Clock size={16} className="text-amber-500" /> },
            { label: 'Aprobadas', value: stats.approved, cls: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: <CheckCircle size={16} className="text-emerald-500" /> },
            { label: 'Denegadas', value: stats.rejected, cls: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: <X size={16} className="text-red-500" /> },
            { label: 'Días aprobados', value: stats.totalDays, cls: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200', icon: <Calendar size={16} className="text-indigo-500" /> },
            { label: 'Días vacaciones', value: stats.vacDays, cls: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: <Sun size={16} className="text-blue-500" /> },
          ].map(s => (
            <div key={s.label} className={cn('flex items-center gap-3 rounded-xl border p-3', s.bg)}>
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm">{s.icon}</div>
              <div>
                <div className={cn('text-[20px] font-bold', s.cls)}>{s.value}</div>
                <div className="text-[10px] text-gray-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar empleado..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-white">
            <option value="all">Todos los empleados</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-white">
            <option value="all">Todos los tipos</option>
            {TYPES.map(t => <option key={t} value={t}>{ABSENCE_LABELS[t]}</option>)}
          </select>
          <div className="flex bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
            {(['all', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={cn('px-3 py-2 text-[12px] font-medium transition-colors',
                  filterStatus === s ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}>
                {s === 'all' ? 'Todas' : STATUS_LABELS[s]?.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Lista principal */}
        <div className="flex-1 overflow-auto p-6 space-y-5">

          {/* Pendientes primero — zona de atención */}
          {pendingAbsences.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[12px] font-bold text-amber-700 uppercase tracking-wider">
                  Requieren acción · {pendingAbsences.length}
                </span>
              </div>
              <div className="space-y-2">
                {pendingAbsences.map(a => (
                  <AbsenceRow
                    key={a.id}
                    absence={a}
                    vacBalance={empVacBalance(a.employee)}
                    onApprove={() => handleApprove(a)}
                    onReject={() => handleReject(a.id)}
                    onEdit={() => setEditModal(a)}
                    onDelete={() => handleDelete(a.id)}
                    onDetail={() => setDetailPanel(d => d?.id === a.id ? null : a)}
                    isSelected={detailPanel?.id === a.id}
                    isPending={isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Resto */}
          {restAbsences.length > 0 && (
            <div>
              {pendingAbsences.length > 0 && (
                <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Historial · {restAbsences.length}
                </div>
              )}
              <div className="space-y-2">
                {restAbsences.map(a => (
                  <AbsenceRow
                    key={a.id}
                    absence={a}
                    vacBalance={empVacBalance(a.employee)}
                    onApprove={() => handleApprove(a)}
                    onReject={() => handleReject(a.id)}
                    onEdit={() => setEditModal(a)}
                    onDelete={() => handleDelete(a.id)}
                    onDetail={() => setDetailPanel(d => d?.id === a.id ? null : a)}
                    isSelected={detailPanel?.id === a.id}
                    isPending={isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar size={40} className="text-gray-200 mb-4" />
              <p className="text-gray-500 font-medium">Sin solicitudes</p>
              <p className="text-gray-400 text-sm mt-1">Crea la primera con "+ Nueva solicitud"</p>
            </div>
          )}
        </div>

        {/* Sidebar: saldo de vacaciones por empleado */}
        <aside className="w-[260px] min-w-[260px] border-l border-gray-200 bg-white overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Saldo vacaciones {filterYear}
            </div>
          </div>
          <div className="p-3 space-y-2">
            {employees.map(emp => {
              const bal = empVacBalance(emp)
              const pct = Math.min(100, (bal.used / bal.total) * 100)
              const isOver = bal.remaining < 0
              const initials = `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase()

              return (
                <div key={emp.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: emp.color }}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-gray-700 truncate">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {emp.vacationDaysType === 'NATURALES' ? '🌿 Naturales' : '💼 Laborables'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-gray-500">Usados / Total</span>
                    <span className={cn('text-[12px] font-bold', isOver ? 'text-red-600' : 'text-gray-800')}>
                      {bal.used} / {bal.total}d
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: isOver ? '#ef4444' : pct > 75 ? '#f59e0b' : '#10b981' }} />
                  </div>
                  <div className={cn('text-[10px] mt-1 font-semibold text-right', isOver ? 'text-red-500' : 'text-gray-500')}>
                    {isOver ? `⚠️ Exceso ${Math.abs(bal.remaining)}d` : `Quedan ${bal.remaining}d`}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      </div>

      {/* ── Panel detalle ── */}
      {detailPanel && (
        <DetailPanel
          absence={detailPanel}
          vacBalance={empVacBalance(detailPanel.employee)}
          onClose={() => setDetailPanel(null)}
        />
      )}

      {/* ── Modales ── */}
      {createModal && (
        <AbsenceFormModal
          mode="create"
          employees={employees}
          organizationId={organizationId}
          onClose={() => setCreateModal(false)}
          onSaved={() => { setCreateModal(false); router.refresh() }}
        />
      )}

      {editModal && (
        <AbsenceFormModal
          mode="edit"
          absence={editModal}
          employees={employees}
          organizationId={organizationId}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); router.refresh() }}
        />
      )}

      {rejectModal && (
        <RejectModal
          absenceId={rejectModal}
          onClose={() => setRejectModal(null)}
          onRejected={() => { setRejectModal(null); router.refresh() }}
        />
      )}

      {approveModal && (
        <ApproveWithWarningModal
          absence={approveModal}
          vacBalance={empVacBalance(approveModal.employee)}
          onClose={() => setApproveModal(null)}
          onConfirm={() => {
            startTransition(async () => {
              try {
                await approveAbsence(approveModal.id)
                toast.success('Ausencia aprobada ✓')
                setApproveModal(null)
                router.refresh()
              } catch (e: any) { toast.error(e.message) }
            })
          }}
          isPending={isPending}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ABSENCE ROW
// ═══════════════════════════════════════════════════════════════════════════
function AbsenceRow({ absence: a, vacBalance, onApprove, onReject, onEdit, onDelete, onDetail, isSelected, isPending }: any) {
  const col = ABSENCE_COLORS[a.type] ?? ABSENCE_COLORS.AUSENCIA
  const st = STATUS_LABELS[a.status]
  const initials = `${a.employee.firstName[0]}${a.employee.lastName[0]}`.toUpperCase()
  const balWarn = a.type === 'VACACIONES' && vacBalance.remaining < a.totalDays && a.status === 'PENDING'

  return (
    <div
      className={cn(
        'bg-white rounded-2xl border transition-all hover:shadow-sm',
        isSelected ? 'border-indigo-300 shadow-md' : 'border-gray-200',
        a.status === 'PENDING' && 'border-l-4 border-l-amber-400'
      )}
    >
      <div className="flex items-center gap-4 px-4 py-3.5 cursor-pointer" onClick={onDetail}>
        {/* Avatar */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0 shadow-sm"
          style={{ backgroundColor: a.employee.color }}>
          {initials}
        </div>

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-gray-800">
              {a.employee.firstName} {a.employee.lastName}
            </span>
            {/* Tipo */}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{ backgroundColor: col.bg, color: col.text, borderColor: col.border }}>
              {ABSENCE_LABELS[a.type]}
            </span>
            {/* Status */}
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', st?.cls)}>
              {st?.label}
            </span>
            {/* Alerta saldo */}
            {balWarn && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 flex items-center gap-1">
                <AlertTriangle size={9} /> Sin saldo
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[12px] text-gray-500">
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {format(parseISO(a.startDate), "d MMM yyyy", { locale: es })}
              {a.startDate !== a.endDate && ` → ${format(parseISO(a.endDate), "d MMM yyyy", { locale: es })}`}
            </span>
            <span className="font-semibold text-gray-700">
              {a.totalDays} día{a.totalDays !== 1 ? 's' : ''}
              <span className="text-[10px] text-gray-400 ml-1">
                ({a.employee.vacationDaysType === 'NATURALES' ? 'nat.' : 'lab.'})
              </span>
            </span>
            {a.comment && <span className="text-gray-400 italic truncate max-w-[200px]">"{a.comment}"</span>}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {a.status === 'PENDING' && (
            <>
              <button
                disabled={isPending}
                onClick={e => { e.stopPropagation(); onApprove() }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[12px] font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <Check size={12} /> Aprobar
              </button>
              <button
                disabled={isPending}
                onClick={e => { e.stopPropagation(); onReject() }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-[12px] font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <X size={12} /> Denegar
              </button>
            </>
          )}
          {a.status !== 'APPROVED' && (
            <>
              <button onClick={e => { e.stopPropagation(); onEdit() }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors">
                <Pencil size={13} />
              </button>
              <button onClick={e => { e.stopPropagation(); onDelete() }}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                <Trash2 size={13} />
              </button>
            </>
          )}
          <ChevronRight size={14} className={cn('text-gray-300 transition-transform', isSelected && 'rotate-90')} />
        </div>
      </div>

      {/* Expansión detalle inline */}
      {isSelected && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100">
          <DetailPanel absence={a} vacBalance={{ used: 0, total: 0, remaining: 0 }} inline onClose={() => {}} />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAIL PANEL
// ═══════════════════════════════════════════════════════════════════════════
function DetailPanel({ absence: a, vacBalance, onClose, inline = false }: any) {
  const col = ABSENCE_COLORS[a.type]

  return (
    <div className={cn(!inline && 'flex-shrink-0 border-t border-indigo-200 bg-indigo-50 px-6 py-4')}>
      {!inline && (
        <button onClick={onClose} className="float-right p-1 rounded-lg hover:bg-indigo-100 text-indigo-400">
          <X size={14} />
        </button>
      )}
      <div className={cn('grid gap-4', inline ? 'grid-cols-2 mt-3' : 'grid-cols-4')}>
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Tipo</div>
          <span className="text-[12px] font-bold px-2 py-1 rounded-lg"
            style={{ backgroundColor: col?.bg, color: col?.text }}>{ABSENCE_LABELS[a.type]}</span>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Período</div>
          <div className="text-[12px] font-semibold text-gray-800">
            {format(parseISO(a.startDate), "d MMM", { locale: es })} – {format(parseISO(a.endDate), "d MMM yyyy", { locale: es })}
          </div>
          <div className="text-[11px] text-gray-500">{a.totalDays} días {a.employee.vacationDaysType === 'NATURALES' ? 'naturales' : 'laborables'}</div>
        </div>
        {a.comment && (
          <div>
            <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Motivo empleado</div>
            <div className="text-[12px] text-gray-700 italic">"{a.comment}"</div>
          </div>
        )}
        {a.managerNote && (
          <div>
            <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Nota manager</div>
            <div className="text-[12px] text-gray-700">"{a.managerNote}"</div>
          </div>
        )}
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Bloquea solver</div>
          <div className={cn('text-[12px] font-semibold', a.blocksPlanningPeriods ? 'text-indigo-600' : 'text-gray-400')}>
            {a.blocksPlanningPeriods ? '✓ Sí — el solver lo ignorará' : '✗ No — puede ser planificado'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Solicitada</div>
          <div className="text-[12px] text-gray-700">
            {format(parseISO(a.createdAt), "d MMM yyyy HH:mm", { locale: es })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL CREAR / EDITAR AUSENCIA
// ═══════════════════════════════════════════════════════════════════════════
function AbsenceFormModal({ mode, absence, employees, organizationId, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    employeeId: absence?.employeeId ?? employees[0]?.id ?? '',
    type: absence?.type ?? 'VACACIONES',
    startDate: absence?.startDate ? absence.startDate.split('T')[0] : '',
    endDate: absence?.endDate ? absence.endDate.split('T')[0] : '',
    comment: absence?.comment ?? '',
    blocksPlanningPeriods: absence?.blocksPlanningPeriods ?? true,
  })
  const [error, setError] = useState('')

  const selectedEmp = employees.find((e: Employee) => e.id === form.employeeId)
  const col = ABSENCE_COLORS[form.type] ?? ABSENCE_COLORS.VACACIONES

  // Cálculo de días en tiempo real
  const preview = useMemo(() => {
    if (!form.startDate || !form.endDate || form.startDate > form.endDate) return null
    const start = new Date(form.startDate)
    const end = new Date(form.endDate)
    const tipo = (selectedEmp?.vacationDaysType ?? 'NATURALES') as 'NATURALES' | 'LABORABLES'
    const days = calcDays(start, end, tipo)
    return { days, tipo }
  }, [form.startDate, form.endDate, selectedEmp])

  function handleSave() {
    setError('')
    if (!form.employeeId) { setError('Selecciona un empleado'); return }
    if (!form.startDate || !form.endDate) { setError('Fechas obligatorias'); return }
    if (form.startDate > form.endDate) { setError('La fecha de fin debe ser posterior al inicio'); return }

    startTransition(async () => {
      try {
        if (mode === 'create') {
          await createAbsence({ ...form, organizationId })
          toast.success('Solicitud creada ✓')
        } else {
          await updateAbsence(absence.id, form)
          toast.success('Solicitud actualizada ✓')
        }
        onSaved()
      } catch (e: any) { setError(e.message) }
    })
  }

  return (
    <Modal title={mode === 'create' ? 'Nueva solicitud de ausencia' : 'Editar solicitud'} onClose={onClose}>
      <div className="space-y-4">

        {/* Empleado */}
        {mode === 'create' && (
          <Field label="Empleado">
            <select className={inputCls()} value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}>
              {employees.map((e: Employee) => (
                <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
              ))}
            </select>
          </Field>
        )}

        {/* Config vacaciones del empleado */}
        {selectedEmp && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-[11px] text-gray-600">
            <Info size={12} className="text-gray-400 flex-shrink-0" />
            <span>
              {selectedEmp.firstName} tiene <strong>{selectedEmp.vacationDaysPerYear} días</strong> de vacaciones anuales en modalidad <strong>{selectedEmp.vacationDaysType === 'NATURALES' ? 'días naturales' : 'días laborables'}</strong>
            </span>
          </div>
        )}

        {/* Tipo */}
        <Field label="Tipo de ausencia">
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(t => {
              const c = ABSENCE_COLORS[t]
              const selected = form.type === t
              return (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={cn('flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all text-[12px] font-semibold',
                    selected ? 'border-transparent shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'
                  )}
                  style={selected ? { backgroundColor: c.bg, color: c.text, borderColor: c.border } : {}}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.dot }} />
                  {ABSENCE_LABELS[t]}
                </button>
              )
            })}
          </div>
        </Field>

        {/* Fechas */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha inicio">
            <input type="date" className={inputCls()} value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
          </Field>
          <Field label="Fecha fin">
            <input type="date" className={inputCls()} value={form.endDate} min={form.startDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
          </Field>
        </div>

        {/* Preview días */}
        {preview && (
          <div className="px-4 py-3 rounded-xl border-2 text-center transition-all"
            style={{ backgroundColor: col.bg, borderColor: col.border }}>
            <div className="text-[24px] font-bold" style={{ color: col.text }}>{preview.days}</div>
            <div className="text-[12px]" style={{ color: col.text }}>
              día{preview.days !== 1 ? 's' : ''} {preview.tipo === 'NATURALES' ? 'naturales' : 'laborables'}
            </div>
            {form.type === 'VACACIONES' && selectedEmp && (
              <div className="text-[11px] mt-1" style={{ color: col.text, opacity: 0.7 }}>
                Saldo disponible: {selectedEmp.vacationDaysPerYear} días totales
              </div>
            )}
          </div>
        )}

        {/* Comentario */}
        <Field label="Motivo / comentario (opcional)">
          <textarea
            className={inputCls() + ' resize-none h-20'}
            value={form.comment}
            onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
            placeholder="Motivo de la solicitud..."
          />
        </Field>

        {/* Bloquear solver */}
        <div
          className={cn('flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
            form.blocksPlanningPeriods ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white')}
          onClick={() => setForm(f => ({ ...f, blocksPlanningPeriods: !f.blocksPlanningPeriods }))}
        >
          <div className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0 mt-0.5', form.blocksPlanningPeriods ? 'bg-indigo-600' : 'bg-gray-200')}>
            <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', form.blocksPlanningPeriods ? 'left-5' : 'left-0.5')} />
          </div>
          <div>
            <div className="text-[13px] font-medium text-gray-700">Bloquear en generación automática</div>
            <div className="text-[11px] text-gray-400 mt-0.5">El solver OR-Tools no asignará turnos a este empleado durante estos días</div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700">
            <AlertCircle size={13} /> {error}
          </div>
        )}
      </div>

      <ModalFooter onClose={onClose} saveLabel={mode === 'create' ? 'Crear solicitud' : 'Guardar'} isPending={isPending} onSave={handleSave} />
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Denegar con motivo
// ═══════════════════════════════════════════════════════════════════════════
function RejectModal({ absenceId, onClose, onRejected }: any) {
  const [isPending, startTransition] = useTransition()
  const [note, setNote] = useState('')

  return (
    <Modal title="Denegar solicitud" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-2 px-3 py-3 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>Se notificará al empleado con el motivo que indiques.</span>
        </div>
        <Field label="Motivo de la denegación *">
          <textarea
            className={inputCls() + ' resize-none h-24'}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Explica el motivo para que el empleado pueda entenderlo..."
          />
        </Field>
      </div>
      <ModalFooter
        onClose={onClose}
        saveLabel="Denegar solicitud"
        saveClass="bg-red-600 hover:bg-red-700"
        isPending={isPending}
        disabled={!note.trim()}
        onSave={() => startTransition(async () => {
          try {
            await rejectAbsence(absenceId, note)
            toast.success('Solicitud denegada')
            onRejected()
          } catch (e: any) { toast.error((e as Error).message) }
        })}
      />
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: Aprobar con aviso de saldo insuficiente
// ═══════════════════════════════════════════════════════════════════════════
function ApproveWithWarningModal({ absence, vacBalance, onClose, onConfirm, isPending }: any) {
  return (
    <Modal title="Aprobar — saldo insuficiente" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300">
          <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-[14px] font-bold text-amber-800">Saldo de vacaciones insuficiente</div>
            <div className="text-[12px] text-amber-700 mt-1">
              {absence.employee.firstName} tiene <strong>{vacBalance.remaining} días disponibles</strong> pero esta solicitud requiere <strong>{absence.totalDays} días</strong>.
            </div>
          </div>
        </div>
        <div className="text-[13px] text-gray-600">
          ¿Deseas aprobarla igualmente? El saldo quedará en negativo y deberás ajustarlo manualmente.
        </div>
      </div>
      <ModalFooter
        onClose={onClose}
        saveLabel="Aprobar igualmente"
        saveClass="bg-amber-600 hover:bg-amber-700"
        isPending={isPending}
        onSave={onConfirm}
      />
    </Modal>
  )
}

// ─── Genéricos ────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[500px] flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white transition-colors"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function ModalFooter({ onClose, onSave, isPending, saveLabel = 'Guardar', saveClass = 'bg-indigo-600 hover:bg-indigo-700', disabled = false }: any) {
  return (
    <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-100">
      <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">Cancelar</button>
      <button onClick={onSave} disabled={isPending || disabled}
        className={cn('flex items-center gap-2 px-5 py-2 rounded-xl text-white text-[13px] font-semibold disabled:opacity-50 transition-colors', saveClass)}>
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
        {saveLabel}
      </button>
    </div>
  )
}
