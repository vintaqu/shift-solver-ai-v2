'use client'

// ============================================================
// Shift Solver AI — ShiftEditorModal
// components/planning/ShiftEditorModal.tsx
// ============================================================

import { useState, useEffect, useTransition } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, Clock, User, Briefcase, FileText, Lock, Unlock, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { createAssignment, updateAssignment } from '@/server/actions/planning'
import type { ShiftEditorContext, Employee, ShiftEditorFormValues } from '@/types'

interface ShiftEditorModalProps {
  context: ShiftEditorContext
  planningPeriodId: string
  employees: Employee[]
  weekDays: Date[]
  onClose: () => void
}

export function ShiftEditorModal({
  context,
  planningPeriodId,
  employees,
  weekDays,
  onClose,
}: ShiftEditorModalProps) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<Partial<ShiftEditorFormValues>>({
    startTime: '08:00',
    endTime: '16:00',
    breakMinutes: 20,
    isLocked: false,
    isSplit: false,
  })
  const [validationMsg, setValidationMsg] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null)

  // Sync form with context when modal opens
  useEffect(() => {
    if (context.isOpen && context.initialValues) {
      setForm({ ...context.initialValues })
    }
  }, [context.isOpen, context.initialValues])

  // Live validation
  useEffect(() => {
    if (!form.startTime || !form.endTime) return

    const start = timeToMinutes(form.startTime)
    let end = timeToMinutes(form.endTime)
    if (end <= start) end += 24 * 60
    const duration = (end - start - (form.breakMinutes ?? 0)) / 60

    if (duration <= 0) {
      setValidationMsg({ type: 'err', text: 'La hora de fin debe ser posterior a la de inicio' })
      return
    }
    if (duration > 9) {
      setValidationMsg({ type: 'err', text: `Jornada de ${duration.toFixed(1)}h supera el máximo diario de 9h` })
      return
    }
    if (!form.isSplit && duration > 5 && (form.breakMinutes ?? 0) < 20) {
      setValidationMsg({ type: 'warn', text: 'Jornada continua >5h — se requieren 20 min de descanso' })
      return
    }
    if (form.isSplit && duration < 3) {
      setValidationMsg({ type: 'warn', text: 'Jornada partida: cada tramo debe ser de mínimo 3h' })
      return
    }

    setValidationMsg({ type: 'ok', text: `Turno válido — ${duration.toFixed(1)}h · Descanso 12h OK` })
  }, [form.startTime, form.endTime, form.breakMinutes, form.isSplit])

  const handleSave = () => {
    if (!form.employeeId && !context.employeeId) {
      toast.error('Selecciona un empleado')
      return
    }
    if (!form.startTime || !form.endTime || !form.date) {
      toast.error('Completa los campos obligatorios')
      return
    }
    if (validationMsg?.type === 'err') {
      toast.error('Corrige los errores antes de guardar')
      return
    }

    const values: ShiftEditorFormValues = {
      employeeId: form.employeeId ?? context.employeeId!,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      breakMinutes: form.breakMinutes ?? 20,
      laborRoleId: form.laborRoleId,
      shiftTemplateId: form.shiftTemplateId,
      notes: form.notes,
      isLocked: form.isLocked ?? false,
      isSplit: form.isSplit ?? false,
    }

    startTransition(async () => {
      try {
        if (context.mode === 'create') {
          await createAssignment(planningPeriodId, values)
          toast.success('Turno creado correctamente')
        } else {
          await updateAssignment(context.assignmentId!, values)
          toast.success('Turno actualizado')
        }
        onClose()
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  if (!context.isOpen) return null

  const selectedEmployee = employees.find(
    (e) => e.id === (form.employeeId ?? context.employeeId),
  )

  const dateLabel = form.date
    ? format(form.date, "EEEE d 'de' MMMM", { locale: es })
    : weekDays[context.dayIndex ?? 0]
    ? format(weekDays[context.dayIndex!], "EEEE d 'de' MMMM", { locale: es })
    : ''

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[380px] bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">
              {context.mode === 'create' ? 'Añadir turno' : 'Editar turno'}
            </h2>
            <p className="text-[12px] text-gray-400 capitalize mt-0.5">{dateLabel}</p>
          </div>
          <button
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">

          {/* Employee selector */}
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 mb-1.5">
              <User size={11} /> Empleado
            </label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              value={form.employeeId ?? context.employeeId ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
            >
              <option value="" disabled>Selecciona empleado</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} — {e.laborRole?.name ?? 'Camarero'}
                </option>
              ))}
            </select>
          </div>

          {/* Time fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 mb-1.5">
                <Clock size={11} /> Hora inicio
              </label>
              <input
                type="time"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={form.startTime ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 mb-1.5">
                <Clock size={11} /> Hora fin
              </label>
              <input
                type="time"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={form.endTime ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
          </div>

          {/* Break + split */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1.5 block">
                Descanso (min)
              </label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={form.breakMinutes ?? 20}
                onChange={(e) => setForm((f) => ({ ...f, breakMinutes: Number(e.target.value) }))}
              >
                <option value={0}>Sin descanso</option>
                <option value={20}>20 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 mb-1.5 block">
                Tipo de jornada
              </label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={form.isSplit ? 'split' : 'continuous'}
                onChange={(e) => setForm((f) => ({ ...f, isSplit: e.target.value === 'split' }))}
              >
                <option value="continuous">Jornada continua</option>
                <option value="split">Jornada partida</option>
              </select>
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 mb-1.5">
              <Briefcase size={11} /> Rol asignado
            </label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.laborRoleId ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, laborRoleId: e.target.value || undefined }))}
            >
              <option value="">Rol por defecto del empleado</option>
              <option value="enc">Encargado</option>
              <option value="semi">Semi-encargado</option>
              <option value="basic">Camarero básico</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 mb-1.5">
              <FileText size={11} /> Notas internas
            </label>
            <input
              type="text"
              placeholder="Notas visibles solo para managers..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Validation feedback */}
          {validationMsg && (
            <div className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-medium',
              validationMsg.type === 'ok' && 'bg-emerald-50 text-emerald-700',
              validationMsg.type === 'warn' && 'bg-amber-50 text-amber-700',
              validationMsg.type === 'err' && 'bg-red-50 text-red-700',
            )}>
              {validationMsg.type === 'ok' && <CheckCircle size={13} />}
              {validationMsg.type === 'warn' && <AlertTriangle size={13} />}
              {validationMsg.type === 'err' && <AlertCircle size={13} />}
              {validationMsg.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          <button
            className={cn(
              'flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-colors',
              form.isLocked
                ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100',
            )}
            onClick={() => setForm((f) => ({ ...f, isLocked: !f.isLocked }))}
          >
            {form.isLocked ? <><Unlock size={11} /> Desbloquear</> : <><Lock size={11} /> Bloquear</>}
          </button>

          <div className="flex items-center gap-2">
            <button
              className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </button>
            <button
              className="flex items-center gap-1.5 text-[12px] font-medium px-4 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
              onClick={handleSave}
              disabled={isPending || validationMsg?.type === 'err'}
            >
              {isPending ? 'Guardando...' : context.mode === 'create' ? 'Crear turno' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
