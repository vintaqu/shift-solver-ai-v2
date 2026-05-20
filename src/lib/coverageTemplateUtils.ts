// ============================================================
// Shift Solver AI — Coverage Template utilities (NO server-only)
// Funciones puras reutilizables en client y server
// ============================================================

export function evaluateTemplateStatus(template: {
  isDefault: boolean
  isActive: boolean
  activationType: string | null
  activeUntil: string | Date | null
  schedStartMonth: number | null
  schedStartDay: number | null
  schedEndMonth: number | null
  schedEndDay: number | null
}): 'active' | 'scheduled_upcoming' | 'scheduled_active' | 'inactive' | 'default' {
  const now = new Date()

  if (template.isDefault && !template.isActive) return 'default'

  if (template.isActive) {
    if (template.activationType === 'MANUAL') {
      if (template.activeUntil && new Date(template.activeUntil) < now) return 'inactive'
      return 'active'
    }
    if (template.activationType === 'SCHEDULED') {
      return isInScheduledRange(template, now) ? 'scheduled_active' : 'inactive'
    }
  }

  if (
    template.activationType === 'SCHEDULED' &&
    template.schedStartMonth && template.schedStartDay &&
    template.schedEndMonth && template.schedEndDay &&
    isScheduledSoon(template, now)
  ) return 'scheduled_upcoming'

  return 'inactive'
}

export function isInScheduledRange(t: {
  schedStartMonth: number | null
  schedStartDay: number | null
  schedEndMonth: number | null
  schedEndDay: number | null
}, now: Date): boolean {
  if (!t.schedStartMonth || !t.schedStartDay || !t.schedEndMonth || !t.schedEndDay) return false
  const month = now.getMonth() + 1
  const day   = now.getDate()
  const startM = t.schedStartMonth, startD = t.schedStartDay
  const endM   = t.schedEndMonth,   endD   = t.schedEndDay

  if (startM <= endM) {
    return (month > startM || (month === startM && day >= startD)) &&
           (month < endM   || (month === endM   && day <= endD))
  }
  // Rango con cruce de año (ej: Nov–Feb)
  return (month > startM || (month === startM && day >= startD)) ||
         (month < endM   || (month === endM   && day <= endD))
}

export function isScheduledSoon(t: {
  schedStartMonth: number | null
  schedStartDay: number | null
}, now: Date): boolean {
  const soon = new Date(now)
  soon.setDate(soon.getDate() + 30)
  const month = soon.getMonth() + 1
  const day   = soon.getDate()
  return !!t.schedStartMonth && (month > t.schedStartMonth || (month === t.schedStartMonth && day >= (t.schedStartDay ?? 1)))
}
