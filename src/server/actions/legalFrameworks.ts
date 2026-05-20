'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { LegalRules } from '@/lib/legalFrameworks'

// ── Obtener el marco legal efectivo de un empleado ─────────────────────────
// Resuelve: empleado → org → framework con merge de customRules
export async function getEffectiveRules(employeeId: string): Promise<{
  rules: LegalRules
  frameworkName: string
  frameworkCode: string
  skipValidation: boolean
  customized: boolean
} | null> {

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      legalFramework: true,
      organization: {
        include: {
          legalFrameworks: {
            where: { isDefault: true },
            include: { legalFramework: true },
            take: 1,
          },
        },
      },
    },
  })

  if (!employee) return null

  // Si tiene validación desactivada → no aplicar reglas
  if (employee.skipLegalValidation) {
    return {
      rules: {} as LegalRules,
      frameworkName: 'Sin validación',
      frameworkCode: 'NONE',
      skipValidation: true,
      customized: false,
    }
  }

  // Marco del empleado o el de la organización por defecto
  const framework = employee.legalFramework
    ?? employee.organization.legalFrameworks[0]?.legalFramework

  if (!framework) return null

  const baseRules = framework.rules as LegalRules

  // Aplicar customRules de la organización (solo valores más favorables)
  const orgCustom = employee.organization.legalFrameworks[0]?.customRules as Partial<LegalRules> | null
  const effectiveRules = orgCustom
    ? mergeRulesFavorable(baseRules, orgCustom)
    : baseRules

  return {
    rules: effectiveRules,
    frameworkName: framework.name,
    frameworkCode: framework.code,
    skipValidation: false,
    customized: !!orgCustom,
  }
}

// Merge: siempre gana el valor más favorable para el trabajador
function mergeRulesFavorable(base: LegalRules, custom: Partial<LegalRules>): LegalRules {
  const result = { ...base }
  const numericLower = ['maxDailyHours','maxWeeklyHours','maxAnnualHours','maxOvertimeAnnual','maxConsecutiveDays','breakRequiredAfterHours','splitShiftMaxTotal','splitShiftMaxBlock','nightWorkerMaxHours']
  const numericHigher = ['minRestBetweenShifts','minWeeklyRestHours','minWeeklyRestDays','breakMinutes','splitShiftMinBlock','splitShiftMinRest','vacationDaysMin']

  for (const key of numericLower) {
    if (custom[key as keyof LegalRules] !== undefined) {
      const c = custom[key as keyof LegalRules] as number
      const b = base[key as keyof LegalRules] as number
      ;(result as any)[key] = Math.min(b, c)  // más favorable = valor menor
    }
  }
  for (const key of numericHigher) {
    if (custom[key as keyof LegalRules] !== undefined) {
      const c = custom[key as keyof LegalRules] as number
      const b = base[key as keyof LegalRules] as number
      ;(result as any)[key] = Math.max(b, c)  // más favorable = valor mayor
    }
  }
  return result
}

// ── CRUD marcos legales (solo Super Admin) ────────────────────────────────

export async function getLegalFrameworks(includeInactive = true) {
  return prisma.legalFramework.findMany({
    where: includeInactive ? undefined : { isActive: true },
    include: { _count: { select: { employees: true, organizations: true } } },
    orderBy: [{ isActive: 'desc' }, { scope: 'asc' }, { name: 'asc' }],
  })
}

export async function upsertLegalFramework(data: {
  id?: string
  code: string
  name: string
  description?: string
  scope: string
  sector?: string | null
  province?: string | null
  rules: LegalRules
}) {
  const payload = {
    code: data.code.toUpperCase().replace(/\s/g, '_'),
    name: data.name.trim(),
    description: data.description?.trim() || null,
    scope: data.scope,
    sector: data.sector || null,
    province: data.province || null,
    rules: data.rules as object,
    isActive: true,
    isEditable: true,
  }

  const framework = data.id
    ? await prisma.legalFramework.update({ where: { id: data.id }, data: payload })
    : await prisma.legalFramework.create({ data: payload })

  revalidatePath('/admin/legal')
  return framework
}

