'use client'

// ============================================================
// Shift Solver AI — WeeklyScheduleGrid
// components/planning/WeeklyScheduleGrid.tsx
//
// Main weekly planner component — pieza central del producto.
// Gestiona: vista semanal, drag & drop, click to edit, validaciones.
// ============================================================

import { useState, useCallback, useTransition, useRef } from 'react'
import { format, isToday, addDays, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Lock,
  Unlock,
  AlertCircle,
  AlertTriangle,
  Plus,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Send,
  Copy,
  Trash2,
  Download,
  Filter,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ShiftEditorModal } from './ShiftEditorModal'
import { CoverageSidebar } from './CoverageSidebar'
import { ValidationPanel } from './ValidationPanel'
import { EmployeeHoursSummary } from './EmployeeHoursSummary'
import { moveAssignment, deleteAssignment, toggleAssignmentLock } from '@/server/actions/planning'
import type {
  WeeklyGridData,
  ScheduleAssignment,
  Employee,
  ShiftEditorContext,
} from '@/types'

// ---- Constants ----

const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// ---- Props ----

interface WeeklyScheduleGridProps {
  data: WeeklyGridData
  organizationId: string
  locationId: string
  onWeekChange?: (direction: 1 | -1) => void
  onPublish?: () => void
  onGenerate?: () => void
}

// ---- Main Component ----

