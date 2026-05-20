// ============================================================
// Shift Solver AI — Absence utilities (NO server-only)
// Funciones puras reutilizables en client y server
// ============================================================

import { addDays, differenceInCalendarDays, isWeekend } from 'date-fns'

export function calcDays(
  startDate: Date,
  endDate: Date,
  tipo: 'NATURALES' | 'LABORABLES',
): number {
  if (tipo === 'NATURALES') {
    return differenceInCalendarDays(endDate, startDate) + 1
  }
  // Laborables: excluir sábados y domingos
  let count = 0
  let cursor = new Date(startDate)
  while (cursor <= endDate) {
    if (!isWeekend(cursor)) count++
    cursor = addDays(cursor, 1)
  }
  return count
}

export const ABSENCE_LABELS: Record<string, string> = {
  VACACIONES:    'Vacaciones',
  BAJA:          'Baja médica',
  PERMISO:       'Permiso retribuido',
  AUSENCIA:      'Ausencia injustificada',
  ASUNTO_PROPIO: 'Asunto propio',
}

export const ABSENCE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  VACACIONES:    { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', dot: '#3b82f6' },
  BAJA:          { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', dot: '#ef4444' },
  PERMISO:       { bg: '#fefce8', text: '#854d0e', border: '#fef08a', dot: '#eab308' },
  AUSENCIA:      { bg: '#fdf4ff', text: '#6b21a8', border: '#e9d5ff', dot: '#a855f7' },
  ASUNTO_PROPIO: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', dot: '#22c55e' },
}

export const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  PENDING:  { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  APPROVED: { label: 'Aprobada',  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'Denegada', cls: 'bg-red-100 text-red-700 border-red-200' },
}