export async function toggleLegalFramework(id: string) {
  const f = await prisma.legalFramework.findUnique({ where: { id } })
  if (!f) throw new Error('Marco no encontrado')
  const updated = await prisma.legalFramework.update({
    where: { id },
    data: { isActive: !f.isActive },
  })
  revalidatePath('/admin/legal')
  return updated
}

// ── Asignar marco legal a organización ───────────────────────────────────

export async function setOrganizationFramework(
  organizationId: string,
  legalFrameworkId: string,
  customRules?: Partial<LegalRules> | null,
) {
  // Marcar todas las anteriores como no default
  await prisma.organizationLegalFramework.updateMany({
    where: { organizationId },
    data: { isDefault: false },
  })

  const existing = await prisma.organizationLegalFramework.findFirst({
    where: { organizationId, legalFrameworkId },
  })

  if (existing) {
    await prisma.organizationLegalFramework.update({
      where: { id: existing.id },
      data: { isDefault: true, customRules: customRules as object ?? undefined },
    })
  } else {
    await prisma.organizationLegalFramework.create({
      data: {
        organizationId,
        legalFrameworkId,
        isDefault: true,
        customRules: customRules as object ?? undefined,
      },
    })
  }

  revalidatePath('/settings')
  return { success: true }
}

// ── Asignar marco legal a empleado individual ────────────────────────────

export async function setEmployeeFramework(
  employeeId: string,
  legalFrameworkId: string | null,   // null = usar el de la organización
  skipLegalValidation: boolean,
) {
  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      legalFrameworkId,
      skipLegalValidation,
    },
  })
  revalidatePath(`/employees/${employeeId}`)
  return { success: true }
}

// ── Validar turno contra las reglas del empleado ─────────────────────────

export interface ValidationResult {
  valid: boolean
  violations: Array<{
    rule: string
    severity: 'BLOCKING' | 'WARNING' | 'INFO'
    message: string
    reference: string
  }>
}