export function WeeklyScheduleGrid({
  data,
  organizationId,
  locationId,
  onWeekChange,
  onPublish,
  onGenerate,
}: WeeklyScheduleGridProps) {
  const { planningPeriod, weekDays, employeeRows, coverageByDay } = data

  const [editorCtx, setEditorCtx] = useState<ShiftEditorContext>({ isOpen: false, mode: 'create' })
  const [dragging, setDragging] = useState<{ assignmentId: string; sourceEmpId: string; sourceDayIndex: number } | null>(null)
  const [dragOver, setDragOver] = useState<{ empId: string; dayIndex: number } | null>(null)
  const [isPending, startTransition] = useTransition()
  const dragRef = useRef<HTMLDivElement>(null)

  // ---- Editor handlers ----

  const openCreate = useCallback((employeeId: string, dayIndex: number) => {
    setEditorCtx({
      isOpen: true,
      mode: 'create',
      employeeId,
      dayIndex,
      initialValues: {
        date: weekDays[dayIndex],
        startTime: '08:00',
        endTime: '16:00',
        breakMinutes: 20,
        isLocked: false,
        isSplit: false,
      },
    })
  }, [weekDays])

  const openEdit = useCallback((assignment: ScheduleAssignment) => {
    setEditorCtx({
      isOpen: true,
      mode: 'edit',
      employeeId: assignment.employeeId,
      assignmentId: assignment.id,
      initialValues: {
        employeeId: assignment.employeeId,
        date: new Date(assignment.date),
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        breakMinutes: assignment.breakMinutes,
        laborRoleId: assignment.laborRoleId ?? undefined,
        shiftTemplateId: assignment.shiftTemplateId ?? undefined,
        notes: assignment.notes ?? undefined,
        isLocked: assignment.isLocked,
        isSplit: assignment.isSplit,
      },
    })
  }, [])

  // ---- Drag & Drop ----

  const handleDragStart = useCallback((
    e: React.DragEvent,
    assignmentId: string,
    sourceEmpId: string,
    sourceDayIndex: number,
  ) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('assignmentId', assignmentId)
    setDragging({ assignmentId, sourceEmpId, sourceDayIndex })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, empId: string, dayIndex: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver({ empId, dayIndex })
  }, [])

  const handleDrop = useCallback((
    e: React.DragEvent,
    targetEmpId: string,
    targetDayIndex: number,
  ) => {
    e.preventDefault()
    const assignmentId = e.dataTransfer.getData('assignmentId')
    if (!assignmentId || !dragging) return

    const isSameCell = dragging.sourceEmpId === targetEmpId && dragging.sourceDayIndex === targetDayIndex
    if (isSameCell) {
      setDragging(null)
      setDragOver(null)
      return
    }

    const targetDate = weekDays[targetDayIndex]

    startTransition(async () => {
      try {
        await moveAssignment(assignmentId, targetEmpId, targetDate)
        toast.success('Turno movido correctamente')
      } catch (err) {
        toast.error((err as Error).message)
      }
    })

    setDragging(null)
    setDragOver(null)
  }, [dragging, weekDays])

  // ---- Lock / Delete ----

  const handleToggleLock = useCallback((assignmentId: string) => {
    startTransition(async () => {
      try {
        await toggleAssignmentLock(assignmentId)
        toast.success('Estado del turno actualizado')
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }, [])

  const handleDelete = useCallback((assignmentId: string) => {
    if (!confirm('¿Eliminar este turno?')) return
    startTransition(async () => {
      try {
        await deleteAssignment(assignmentId)
        toast.success('Turno eliminado')
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }, [])

  // ---- Status ----

  const statusConfig = {
    DRAFT: { label: 'Borrador', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
    GENERATED: { label: 'Generado', className: 'bg-blue-50 text-blue-700 border border-blue-200' },
    REVIEWED: { label: 'Revisado', className: 'bg-violet-50 text-violet-700 border border-violet-200' },
    PUBLISHED: { label: 'Publicado', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    ARCHIVED: { label: 'Archivado', className: 'bg-gray-100 text-gray-500 border border-gray-200' },
  }
  const status = statusConfig[planningPeriod.status] ?? statusConfig.DRAFT

  return (
    <div className="flex flex-col h-full bg-[#f8f9fb]">

      {/* ---- TOPBAR ---- */}
      <header className="flex items-center justify-between bg-white border-b border-gray-100 px-4 h-[52px] flex-shrink-0 z-30">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-medium text-indigo-600 tracking-tight">
            Shift Solver <span className="text-gray-400 font-normal">AI</span>
          </span>
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium">
            <button
              className="text-gray-400 hover:text-gray-600 transition-colors"
              onClick={() => onWeekChange?.(-1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-[150px] text-center text-[13px]">
              {format(weekDays[0], "d MMM", { locale: es })} – {format(weekDays[6], "d MMM yyyy", { locale: es })}
            </span>
            <button
              className="text-gray-400 hover:text-gray-600 transition-colors"
              onClick={() => onWeekChange?.(1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <span className={cn('text-[11px] font-medium rounded-full px-2.5 py-1', status.className)}>
            {status.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
            <Copy size={13} /> Duplicar semana
          </button>
          <button
            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            onClick={onGenerate}
          >
            <Sparkles size={13} /> Generar con IA
          </button>
          <button
            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            onClick={onPublish}
            disabled={isPending}
          >
            <Send size={13} /> Publicar
          </button>
        </div>
      </header>

      {/* ---- METRICS ---- */}
      <div className="flex gap-2 px-4 py-2.5 bg-white border-b border-gray-100 flex-shrink-0">
        {[
          { label: 'Horas planificadas', value: `${data.employeeRows.reduce((a, r) => a + r.weeklyHours, 0).toFixed(0)}h`, color: 'text-emerald-600' },
          { label: 'Empleados activos', value: data.employeeRows.length.toString() },
          { label: 'Alertas', value: data.criticalIssues.toString(), color: data.criticalIssues > 0 ? 'text-red-600' : 'text-emerald-600' },
          { label: 'Horas extra', value: `${data.employeeRows.reduce((a, r) => a + (r.employee.overtimeHours ?? 0), 0).toFixed(1)}h`, color: 'text-amber-600' },
          { label: 'Cobertura', value: `${Math.round(coverageByDay.filter((c) => !c.hasGap).length / coverageByDay.length * 100)}%` },
          { label: 'Score IA', value: planningPeriod.apiScore ? `${planningPeriod.apiScore}/100` : '—' },
        ].map((m) => (
          <div key={m.label} className="bg-gray-50 rounded-lg px-3 py-2 min-w-[100px]">
            <div className="text-[11px] text-gray-400 mb-0.5">{m.label}</div>
            <div className={cn('text-[18px] font-medium', m.color ?? 'text-gray-800')}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* ---- TOOLBAR ---- */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex bg-gray-50 border border-gray-200 rounded-lg overflow-hidden text-[12px] font-medium">
          {['Semanal', 'Diaria', 'Mensual', 'Por rol'].map((v, i) => (
            <button key={v} className={cn('px-3 py-1.5 border-r border-gray-200 last:border-r-0 transition-colors', i === 0 ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100')}>
              {v}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button className="flex items-center gap-1.5 text-[12px] text-gray-600 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
          <Filter size={12} /> Filtrar
        </button>
        <button className="flex items-center gap-1.5 text-[12px] text-gray-600 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
          <Search size={12} /> Buscar
        </button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <button className="flex items-center gap-1.5 text-[12px] text-gray-500 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
          <Trash2 size={12} /> Limpiar semana
        </button>
        <button className="flex items-center gap-1.5 text-[12px] text-gray-500 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
          <Download size={12} /> Exportar
        </button>
      </div>

      {/* ---- GRID AREA ---- */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left employee names */}
        <div className="w-[180px] min-w-[180px] border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
          <div className="h-10 flex items-center px-3 border-b border-gray-200 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
            Empleado
          </div>
          {/* Coverage label row */}
          <div className="h-9 flex items-center px-3 border-b border-gray-100 bg-gray-50 text-[10px] text-gray-400 font-medium">
            Cobertura del día
          </div>
          {/* Employee rows */}
          {employeeRows.map(({ employee, weeklyHours, isOverContract }) => (
            <div
              key={employee.id}
              className="h-[72px] flex items-center px-3 gap-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                style={{ backgroundColor: employee.color }}
              >
                {employee.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium truncate">{employee.firstName} {employee.lastName.charAt(0)}.</div>
                <div className="text-[10px] text-gray-400">{employee.laborRole?.name ?? 'Camarero'}</div>
              </div>
              <div className={cn('text-[11px] font-medium ml-auto', isOverContract ? 'text-red-600' : 'text-emerald-600')}>
                {weeklyHours.toFixed(0)}h
              </div>
            </div>
          ))}
        </div>

        {/* Main scrollable grid */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-max">

            {/* Day headers */}
            <div className="flex sticky top-0 z-10 bg-white border-b border-gray-200">
              {weekDays.map((day, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-[110px] min-w-[110px] h-10 flex flex-col items-center justify-center border-r border-gray-100 text-[11px]',
                    isToday(day) && 'bg-indigo-50',
                  )}
                >
                  <span className={cn('font-medium', isToday(day) ? 'text-indigo-600' : 'text-gray-700')}>
                    {DAY_LABELS_SHORT[i]}
                  </span>
                  <span className={cn(
                    'text-[11px]',
                    isToday(day)
                      ? 'bg-indigo-600 text-white rounded-full w-[18px] h-[18px] flex items-center justify-center'
                      : 'text-gray-400',
                  )}>
                    {format(day, 'd')}
                  </span>
                </div>
              ))}
            </div>

            {/* Coverage indicator row */}
            <div className="flex h-9 bg-gray-50 border-b border-gray-100">
              {coverageByDay.map((cov, i) => (
                <div key={i} className="w-[110px] min-w-[110px] flex items-center justify-center gap-1.5 border-r border-gray-100">
                  <div className="w-[28px] h-[4px] rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${cov.percentage}%`,
                        backgroundColor: cov.hasGap ? '#d97706' : '#059669',
                      }}
                    />
                  </div>
                  <span className={cn('text-[10px] font-medium', cov.hasGap ? 'text-amber-600' : 'text-emerald-600')}>
                    {cov.achieved}/{cov.required}
                  </span>
                </div>
              ))}
            </div>

            {/* Employee rows */}
            {employeeRows.map(({ employee, assignments }) => (
              <div key={employee.id} className="flex border-b border-gray-100 group">
                {assignments.map((assignment, dayIndex) => {
                  const isDropTarget = dragOver?.empId === employee.id && dragOver?.dayIndex === dayIndex
                  const isRestDay = !assignment && employee.contract?.contractType === 'OWNER' && dayIndex >= 5

                  return (
                    <div
                      key={dayIndex}
                      className={cn(
                        'w-[110px] min-w-[110px] h-[72px] border-r border-gray-100 p-1 relative transition-colors',
                        'cursor-pointer',
                        isToday(weekDays[dayIndex]) && 'bg-indigo-50/40',
                        isRestDay && 'bg-gray-50',
                        isDropTarget && 'bg-indigo-100 border-indigo-300',
                        !assignment && !isRestDay && 'hover:bg-indigo-50 group-hover:bg-gray-50',
                      )}
                      onClick={() => !assignment && openCreate(employee.id, dayIndex)}
                      onDragOver={(e) => handleDragOver(e, employee.id, dayIndex)}
                      onDrop={(e) => handleDrop(e, employee.id, dayIndex)}
                      onDragLeave={() => setDragOver(null)}
                    >
                      {isRestDay && (
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] text-gray-300 font-medium">
                          Libre
                        </span>
                      )}

                      {!assignment && !isRestDay && (
                        <span className="absolute inset-0 flex items-center justify-center text-gray-200 text-xl opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity">
                          +
                        </span>
                      )}

                      {assignment && (
                        <ShiftCard
                          assignment={assignment}
                          onClick={() => openEdit(assignment)}
                          onDragStart={(e) => handleDragStart(e, assignment.id, employee.id, dayIndex)}
                          onToggleLock={() => handleToggleLock(assignment.id)}
                          onDelete={() => handleDelete(assignment.id)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right validation panel */}
        <ValidationPanel
          issues={planningPeriod.validationIssues}
          employeeRows={employeeRows}
        />
      </div>

      {/* ---- SHIFT EDITOR MODAL ---- */}
      <ShiftEditorModal
        context={editorCtx}
        planningPeriodId={planningPeriod.id}
        employees={employeeRows.map((r) => r.employee)}
        weekDays={weekDays}
        onClose={() => setEditorCtx({ isOpen: false, mode: 'create' })}
      />
    </div>
  )
}

// ---- ShiftCard sub-component ----

interface ShiftCardProps {
  assignment: ScheduleAssignment
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onToggleLock: () => void
  onDelete: () => void
}

function ShiftCard({ assignment, onClick, onDragStart, onToggleLock, onDelete }: ShiftCardProps) {
  const [showActions, setShowActions] = useState(false)

  const hasConflict = false // populated from validation issues in full impl
  const bgColor = assignment.laborRole?.color
    ? `${assignment.laborRole.color}22`
    : '#ede9fe'
  const textColor = assignment.laborRole?.color ?? '#4f46e5'

  return (
    <div
      className="h-full rounded-[6px] p-1.5 cursor-grab active:cursor-grabbing relative flex flex-col justify-between select-none"
      style={{ backgroundColor: bgColor }}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Conflict indicator */}
      {hasConflict && (
        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500 ring-1 ring-white" />
      )}

      {/* Locked indicator */}
      {assignment.isLocked && (
        <div className="absolute bottom-1.5 right-1.5">
          <Lock size={8} style={{ color: textColor, opacity: 0.5 }} />
        </div>
      )}

      {/* Origin badge */}
      {assignment.origin === 'AUTOMATIC' && (
        <div className="absolute top-1.5 left-1.5">
          <Sparkles size={8} style={{ color: textColor, opacity: 0.6 }} />
        </div>
      )}

      <div className="text-[10px] font-semibold leading-none" style={{ color: textColor }}>
        {assignment.startTime}–{assignment.endTime}
      </div>
      <div className="text-[9px] font-medium mt-0.5 opacity-80 leading-none" style={{ color: textColor }}>
        {assignment.shiftTemplate?.code ?? (assignment.isSplit ? 'PARTIDO' : 'MANUAL')}
      </div>

      {/* Skill badges */}
      {(assignment.laborRole?.name) && (
        <div className="flex gap-0.5 flex-wrap mt-auto">
          <span
            className="text-[8px] font-semibold rounded-[3px] px-1 py-0.5"
            style={{ backgroundColor: `${textColor}22`, color: textColor }}
          >
            {assignment.laborRole.name}
          </span>
        </div>
      )}

      {/* Hover actions */}
      {showActions && (
        <div
          className="absolute inset-x-0 -top-6 flex items-center justify-center gap-1 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-5 h-5 rounded bg-white border border-gray-200 flex items-center justify-center shadow-sm hover:bg-gray-50"
            onClick={onToggleLock}
            title={assignment.isLocked ? 'Desbloquear' : 'Bloquear'}
          >
            {assignment.isLocked ? <Unlock size={9} /> : <Lock size={9} />}
          </button>
          <button
            className="w-5 h-5 rounded bg-white border border-red-200 flex items-center justify-center shadow-sm hover:bg-red-50 text-red-500"
            onClick={onDelete}
            title="Eliminar turno"
          >
            <Trash2 size={9} />
          </button>
        </div>
      )}
    </div>
  )
}
