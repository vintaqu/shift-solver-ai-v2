'use server'

// ============================================================
// Shift Solver AI — Cobertura por FECHA (alineada con planificación)
// La cobertura real vive en fechas concretas, como los turnos.
// Las plantillas (dayOfWeek) quedan como semilla inicial.
//
// Herencia: si una semana no tiene cobertura configurada, se copia
// automáticamente de la semana anterior; si tampoco existe, se genera
// desde la plantilla activa.
//
// Demanda por ROL: cada slot lleva un desglose (CoverageRoleRequirement)
// con min/ideal por rol. `minWorkers` / `idealWorkers` del slot son la suma
// denormalizada de ese desglose. TODAS las operaciones de copia arrastran
// el desglose de los slots origen mediante un único createMany.
// ============================================================

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  type RoleReqInput,
  cloneRoleRequirements,
  replaceRoleRequirements,
  resolveRoleRequirements,
  sumRoleTotals,
} from '@/lib/coverage/roles'

// ── Helpers de fechas (siempre UTC midnight para evitar shifts de zona) ─────
function toUTCDate(iso: string): Date {
  const d = new Date(iso)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function addDaysUTC(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

/** 0=Lun … 6=Dom a partir de una fecha */
function dayOfWeekMon0(date: Date): number {
  return (date.getUTCDay() + 6) % 7
}

/** Clave natural de un slot por fecha. */
const dateKey = (s: any) =>
  `${(s.date as Date).toISOString().slice(0, 10)}|${s.startTime}|${s.endTime}`

/** Clave natural de un slot de plantilla (sin fecha). */
const tplKey = (s: any) => `${s.dayOfWeek}|${s.startTime}|${s.endTime}`

/** Include estándar del desglose por rol. */
const WITH_ROLES = { roleRequirements: true } as any

// ── Obtener la cobertura de una semana ──────────────────────────────────────
export async function getWeekCoverage(locationId: string, weekStartISO: string) {
  const weekStart = toUTCDate(weekStartISO)
  const weekEnd = addDaysUTC(weekStart, 7)

  return prisma.coverageRequirement.findMany({
    where: {
      locationId,
      date: { gte: weekStart, lt: weekEnd },
    },
    include: {
      laborRole: true,
      skill: true,
      roleRequirements: { include: { laborRole: true }, orderBy: { createdAt: 'asc' } },
    } as any,
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })
}

// ── Asegurar cobertura de una semana (herencia automática) ──────────────────
// 1. Si la semana ya tiene slots → no hace nada
// 2. Si no, copia de la semana anterior
// 3. Si la anterior tampoco tiene, genera desde la plantilla activa
export async function ensureWeekCoverage(
  locationId: string,
  organizationId: string,
  weekStartISO: string,
) {
  const weekStart = toUTCDate(weekStartISO)
  const weekEnd = addDaysUTC(weekStart, 7)

  // 1. ¿Ya tiene cobertura?
  const existingCount = await prisma.coverageRequirement.count({
    where: { locationId, date: { gte: weekStart, lt: weekEnd } },
  })
  if (existingCount > 0) {
    return { source: 'existing' as const, count: existingCount }
  }

  // 2. ¿Semana anterior?
  const prevStart = addDaysUTC(weekStart, -7)
  const prevSlots = await prisma.coverageRequirement.findMany({
    where: { locationId, date: { gte: prevStart, lt: weekStart } },
    include: WITH_ROLES,
  })

  if (prevSlots.length > 0) {
    await prisma.coverageRequirement.createMany({
      data: prevSlots.map(s => ({
        locationId,
        organizationId,
        templateId: s.templateId,
        dayOfWeek: s.dayOfWeek,
        date: addDaysUTC(s.date as Date, 7),
        startTime: s.startTime,
        endTime: s.endTime,
        minWorkers: s.minWorkers,
        idealWorkers: s.idealWorkers,
        laborRoleId: s.laborRoleId,
        skillId: s.skillId,
        isRequired: s.isRequired,
        notes: s.notes,
        priority: s.priority,
      })),
    })

    const created = await prisma.coverageRequirement.findMany({
      where: { locationId, date: { gte: weekStart, lt: weekEnd } },
      select: { id: true, date: true, startTime: true, endTime: true },
    })
    // La clave de origen se desplaza +7 días para casar con el destino.
    await cloneRoleRequirements(
      prevSlots as any,
      s => `${addDaysUTC(s.date as Date, 7).toISOString().slice(0, 10)}|${s.startTime}|${s.endTime}`,
      created,
      dateKey,
    )

    revalidatePath('/coverage')
    return { source: 'previous_week' as const, count: prevSlots.length }
  }

  // 3. Generar desde la plantilla activa (patrón dayOfWeek → fechas)
  const activeTemplate = await prisma.coverageTemplate.findFirst({
    where: { locationId, isActive: true },
  })

  if (activeTemplate) {
    const templateSlots = await prisma.coverageRequirement.findMany({
      where: { locationId, templateId: activeTemplate.id, date: null },
      include: WITH_ROLES,
    })

    if (templateSlots.length > 0) {
      await prisma.coverageRequirement.createMany({
        data: templateSlots.map(s => ({
          locationId,
          organizationId,
          templateId: activeTemplate.id,
          dayOfWeek: s.dayOfWeek,
          date: addDaysUTC(weekStart, s.dayOfWeek),
          startTime: s.startTime,
          endTime: s.endTime,
          minWorkers: s.minWorkers,
          idealWorkers: s.idealWorkers,
          laborRoleId: s.laborRoleId,
          skillId: s.skillId,
          isRequired: s.isRequired,
          notes: s.notes,
          priority: s.priority,
        })),
      })

      const created = await prisma.coverageRequirement.findMany({
        where: { locationId, date: { gte: weekStart, lt: weekEnd } },
        select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
      })
      await cloneRoleRequirements(templateSlots as any, tplKey, created, tplKey)

      revalidatePath('/coverage')
      return { source: 'template' as const, count: templateSlots.length }
    }
  }

  return { source: 'empty' as const, count: 0 }
}

// ── Copiar una semana entera a otra ─────────────────────────────────────────
export async function copyWeekCoverage(
  locationId: string,
  organizationId: string,
  fromWeekStartISO: string,
  toWeekStartISO: string,
) {
  const fromStart = toUTCDate(fromWeekStartISO)
  const fromEnd = addDaysUTC(fromStart, 7)
  const toStart = toUTCDate(toWeekStartISO)
  const toEnd = addDaysUTC(toStart, 7)
  const offsetDays = Math.round((toStart.getTime() - fromStart.getTime()) / 86400000)

  const source = await prisma.coverageRequirement.findMany({
    where: { locationId, date: { gte: fromStart, lt: fromEnd } },
    include: WITH_ROLES,
  })
  if (source.length === 0) throw new Error('La semana origen no tiene cobertura configurada')

  // Reemplazar destino
  await prisma.coverageRequirement.deleteMany({
    where: { locationId, date: { gte: toStart, lt: toEnd } },
  })

  await prisma.coverageRequirement.createMany({
    data: source.map(s => ({
      locationId,
      organizationId,
      templateId: s.templateId,
      dayOfWeek: s.dayOfWeek,
      date: addDaysUTC(s.date as Date, offsetDays),
      startTime: s.startTime,
      endTime: s.endTime,
      minWorkers: s.minWorkers,
      idealWorkers: s.idealWorkers,
      laborRoleId: s.laborRoleId,
      skillId: s.skillId,
      isRequired: s.isRequired,
      notes: s.notes,
      priority: s.priority,
    })),
  })

  const created = await prisma.coverageRequirement.findMany({
    where: { locationId, date: { gte: toStart, lt: toEnd } },
    select: { id: true, date: true, startTime: true, endTime: true },
  })
  await cloneRoleRequirements(
    source as any,
    s => `${addDaysUTC(s.date as Date, offsetDays).toISOString().slice(0, 10)}|${s.startTime}|${s.endTime}`,
    created,
    dateKey,
  )

  revalidatePath('/coverage')
  return { copied: source.length }
}

// ── Copiar un día concreto a otro ───────────────────────────────────────────
export async function copyDayCoverage(
  locationId: string,
  organizationId: string,
  fromDateISO: string,
  toDateISO: string,
) {
  const fromDate = toUTCDate(fromDateISO)
  const toDate = toUTCDate(toDateISO)

  const source = await prisma.coverageRequirement.findMany({
    where: { locationId, date: fromDate },
    include: WITH_ROLES,
  })
  if (source.length === 0) throw new Error('El día origen no tiene cobertura configurada')

  await prisma.coverageRequirement.deleteMany({
    where: { locationId, date: toDate },
  })

  await prisma.coverageRequirement.createMany({
    data: source.map(s => ({
      locationId,
      organizationId,
      templateId: s.templateId,
      dayOfWeek: dayOfWeekMon0(toDate),
      date: toDate,
      startTime: s.startTime,
      endTime: s.endTime,
      minWorkers: s.minWorkers,
      idealWorkers: s.idealWorkers,
      laborRoleId: s.laborRoleId,
      skillId: s.skillId,
      isRequired: s.isRequired,
      notes: s.notes,
      priority: s.priority,
    })),
  })

  const created = await prisma.coverageRequirement.findMany({
    where: { locationId, date: toDate },
    select: { id: true, startTime: true, endTime: true },
  })
  await cloneRoleRequirements(
    source as any,
    s => `${s.startTime}|${s.endTime}`,
    created,
    t => `${t.startTime}|${t.endTime}`,
  )

  revalidatePath('/coverage')
  return { copied: source.length }
}

// ── Upsert de un slot por fecha ──────────────────────────────────────────────
export async function upsertDateSlot(data: {
  id?: string
  locationId: string
  organizationId: string
  dateISO: string
  startTime: string
  endTime: string
  minWorkers?: number
  idealWorkers?: number
  roles?: RoleReqInput[]
  laborRoleId?: string | null
  skillId?: string | null
  isRequired: boolean
  notes?: string
}) {
  const date = toUTCDate(data.dateISO)

  const roles = await resolveRoleRequirements(
    data.organizationId,
    data.roles,
    { minWorkers: data.minWorkers ?? 1, idealWorkers: data.idealWorkers ?? 1 },
    data.laborRoleId,
  )
  const totals = sumRoleTotals(roles)

  const payload = {
    locationId: data.locationId,
    organizationId: data.organizationId,
    dayOfWeek: dayOfWeekMon0(date),
    date,
    startTime: data.startTime,
    endTime: data.endTime,
    minWorkers: totals.minWorkers,
    idealWorkers: totals.idealWorkers,
    laborRoleId: data.laborRoleId || null,
    skillId: data.skillId || null,
    isRequired: data.isRequired,
    notes: data.notes || null,
  }

  let slot
  if (data.id) {
    slot = await prisma.coverageRequirement.update({ where: { id: data.id }, data: payload })
  } else {
    // Evitar duplicados: match por fecha + hora inicio
    let existing = await prisma.coverageRequirement.findFirst({
      where: { locationId: data.locationId, date, startTime: data.startTime, endTime: data.endTime },
    })
    if (!existing) {
      existing = await prisma.coverageRequirement.findFirst({
        where: { locationId: data.locationId, date, startTime: data.startTime },
      })
    }
    slot = existing
      ? await prisma.coverageRequirement.update({ where: { id: existing.id }, data: payload })
      : await prisma.coverageRequirement.create({ data: payload })
  }

  await replaceRoleRequirements([slot.id], roles)

  revalidatePath('/coverage')
  return slot
}

// ── Upsert masivo por fechas: expande rango horario en franjas de 30min ────
export async function bulkUpsertDateSlots(data: {
  locationId: string
  organizationId: string
  datesISO: string[]      // fechas concretas seleccionadas
  startTime: string
  endTime: string
  minWorkers?: number
  idealWorkers?: number
  roles?: RoleReqInput[]
  laborRoleId?: string | null
  skillId?: string | null
  isRequired: boolean
  notes?: string
}) {
  const dates = data.datesISO.map(toUTCDate)

  const roles = await resolveRoleRequirements(
    data.organizationId,
    data.roles,
    { minWorkers: data.minWorkers ?? 1, idealWorkers: data.idealWorkers ?? 1 },
    data.laborRoleId,
  )
  const totals = sumRoleTotals(roles)

  // Expandir el rango en franjas de 30 min
  const [sh, sm] = data.startTime.split(':').map(Number)
  const [eh, em] = data.endTime === '00:00' ? [24, 0] : data.endTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  if (endMin <= startMin) throw new Error('La hora de fin debe ser posterior a la de inicio')

  const fmt = (m: number) => {
    const mm = m >= 24 * 60 ? m - 24 * 60 : m
    return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
  }
  const franjas: Array<{ start: string; end: string }> = []
  for (let cur = startMin; cur < endMin; cur += 30) {
    franjas.push({ start: fmt(cur), end: fmt(Math.min(cur + 30, endMin)) })
  }

  // Slots existentes de esas fechas en una sola query
  const existing = await prisma.coverageRequirement.findMany({
    where: {
      locationId: data.locationId,
      date: { in: dates },
      startTime: { in: franjas.map(f => f.start) },
    },
  })
  const existingMap = new Map<string, any>(
    existing.map((s: any) => [`${(s.date as Date).toISOString().slice(0, 10)}|${s.startTime}`, s])
  )

  const toCreate: any[] = []
  const toUpdate: string[] = []

  for (const date of dates) {
    const dKey = date.toISOString().slice(0, 10)
    for (const f of franjas) {
      const found = existingMap.get(`${dKey}|${f.start}`)
      if (found) {
        toUpdate.push(found.id)
      } else {
        toCreate.push({
          locationId: data.locationId,
          organizationId: data.organizationId,
          dayOfWeek: dayOfWeekMon0(date),
          date,
          startTime: f.start,
          endTime: f.end,
          minWorkers: totals.minWorkers,
          idealWorkers: totals.idealWorkers,
          laborRoleId: data.laborRoleId || null,
          skillId: data.skillId || null,
          isRequired: data.isRequired,
          notes: data.notes || null,
          priority: 1,
        })
      }
    }
  }

  if (toUpdate.length > 0) {
    await prisma.coverageRequirement.updateMany({
      where: { id: { in: toUpdate } },
      data: {
        minWorkers: totals.minWorkers,
        idealWorkers: totals.idealWorkers,
        laborRoleId: data.laborRoleId || null,
        skillId: data.skillId || null,
        isRequired: data.isRequired,
        notes: data.notes || null,
      },
    })
  }

  if (toCreate.length > 0) {
    await prisma.coverageRequirement.createMany({ data: toCreate })
  }

  // Mismo desglose por rol para todos los slots afectados (2 queries en total)
  const affected = await prisma.coverageRequirement.findMany({
    where: {
      locationId: data.locationId,
      date: { in: dates },
      startTime: { in: franjas.map(f => f.start) },
    },
    select: { id: true },
  })
  await replaceRoleRequirements(affected.map(a => a.id), roles)

  revalidatePath('/coverage')
  return { updated: toUpdate.length, created: toCreate.length }
}

// ── Regenerar semana desde la plantilla activa (forzado, sobreescribe) ─────
export async function regenerateWeekFromTemplate(
  locationId: string,
  organizationId: string,
  weekStartISO: string,
) {
  const weekStart = toUTCDate(weekStartISO)
  const weekEnd = addDaysUTC(weekStart, 7)

  const activeTemplate = await prisma.coverageTemplate.findFirst({
    where: { locationId, isActive: true },
  })
  if (!activeTemplate) throw new Error('No hay ninguna plantilla activa')

  const templateSlots = await prisma.coverageRequirement.findMany({
    where: { locationId, templateId: activeTemplate.id, date: null },
    include: WITH_ROLES,
  })
  if (templateSlots.length === 0) throw new Error('La plantilla activa no tiene slots configurados')

  await prisma.coverageRequirement.deleteMany({
    where: { locationId, date: { gte: weekStart, lt: weekEnd } },
  })

  await prisma.coverageRequirement.createMany({
    data: templateSlots.map(s => ({
      locationId,
      organizationId,
      templateId: activeTemplate.id,
      dayOfWeek: s.dayOfWeek,
      date: addDaysUTC(weekStart, s.dayOfWeek),
      startTime: s.startTime,
      endTime: s.endTime,
      minWorkers: s.minWorkers,
      idealWorkers: s.idealWorkers,
      laborRoleId: s.laborRoleId,
      skillId: s.skillId,
      isRequired: s.isRequired,
      notes: s.notes,
      priority: s.priority,
    })),
  })

  const created = await prisma.coverageRequirement.findMany({
    where: { locationId, date: { gte: weekStart, lt: weekEnd } },
    select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
  })
  await cloneRoleRequirements(templateSlots as any, tplKey, created, tplKey)

  revalidatePath('/coverage')
  return { count: templateSlots.length, templateName: activeTemplate.name }
}

// ── Guardar la semana actual como plantilla reutilizable ───────────────────
export async function saveWeekAsTemplate(
  locationId: string,
  organizationId: string,
  weekStartISO: string,
  options: { name: string; description?: string; color?: string },
) {
  const weekStart = toUTCDate(weekStartISO)
  const weekEnd = addDaysUTC(weekStart, 7)

  const weekSlots = await prisma.coverageRequirement.findMany({
    where: { locationId, date: { gte: weekStart, lt: weekEnd } },
    include: WITH_ROLES,
  })
  if (weekSlots.length === 0) throw new Error('Esta semana no tiene cobertura que guardar')

  const template = await prisma.coverageTemplate.create({
    data: {
      organizationId,
      locationId,
      name: options.name,
      description: options.description || null,
      color: options.color || '#6366f1',
      isActive: false,
    } as any,
  })

  // Guardar el patrón semanal (dayOfWeek, sin fecha)
  await prisma.coverageRequirement.createMany({
    data: weekSlots.map(s => ({
      locationId,
      organizationId,
      templateId: template.id,
      dayOfWeek: s.dayOfWeek,
      date: null,
      startTime: s.startTime,
      endTime: s.endTime,
      minWorkers: s.minWorkers,
      idealWorkers: s.idealWorkers,
      laborRoleId: s.laborRoleId,
      skillId: s.skillId,
      isRequired: s.isRequired,
      notes: s.notes,
      priority: s.priority,
    })),
  })

  const created = await prisma.coverageRequirement.findMany({
    where: { locationId, templateId: template.id, date: null },
    select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
  })
  await cloneRoleRequirements(weekSlots as any, tplKey, created, tplKey)

  revalidatePath('/coverage')
  return { templateId: template.id, name: template.name, count: weekSlots.length }
}

// ── Importar una plantilla concreta a la semana actual (reemplaza) ─────────
export async function importTemplateToWeek(
  templateId: string,
  locationId: string,
  organizationId: string,
  weekStartISO: string,
) {
  const weekStart = toUTCDate(weekStartISO)
  const weekEnd = addDaysUTC(weekStart, 7)

  const template = await prisma.coverageTemplate.findUnique({ where: { id: templateId } })
  if (!template) throw new Error('Plantilla no encontrada')

  const templateSlots = await prisma.coverageRequirement.findMany({
    where: { locationId, templateId, date: null },
    include: WITH_ROLES,
  })
  if (templateSlots.length === 0) throw new Error('La plantilla no tiene slots configurados')

  await prisma.coverageRequirement.deleteMany({
    where: { locationId, date: { gte: weekStart, lt: weekEnd } },
  })

  await prisma.coverageRequirement.createMany({
    data: templateSlots.map(s => ({
      locationId,
      organizationId,
      templateId,
      dayOfWeek: s.dayOfWeek,
      date: addDaysUTC(weekStart, s.dayOfWeek),
      startTime: s.startTime,
      endTime: s.endTime,
      minWorkers: s.minWorkers,
      idealWorkers: s.idealWorkers,
      laborRoleId: s.laborRoleId,
      skillId: s.skillId,
      isRequired: s.isRequired,
      notes: s.notes,
      priority: s.priority,
    })),
  })

  const created = await prisma.coverageRequirement.findMany({
    where: { locationId, date: { gte: weekStart, lt: weekEnd } },
    select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
  })
  await cloneRoleRequirements(templateSlots as any, tplKey, created, tplKey)

  revalidatePath('/coverage')
  return { count: templateSlots.length, templateName: template.name }
}

// ── Borrar toda la cobertura de una semana ──────────────────────────────────
export async function clearWeekCoverage(locationId: string, weekStartISO: string) {
  const weekStart = toUTCDate(weekStartISO)
  const weekEnd = addDaysUTC(weekStart, 7)

  const result = await prisma.coverageRequirement.deleteMany({
    where: { locationId, date: { gte: weekStart, lt: weekEnd } },
  })

  revalidatePath('/coverage')
  return { deleted: result.count }
}

// ── Borrar un slot por fecha ─────────────────────────────────────────────────
export async function deleteDateSlot(id: string) {
  await prisma.coverageRequirement.delete({ where: { id } })
  revalidatePath('/coverage')
  return { success: true }
}

// ── Roles disponibles para el editor de desglose ────────────────────────────
export async function getLaborRolesForCoverage(organizationId: string) {
  return prisma.laborRole.findMany({
    where: { organizationId },
    select: { id: true, name: true, color: true, level: true, priority: true },
    orderBy: [{ priority: 'asc' }, { name: 'asc' }],
  })
}