export async function validateShiftAgainstFramework(
  employeeId: string,
  shiftDate: Date,
  startTime: string,
  endTime: string,
  breakMinutes: number,
  weekAssignments: Array<{ date: Date; startTime: string; endTime: string; breakMinutes: number }>,
): Promise<ValidationResult> {
  const effectiveRules = await getEffectiveRules(employeeId)

  if (!effectiveRules || effectiveRules.skipValidation) {
    return { valid: true, violations: [] }
  }

  const { rules, frameworkCode } = effectiveRules
  const violations: ValidationResult['violations'] = []

  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const durationH = (s: string, e: string, brk = 0) => {
    let sm = toMin(s), em = toMin(e)
    if (em <= sm) em += 24 * 60
    return Math.max(0, (em - sm - brk) / 60)
  }

  const shiftDuration = durationH(startTime, endTime, breakMinutes)

  // 1. Máximo de horas/día
  if (shiftDuration > rules.maxDailyHours) {
    violations.push({
      rule: 'MAX_DAILY_HOURS',
      severity: 'BLOCKING',
      message: `Jornada de ${shiftDuration.toFixed(1)}h supera el máximo de ${rules.maxDailyHours}h/día`,
      reference: rules.references.maxDailyHours ?? '',
    })
  }

  // 2. Pausa obligatoria
  const netDuration = durationH(startTime, endTime, 0)
  if (netDuration > rules.breakRequiredAfterHours && breakMinutes < rules.breakMinutes) {
    violations.push({
      rule: 'BREAK_REQUIRED',
      severity: 'WARNING',
      message: `Jornada de ${netDuration.toFixed(1)}h sin pausa de ${rules.breakMinutes} min obligatoria`,
      reference: rules.references.breakRequiredAfterHours ?? '',
    })
  }

  // 3. Nocturnidad
  const nightStartMin = toMin(rules.nightStart)
  const nightEndMin = toMin(rules.nightEnd) + (toMin(rules.nightEnd) < nightStartMin ? 24 * 60 : 0)
  const shiftEndMin = toMin(endTime) <= toMin(startTime) ? toMin(endTime) + 24 * 60 : toMin(endTime)
  const isNocturnal = shiftEndMin > nightStartMin || toMin(startTime) < toMin(rules.nightEnd)
  if (isNocturnal && shiftDuration > rules.nightWorkerMaxHours) {
    violations.push({
      rule: 'NIGHT_WORKER_MAX',
      severity: 'WARNING',
      message: `Turno nocturno de ${shiftDuration.toFixed(1)}h supera el límite de ${rules.nightWorkerMaxHours}h para trabajadores nocturnos`,
      reference: rules.references.nightWorkerMaxHours ?? '',
    })
  }

  // 4. Descanso entre jornadas (con el turno previo en la semana)
  const dayMs = 24 * 60 * 60 * 1000
  const sortedAssignments = [...weekAssignments].sort((a, b) => a.date.getTime() - b.date.getTime())
  const prevShift = sortedAssignments.filter(a => a.date.getTime() < shiftDate.getTime()).at(-1)

  if (prevShift) {
    const prevEndMs = prevShift.date.getTime() + toMin(prevShift.endTime) * 60 * 1000
    const currStartMs = shiftDate.getTime() + toMin(startTime) * 60 * 1000
    const restH = (currStartMs - prevEndMs) / 3600000
    if (restH < rules.minRestBetweenShifts) {
      violations.push({
        rule: 'MIN_REST_BETWEEN_SHIFTS',
        severity: 'BLOCKING',
        message: `Solo ${restH.toFixed(1)}h de descanso entre jornadas (mínimo ${rules.minRestBetweenShifts}h)`,
        reference: rules.references.minRestBetweenShifts ?? '',
      })
    }
  }

  // 5. Días consecutivos
  const consecutiveDays = countConsecutiveDays(weekAssignments, shiftDate)
  if (consecutiveDays > rules.maxConsecutiveDays) {
    violations.push({
      rule: 'MAX_CONSECUTIVE_DAYS',
      severity: 'WARNING',
      message: `${consecutiveDays} días consecutivos trabajando (máximo ${rules.maxConsecutiveDays})`,
      reference: rules.references.maxConsecutiveDays ?? `Máximo ${rules.maxConsecutiveDays} días consecutivos`,
    })
  }

  // 6. Horas semanales
  const weeklyH = weekAssignments.reduce((a, s) => a + durationH(s.startTime, s.endTime, s.breakMinutes), 0) + shiftDuration
  if (weeklyH > rules.maxWeeklyHours) {
    violations.push({
      rule: 'MAX_WEEKLY_HOURS',
      severity: 'WARNING',
      message: `${weeklyH.toFixed(1)}h semanales superan el máximo de ${rules.maxWeeklyHours}h`,
      reference: rules.references.maxWeeklyHours ?? '',
    })
  }

  return {
    valid: violations.filter(v => v.severity === 'BLOCKING').length === 0,
    violations,
  }
}

function countConsecutiveDays(
  assignments: Array<{ date: Date }>,
  targetDate: Date,
): number {
  const dayMs = 24 * 60 * 60 * 1000
  const dates = new Set([
    ...assignments.map(a => Math.floor(a.date.getTime() / dayMs)),
    Math.floor(targetDate.getTime() / dayMs),
  ])

  let count = 1
  const target = Math.floor(targetDate.getTime() / dayMs)
  let d = target - 1
  while (dates.has(d)) { count++; d-- }
  d = target + 1
  while (dates.has(d)) { count++; d++ }
  return count
}
