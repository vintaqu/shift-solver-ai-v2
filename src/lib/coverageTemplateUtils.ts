// Shift Solver AI — Coverage Template utilities
// Funciones puras reutilizables en client y server

export function evaluateTemplateStatus(template: {
  isActive: boolean
  activationType: string | null
  activeUntil: string | Date | null
  scheduledFrom: string | Date | null
  scheduledTo: string | Date | null
}): 'active' | 'scheduled_upcoming' | 'scheduled_active' | 'inactive' {
  const now = new Date()

  if (!template.isActive) return 'inactive'

  if (template.activationType === 'MANUAL') {
    if (template.activeUntil && new Date(template.activeUntil) < now) return 'inactive'
    return 'active'
  }

  if (template.activationType === 'SCHEDULED') {
    if (!template.scheduledFrom || !template.scheduledTo) return 'inactive'
    const from = new Date(template.scheduledFrom)
    const to = new Date(template.scheduledTo)
    if (now < from) return 'scheduled_upcoming'
    if (now >= from && now <= to) return 'scheduled_active'
    return 'inactive'
  }

  return 'active'
}
