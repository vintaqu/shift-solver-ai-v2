'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Calendar, CalendarDays, BarChart2,
  TrendingUp, TrendingDown, AlertCircle, AlertTriangle, CheckCircle,
  Clock, Moon, Zap, Users, DollarSign, ChevronDown, ChevronUp,
  Download, Filter, Sparkles, ArrowUpDown, Eye, Target,
  Sun, FileSpreadsheet
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Constantes ────────────────────────────────────────────────────────────
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const RISK_CFG = {
  red:    { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', dot: '#ef4444', label: 'Riesgo alto', icon: '🔴' },
  amber:  { bg: '#fefce8', border: '#fde68a', text: '#854d0e', dot: '#f59e0b', label: 'Atención',    icon: '🟡' },
  green:  { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', dot: '#22c55e', label: 'OK',          icon: '🟢' },
}

function fmtH(h: number) {
  if (h === 0) return '0h'
  const hrs = Math.floor(h)
  const m = Math.round((h - hrs) * 60)
  return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`
}
function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

type SortField = 'name' | 'hours' | 'overtime' | 'vacations' | 'risk'

// ═══════════════════════════════════════════════════════════════════════════
export function AnnualClient({ data, organizationId, locationId }: any) {
  const router = useRouter()
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('risk')
  const [filterRisk, setFilterRisk] = useState<string>('all')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active')

  const { year, employees, monthly, prevMonthly, yearTotals, prevYearTotal, yearChangePct, isCurrentYear } = data
  const currentMonth = new Date().getMonth()

  // ── Filtros y ordenación ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = employees
    if (filterActive === 'active') result = result.filter((e: any) => e.isActive)
    else if (filterActive === 'inactive') result = result.filter((e: any) => !e.isActive)
    if (filterRisk !== 'all') result = result.filter((e: any) => e.riskLevel === filterRisk)

    const sorted = [...result]
    if (sortField === 'name')      sorted.sort((a, b) => a.firstName.localeCompare(b.firstName))
    else if (sortField === 'hours')    sorted.sort((a, b) => b.pctHours - a.pctHours)
    else if (sortField === 'overtime') sorted.sort((a, b) => b.totalOvertime - a.totalOvertime)
    else if (sortField === 'vacations')sorted.sort((a, b) => a.vacationRemaining - b.vacationRemaining)
    else if (sortField === 'risk')     sorted.sort((a, b) => ({ red: 0, amber: 1, green: 2 }[a.riskLevel as keyof typeof RISK_CFG] - { red: 0, amber: 1, green: 2 }[b.riskLevel as keyof typeof RISK_CFG]))
    return sorted
  }, [employees, sortField, filterRisk, filterActive])

  // Contadores por riesgo
  const riskCounts = useMemo(() => ({
    red: employees.filter((e: any) => e.riskLevel === 'red' && e.isActive).length,
    amber: employees.filter((e: any) => e.riskLevel === 'amber' && e.isActive).length,
    green: employees.filter((e: any) => e.riskLevel === 'green' && e.isActive).length,
  }), [employees])

  function handleExport() {
    // Construir CSV
    const headers = [
      'Empleado','Rol','Contrato','Horas planificadas','Horas objetivo','% cumplimiento',
      'Horas extra','Horas nocturnas','Turnos','Partidos','% partidos',
      'Vacaciones totales','Vacaciones disfrutadas','Vacaciones programadas','Vacaciones pendientes','Saldo restante',
      'Otras ausencias (días)','Coste estimado','Riesgo','Motivo'
    ]
    const rows = employees.map((e: any) => [
      `${e.firstName} ${e.lastName}`, e.role, e.contractType,
      e.totalHours, e.targetHours, `${e.pctHours}%`,
      e.totalOvertime, e.totalNight, e.totalShifts, e.totalSplit, `${e.pctSplit}%`,
      e.vacationTotal, e.vacationTaken, e.vacationScheduled, e.vacationPending, e.vacationRemaining,
      e.otherAbsencesDays, e.totalCost, RISK_CFG[e.riskLevel as keyof typeof RISK_CFG].label, e.riskReason
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cumplimiento-anual-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV descargado ✓')
  }

  return (
    <div className="min-h-full" style={{ background: '#f5f6fa' }}>

      {/* ══ TOPBAR ════════════════════════════════════════════════════════ */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 h-[56px] flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <span className="font-semibold text-[15px] text-gray-900 tracking-tight">Shift Solver</span>
          </div>

          {/* Tabs de temporalidad */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 border border-gray-200">
            <button onClick={() => router.push(`/planning/month/${year}/${new Date().getMonth() + 1}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors">
              <Calendar size={13} /> Mes
            </button>
            <button onClick={() => router.push(`/planning`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors">
              <CalendarDays size={13} /> Semana
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-white text-indigo-600 shadow-sm">
              <BarChart2 size={13} /> Anual
            </button>
          </div>

          {/* Navegación año */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
            <button onClick={() => router.push(`/planning/annual/${year - 1}`)}
              className="p-0.5 rounded hover:bg-gray-200 transition-colors text-gray-500">
              <ChevronLeft size={15} />
            </button>
            <span className="text-[14px] font-bold text-gray-800 px-2 min-w-[60px] text-center">{year}</span>
            <button onClick={() => router.push(`/planning/annual/${year + 1}`)}
              className="p-0.5 rounded hover:bg-gray-200 transition-colors text-gray-500">
              <ChevronRight size={15} />
            </button>
          </div>

          {!isCurrentYear && (
            <button onClick={() => router.push(`/planning/annual/${new Date().getFullYear()}`)}
              className="px-3 py-1.5 rounded-xl text-[12px] font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
              Año actual
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            <FileSpreadsheet size={13} /> Exportar CSV
          </button>
        </div>
      </header>

      {/* ══ CONTENIDO ══════════════════════════════════════════════════════ */}
      <div className="max-w-[1400px] mx-auto p-6 space-y-5">

        {/* ── A) VISTA GLOBAL — KPIs anuales ── */}
        <section>
          <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">Vista global · {year}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <KpiCard
              icon={<Clock size={16} className="text-indigo-600" />}
              label="Horas planificadas"
              value={fmtH(yearTotals.hours)}
              comparison={yearChangePct}
              bg="bg-indigo-50"
            />
            <KpiCard
              icon={<Moon size={16} className="text-violet-600" />}
              label="Horas nocturnas"
              value={fmtH(yearTotals.nightHours)}
              bg="bg-violet-50"
            />
            <KpiCard
              icon={<Zap size={16} className="text-orange-600" />}
              label="Horas extra"
              value={fmtH(yearTotals.overtimeHours)}
              bg="bg-orange-50"
            />
            <KpiCard
              icon={<DollarSign size={16} className="text-emerald-600" />}
              label="Coste laboral"
              value={fmtMoney(yearTotals.cost)}
              bg="bg-emerald-50"
            />
            <KpiCard
              icon={<Calendar size={16} className="text-blue-600" />}
              label="Turnos totales"
              value={yearTotals.shifts.toString()}
              sub={`${yearTotals.continuous} continuos · ${yearTotals.split} partidos`}
              bg="bg-blue-50"
            />
            <KpiCard
              icon={<Sun size={16} className="text-amber-600" />}
              label="Días de ausencia"
              value={yearTotals.daysAbsenceTotal.toString()}
              sub={`${yearTotals.approvedAbsences} ausencias aprobadas`}
              bg="bg-amber-50"
            />
          </div>
        </section>

        {/* ── C) TENDENCIAS MENSUALES — Gráfica ── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div>
              <h2 className="text-[14px] font-bold text-gray-900">Tendencias mensuales</h2>
              <p className="text-[11px] text-gray-500">Horas planificadas mes a mes · comparativa con {year - 1}</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-indigo-600" />
                <span>{year}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-gray-300" />
                <span>{year - 1}</span>
              </div>
            </div>
          </div>
          <div className="p-5">
            <MonthlyChart monthly={monthly} prevMonthly={prevMonthly} currentMonth={isCurrentYear ? currentMonth : -1} />
          </div>
        </section>

        {/* ── Indicadores secundarios mensuales (nocturnas, extras) ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <MiniMonthlyChart
            title="Horas nocturnas"
            data={monthly.map((m: any) => ({ label: m.label, value: m.nightHours }))}
            color="#8b5cf6"
            icon={<Moon size={14} />}
          />
          <MiniMonthlyChart
            title="Horas extra"
            data={monthly.map((m: any) => ({ label: m.label, value: m.overtimeHours }))}
            color="#f97316"
            icon={<Zap size={14} />}
          />
          <MiniMonthlyChart
            title="Ausencias"
            data={monthly.map((m: any) => ({ label: m.label, value: m.absencesCount }))}
            color="#0ea5e9"
            icon={<Sun size={14} />}
            unit=""
          />
        </section>

        {/* ── B) TABLA CUMPLIMIENTO POR EMPLEADO ── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Header tabla con filtros */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div>
              <h2 className="text-[14px] font-bold text-gray-900">Cumplimiento legal por empleado</h2>
              <p className="text-[11px] text-gray-500">
                {employees.filter((e: any) => e.isActive).length} empleados activos · convenio: 1.791h/año · máx 80h extras · vacaciones según contrato
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Filtros riesgo */}
              <div className="flex gap-1">
                {([
                  { key: 'all',   label: 'Todos', count: employees.length, dot: '#9ca3af' },
                  { key: 'red',   label: 'Riesgo', count: riskCounts.red, dot: RISK_CFG.red.dot },
                  { key: 'amber', label: 'Atención', count: riskCounts.amber, dot: RISK_CFG.amber.dot },
                  { key: 'green', label: 'OK', count: riskCounts.green, dot: RISK_CFG.green.dot },
                ] as const).map(f => (
                  <button key={f.key} onClick={() => setFilterRisk(f.key)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all',
                      filterRisk === f.key
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    )}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: f.dot }} />
                    {f.label} {f.count > 0 && `(${f.count})`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cabecera columnas */}
          <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-gray-100 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            <button onClick={() => setSortField('name')}
              className="col-span-3 text-left flex items-center gap-1 hover:text-gray-700">
              Empleado <ArrowUpDown size={9} className={sortField === 'name' ? 'text-indigo-600' : ''} />
            </button>
            <button onClick={() => setSortField('hours')}
              className="col-span-3 text-left flex items-center gap-1 hover:text-gray-700">
              Cumplimiento horas <ArrowUpDown size={9} className={sortField === 'hours' ? 'text-indigo-600' : ''} />
            </button>
            <button onClick={() => setSortField('overtime')}
              className="col-span-2 text-left flex items-center gap-1 hover:text-gray-700">
              Extras / 80h <ArrowUpDown size={9} className={sortField === 'overtime' ? 'text-indigo-600' : ''} />
            </button>
            <button onClick={() => setSortField('vacations')}
              className="col-span-2 text-left flex items-center gap-1 hover:text-gray-700">
              Vacaciones <ArrowUpDown size={9} className={sortField === 'vacations' ? 'text-indigo-600' : ''} />
            </button>
            <button onClick={() => setSortField('risk')}
              className="col-span-2 text-left flex items-center gap-1 hover:text-gray-700">
              Estado <ArrowUpDown size={9} className={sortField === 'risk' ? 'text-indigo-600' : ''} />
            </button>
          </div>

          {/* Filas */}
          <div className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <div className="py-12 text-center">
                <Users size={32} className="text-gray-200 mx-auto mb-2" />
                <p className="text-[13px] text-gray-500">Sin empleados con este filtro</p>
              </div>
            ) : filtered.map((emp: any) => (
              <EmployeeRow
                key={emp.id}
                emp={emp}
                expanded={expandedEmpId === emp.id}
                onToggle={() => setExpandedEmpId(expandedEmpId === emp.id ? null : emp.id)}
                year={year}
                currentMonth={isCurrentYear ? currentMonth : -1}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════════════════════
function KpiCard({ icon, label, value, sub, comparison, bg }: any) {
  return (
    <div className={cn('rounded-2xl border border-gray-200 p-3.5', bg)}>
      <div className="flex items-center justify-between mb-2">
        <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center">
          {icon}
        </div>
        {comparison !== undefined && comparison !== 0 && (
          <div className={cn(
            'flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
            comparison > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          )}>
            {comparison > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
            {Math.abs(comparison)}%
          </div>
        )}
      </div>
      <div className="text-[20px] font-bold text-gray-900 leading-tight">{value}</div>
      <div className="text-[10px] text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-[9px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEE ROW — Fila plegable
// ═══════════════════════════════════════════════════════════════════════════
function EmployeeRow({ emp, expanded, onToggle, year, currentMonth }: any) {
  const risk = RISK_CFG[emp.riskLevel as keyof typeof RISK_CFG]
  const initials = `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase()

  return (
    <>
      {/* Fila principal */}
      <div onClick={onToggle}
        className={cn('grid grid-cols-12 gap-2 px-5 py-3 items-center cursor-pointer hover:bg-gray-50 transition-colors',
          expanded && 'bg-indigo-50/30',
          !emp.isActive && 'opacity-50')}>

        {/* Empleado */}
        <div className="col-span-3 flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0 shadow-sm"
            style={{ backgroundColor: emp.color }}>
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-gray-900 truncate">
              {emp.firstName} {emp.lastName}
            </div>
            <div className="text-[10px] text-gray-500 truncate">
              {emp.role} · {emp.weeklyHours}h/sem
              {!emp.isActive && <span className="ml-1 text-gray-400">· Inactivo</span>}
            </div>
          </div>
        </div>

        {/* Cumplimiento horas */}
        <div className="col-span-3">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-bold text-gray-700">{fmtH(emp.totalHours)}</span>
            <span className="text-gray-400">/ {emp.targetHours}h</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, emp.pctHours)}%`,
                backgroundColor: emp.pctHours > 100 ? '#ef4444' : emp.pctHours > 90 ? '#f59e0b' : '#22c55e',
              }} />
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px]">
            <span className={cn('font-semibold',
              emp.pctHours > 100 ? 'text-red-600' : emp.pctHours > 90 ? 'text-amber-600' : 'text-emerald-600'
            )}>
              {emp.pctHours}%
            </span>
            {emp.projectedHours && (
              <span className="text-gray-400">→ {emp.projectedHours}h proyect.</span>
            )}
          </div>
        </div>

        {/* Horas extra */}
        <div className="col-span-2">
          <div className="flex items-baseline gap-1">
            <span className={cn('text-[14px] font-bold',
              emp.pctOvertime > 100 ? 'text-red-600' : emp.pctOvertime > 75 ? 'text-amber-600' : 'text-gray-700'
            )}>
              {fmtH(emp.totalOvertime)}
            </span>
            <span className="text-[10px] text-gray-400">/ 80h</span>
          </div>
          <div className="h-1 rounded-full bg-gray-100 overflow-hidden mt-1">
            <div className="h-full rounded-full"
              style={{
                width: `${Math.min(100, emp.pctOvertime)}%`,
                backgroundColor: emp.pctOvertime > 100 ? '#ef4444' : emp.pctOvertime > 75 ? '#f59e0b' : '#94a3b8',
              }} />
          </div>
        </div>

        {/* Vacaciones */}
        <div className="col-span-2">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className={cn('font-bold',
              emp.vacationRemaining < 0 ? 'text-red-600' : emp.vacationRemaining <= 5 ? 'text-amber-600' : 'text-gray-700'
            )}>
              {emp.vacationRemaining}d
            </span>
            <span className="text-gray-400 text-[10px]">restantes</span>
          </div>
          <div className="text-[9px] text-gray-400 mt-0.5">
            {emp.vacationTaken}d disfrutados · {emp.vacationScheduled}d programados
          </div>
          {emp.vacationPending > 0 && (
            <div className="text-[9px] text-amber-600 mt-0.5">
              ⏳ {emp.vacationPending}d pendientes aprobación
            </div>
          )}
        </div>

        {/* Estado riesgo */}
        <div className="col-span-2 flex items-center gap-2">
          <div className="flex-1">
            <div className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border')}
              style={{ backgroundColor: risk.bg, color: risk.text, borderColor: risk.border }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: risk.dot }} />
              {risk.label}
            </div>
            <div className="text-[10px] text-gray-500 mt-1 leading-tight">{emp.riskReason}</div>
          </div>
          <button className="text-gray-300 hover:text-indigo-600 transition-colors">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Detalle expandido */}
      {expanded && (
        <div className="bg-indigo-50/30 border-y border-indigo-100 px-5 py-4 space-y-4">
          <EmployeeAnnualDetail emp={emp} year={year} currentMonth={currentMonth} />
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DETALLE EMPLEADO — Panel expandido
// ═══════════════════════════════════════════════════════════════════════════
function EmployeeAnnualDetail({ emp, year, currentMonth }: any) {
  return (
    <div className="space-y-4">

      {/* Línea de KPIs detallados */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <DetailKpi label="Turnos totales" value={emp.totalShifts.toString()} />
        <DetailKpi label="Turnos partidos" value={`${emp.totalSplit} (${emp.pctSplit}%)`} />
        <DetailKpi label="Horas nocturnas" value={fmtH(emp.totalNight)} color="text-violet-600" />
        <DetailKpi label="Horas extra" value={fmtH(emp.totalOvertime)} color="text-orange-600" />
        <DetailKpi label="Otras ausencias" value={`${emp.otherAbsencesCount} (${emp.otherAbsencesDays}d)`} />
        <DetailKpi label="Coste estimado" value={fmtMoney(emp.totalCost)} color="text-emerald-600" />
      </div>

      {/* Gráfica mensual del empleado */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[12px] font-bold text-gray-700">Horas planificadas mes a mes · {year}</h4>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-indigo-500" />
              <span>Horas planificadas</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm border-2 border-gray-400 bg-white" />
              <span>Objetivo mensual ({fmtH(emp.monthly[0].target)})</span>
            </div>
          </div>
        </div>
        <EmployeeMonthlyChart monthly={emp.monthly} currentMonth={currentMonth} />
      </div>

      {/* Resumen vacaciones detallado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sun size={14} className="text-amber-500" />
            <h4 className="text-[12px] font-bold text-gray-700">Vacaciones {year}</h4>
            <span className="text-[10px] text-gray-400 ml-auto">
              {emp.vacationType === 'NATURALES' ? '🌿 Naturales' : '💼 Laborables'}
            </span>
          </div>
          <div className="space-y-2.5">
            <ProgressLine label="Total contratado" value={emp.vacationTotal} max={emp.vacationTotal} color="#e5e7eb" />
            <ProgressLine label="Disfrutadas"      value={emp.vacationTaken} max={emp.vacationTotal} color="#10b981" />
            <ProgressLine label="Programadas"      value={emp.vacationScheduled} max={emp.vacationTotal} color="#3b82f6" />
            {emp.vacationPending > 0 && (
              <ProgressLine label="Pendientes aprob." value={emp.vacationPending} max={emp.vacationTotal} color="#f59e0b" />
            )}
            <div className="pt-2 mt-2 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-600">Saldo restante</span>
              <span className={cn('text-[14px] font-bold',
                emp.vacationRemaining < 0 ? 'text-red-600' : emp.vacationRemaining <= 5 ? 'text-amber-600' : 'text-emerald-600'
              )}>
                {emp.vacationRemaining}d
              </span>
            </div>
          </div>
        </div>

        {/* Métricas de cumplimiento horas */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} className="text-indigo-500" />
            <h4 className="text-[12px] font-bold text-gray-700">Cumplimiento horas anuales</h4>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-gray-500">Planificadas / Objetivo</span>
                <span className="font-bold text-gray-800">{fmtH(emp.totalHours)} / {emp.targetHours}h</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, emp.pctHours)}%`,
                    backgroundColor: emp.pctHours > 100 ? '#ef4444' : emp.pctHours > 90 ? '#f59e0b' : '#22c55e',
                  }} />
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                <span className={emp.pctHours > 100 ? 'text-red-600 font-bold' : ''}>{emp.pctHours}%</span> del límite anual
                {emp.projectedHours && (
                  <span className="ml-2 text-gray-400">· Proyección fin de año: <strong>{emp.projectedHours}h</strong></span>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-gray-500">Horas extra / Máximo legal</span>
                <span className="font-bold text-gray-800">{fmtH(emp.totalOvertime)} / 80h</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, emp.pctOvertime)}%`,
                    backgroundColor: emp.pctOvertime > 100 ? '#ef4444' : emp.pctOvertime > 75 ? '#f59e0b' : '#94a3b8',
                  }} />
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                Estatuto Trabajadores: máximo 80h/año
              </div>
            </div>
          </div>
        </div>

        {/* Avisos y enlaces */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={14} className="text-gray-500" />
            <h4 className="text-[12px] font-bold text-gray-700">Estado y acciones</h4>
          </div>
          <div className={cn('rounded-lg p-2.5 text-[11px] border', RISK_CFG[emp.riskLevel as keyof typeof RISK_CFG].bg && '')}
            style={{
              backgroundColor: RISK_CFG[emp.riskLevel as keyof typeof RISK_CFG].bg,
              borderColor: RISK_CFG[emp.riskLevel as keyof typeof RISK_CFG].border,
              color: RISK_CFG[emp.riskLevel as keyof typeof RISK_CFG].text,
            }}>
            <div className="font-bold mb-0.5 flex items-center gap-1">
              {RISK_CFG[emp.riskLevel as keyof typeof RISK_CFG].icon} {RISK_CFG[emp.riskLevel as keyof typeof RISK_CFG].label}
            </div>
            <div className="opacity-80">{emp.riskReason}</div>
          </div>
          <div className="mt-3 space-y-1.5">
            <Link href={`/employees/${emp.id}`}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] text-gray-600 hover:bg-gray-50 transition-colors border border-gray-200">
              <span>Ver ficha empleado</span>
              <ChevronRight size={11} />
            </Link>
            <Link href={`/absences?employee=${emp.id}`}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] text-gray-600 hover:bg-gray-50 transition-colors border border-gray-200">
              <span>Ver ausencias</span>
              <ChevronRight size={11} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MONTHLY CHART — Gráfica anual con comparativa
// ═══════════════════════════════════════════════════════════════════════════
function MonthlyChart({ monthly, prevMonthly, currentMonth }: { monthly: any[]; prevMonthly: any[]; currentMonth: number }) {
  const maxV = Math.max(
    ...monthly.map(m => m.hours),
    ...prevMonthly.map(m => m.hours),
    10
  )
  const width = 100
  const height = 30
  const groupWidth = width / 12
  const barWidth = (groupWidth - 1) / 2

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height + 6}`} className="w-full h-[200px]" preserveAspectRatio="none">
        {/* Grid */}
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1="0" y1={height * p} x2={width} y2={height * p} stroke="#f3f4f6" strokeWidth="0.15" />
        ))}

        {/* Barras */}
        {monthly.map((m, i) => {
          const hPrev = (prevMonthly[i].hours / maxV) * height
          const hCurr = (m.hours / maxV) * height
          const x = i * groupWidth
          const isCurrent = i === currentMonth
          const isFuture = currentMonth >= 0 && i > currentMonth

          return (
            <g key={i}>
              {/* Año anterior */}
              <rect
                x={x + 0.3}
                y={height - hPrev}
                width={barWidth - 0.1}
                height={hPrev}
                fill="#d1d5db"
                rx="0.4"
              >
                <title>{`${m.label} ${prevMonthly[i].hours}h (año anterior)`}</title>
              </rect>
              {/* Año actual */}
              <rect
                x={x + 0.3 + barWidth + 0.1}
                y={height - hCurr}
                width={barWidth - 0.1}
                height={hCurr}
                fill={isCurrent ? '#4338ca' : isFuture ? '#a5b4fc' : '#6366f1'}
                rx="0.4"
              >
                <title>{`${m.label} ${m.hours}h`}</title>
              </rect>

              {/* Etiqueta mes */}
              <text x={x + groupWidth / 2} y={height + 3}
                textAnchor="middle" fontSize="2"
                fill={isCurrent ? '#4338ca' : '#9ca3af'}
                fontWeight={isCurrent ? 'bold' : 'normal'}>
                {m.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MINI MONTHLY CHART
// ═══════════════════════════════════════════════════════════════════════════
function MiniMonthlyChart({ title, data, color, icon, unit = 'h' }: any) {
  const maxV = Math.max(...data.map((d: any) => d.value), 1)
  const total = data.reduce((acc: number, d: any) => acc + d.value, 0)
  const width = 100
  const height = 24

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span style={{ color }}>{icon}</span>
          <h3 className="text-[12px] font-bold text-gray-700">{title}</h3>
        </div>
        <div className="text-[13px] font-bold text-gray-800">
          {unit === 'h' ? fmtH(total) : total}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height + 4}`} className="w-full h-[60px]" preserveAspectRatio="none">
        {data.map((d: any, i: number) => {
          const h = (d.value / maxV) * height
          const x = (i / 12) * width
          return (
            <g key={i}>
              <rect
                x={x + 0.3}
                y={height - h}
                width={(width / 12) - 0.6}
                height={h}
                fill={color}
                opacity={0.85}
                rx="0.4"
              >
                <title>{`${d.label}: ${d.value}${unit}`}</title>
              </rect>
              <text x={x + (width / 12) / 2} y={height + 3}
                textAnchor="middle" fontSize="1.8" fill="#9ca3af">
                {d.label[0]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEE MONTHLY CHART
// ═══════════════════════════════════════════════════════════════════════════
function EmployeeMonthlyChart({ monthly, currentMonth }: any) {
  const maxV = Math.max(...monthly.map((m: any) => Math.max(m.hours, m.target)), 10)
  const width = 100
  const height = 30
  const barWidth = width / 12

  return (
    <svg viewBox={`0 0 ${width} ${height + 4}`} className="w-full h-[150px]" preserveAspectRatio="none">
      {/* Grid */}
      {[0.25, 0.5, 0.75].map((p, i) => (
        <line key={i} x1="0" y1={height * p} x2={width} y2={height * p} stroke="#f3f4f6" strokeWidth="0.15" />
      ))}

      {/* Línea de objetivo */}
      {monthly.map((m: any, i: number) => {
        const y = height - (m.target / maxV) * height
        const x = i * barWidth + 0.3
        return (
          <g key={`t-${i}`}>
            <line
              x1={x}
              y1={y}
              x2={x + barWidth - 0.6}
              y2={y}
              stroke="#94a3b8"
              strokeWidth="0.4"
              strokeDasharray="0.5 0.3"
            />
          </g>
        )
      })}

      {/* Barras horas */}
      {monthly.map((m: any, i: number) => {
        const h = (m.hours / maxV) * height
        const x = i * barWidth + 0.3
        const isCurrent = i === currentMonth
        const isFuture = currentMonth >= 0 && i > currentMonth
        const isOver = m.pct > 100

        return (
          <g key={i}>
            <rect
              x={x}
              y={height - h}
              width={barWidth - 0.6}
              height={h}
              fill={isOver ? '#ef4444' : isCurrent ? '#4338ca' : isFuture ? '#c7d2fe' : '#6366f1'}
              rx="0.4"
            >
              <title>{`${m.label}: ${m.hours}h (${m.pct}%)`}</title>
            </rect>
            <text x={x + (barWidth - 0.6) / 2} y={height + 3}
              textAnchor="middle" fontSize="1.8"
              fill={isCurrent ? '#4338ca' : '#9ca3af'}
              fontWeight={isCurrent ? 'bold' : 'normal'}>
              {m.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function DetailKpi({ label, value, color }: any) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
      <div className={cn('text-[14px] font-bold', color ?? 'text-gray-800')}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function ProgressLine({ label, value, max, color }: any) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-gray-700">{value}d</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}
