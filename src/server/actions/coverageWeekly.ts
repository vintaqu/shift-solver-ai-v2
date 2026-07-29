'use server'

// ============================================================
// Shift Solver AI — Cobertura por FECHA (alineada con planificación)
// La cobertura real vive en fechas concretas, como los turnos.
//
// Modelo "lienzo en blanco": cada semana parte vacía. No hay plantillas ni
// herencia automática entre semanas; el usuario pinta la cobertura de cada
// semana a mano.
//
// Demanda por ROL: cada slot lleva un desglose (CoverageRoleRequirement)
// con min/ideal por rol. `minWorkers` / `idealWorkers` del slot son la suma
// denormalizada de ese desglose.
// ============================================================

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  type RoleReqInput,
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

// ── Asegurar cobertura de una semana ────────────────────────────────────────
// Modelo "lienzo en blanco": cada semana parte vacía. Ya NO se hereda de la
// semana anterior ni de plantillas. Esta función se conserva por compatibilidad
// con las pages que la llaman, pero solo informa de si la semana tiene o no
// cobertura ya pintada; nunca crea slots automáticamente.
export async function ensureWeekCoverage(
  locationId: string,
  _organizationId: string,
  weekStartISO: string,
) {
  const weekStart = toUTCDate(weekStartISO)
  const weekEnd = addDaysUTC(weekStart, 7)

  const existingCount = await prisma.coverageRequirement.count({
    where: { locationId, date: { gte: weekStart, lt: weekEnd } },
  })

  return {
    source: existingCount > 0 ? ('existing' as const) : ('empty' as const),
    count: existingCount,
  }
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

// ── Guardar el borrador completo de una semana (reemplaza) ──────────────────
// Modelo de edición en front: el usuario pinta toda la semana en local y aquí
// se persiste de golpe. Reemplaza TODA la cobertura de la semana por el
// borrador recibido (borra lo que había + crea el borrador) en una transacción.
export interface DraftSlotInput {
  startTime: string
  endTime: string
  isRequired: boolean
  notes?: string | null
  roles: RoleReqInput[]        // desglose por rol (fuente de verdad)
  dateISO: string              // fecha del slot (día concreto de la semana)
}

export async function saveWeekCoverage(data: {
  locationId: string
  organizationId: string
  weekStartISO: string
  slots: DraftSlotInput[]
}) {
  const weekStart = toUTCDate(data.weekStartISO)
  const weekEnd = addDaysUTC(weekStart, 7)

  // Resolver roles y totales de cada slot ANTES de la transacción.
  const prepared = await Promise.all(
    data.slots.map(async s => {
      const roles = await resolveRoleRequirements(
        data.organizationId, s.roles, { minWorkers: 1, idealWorkers: 1 },
      )
      const totals = sumRoleTotals(roles)
      const date = toUTCDate(s.dateISO)
      return {
        roles,
        row: {
          locationId: data.locationId,
          organizationId: data.organizationId,
          dayOfWeek: dayOfWeekMon0(date),
          date,
          startTime: s.startTime,
          endTime: s.endTime,
          minWorkers: totals.minWorkers,
          idealWorkers: totals.idealWorkers,
          isRequired: s.isRequired,
          notes: s.notes || null,
          priority: 1,
        },
      }
    }),
  )

  // Borrar la cobertura actual de la semana (los role-requirements caen por cascade).
  await prisma.coverageRequirement.deleteMany({
    where: { locationId: data.locationId, date: { gte: weekStart, lt: weekEnd } },
  })

  if (prepared.length === 0) {
    revalidatePath('/coverage')
    return { saved: 0 }
  }

  // Crear los slots. createMany no devuelve ids, así que luego re-consultamos
  // para asignar el desglose por rol, emparejando por (fecha|inicio|fin).
  await prisma.coverageRequirement.createMany({ data: prepared.map(p => p.row) })

  const created = await prisma.coverageRequirement.findMany({
    where: { locationId: data.locationId, date: { gte: weekStart, lt: weekEnd } },
    select: { id: true, date: true, startTime: true, endTime: true },
  })
  const keyOf = (d: Date | string, st: string, en: string) =>
    `${(d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10)}|${st}|${en}`
  const idByKey = new Map<string, string>()
  for (const c of created) idByKey.set(keyOf(c.date as Date, c.startTime, c.endTime), c.id)

  // Volcar todos los role-requirements en un solo createMany.
  const roleRows: any[] = []
  for (const p of prepared) {
    const id = idByKey.get(keyOf(p.row.date, p.row.startTime, p.row.endTime))
    if (!id) continue
    for (const r of p.roles) {
      roleRows.push({
        coverageRequirementId: id,
        laborRoleId: r.laborRoleId,
        minWorkers: r.minWorkers,
        idealWorkers: r.idealWorkers,
      })
    }
  }
  if (roleRows.length > 0) {
    await (prisma as any).coverageRoleRequirement.createMany({ data: roleRows, skipDuplicates: true })
  }

  revalidatePath('/coverage')
  return { saved: prepared.length }
}

// ── Copiar N semanas origen a semanas destino consecutivas ──────────────────
// Se seleccionan una o varias semanas (por su lunes ISO) y un lunes destino.
// Las semanas origen se pegan consecutivas a partir del destino, en el mismo
// orden cronológico. Reemplaza la cobertura de cada semana destino.
export async function copyWeeksCoverage(data: {
  locationId: string
  organizationId: string
  sourceWeekMondaysISO: string[]   // lunes de cada semana origen
  targetWeekMondayISO: string      // lunes de la primera semana destino
}) {
  const sources = [...data.sourceWeekMondaysISO]
    .map(toUTCDate)
    .sort((a, b) => a.getTime() - b.getTime())
  if (sources.length === 0) throw new Error('Selecciona al menos una semana de origen')

  const targetStart = toUTCDate(data.targetWeekMondayISO)

  let totalCopied = 0

  for (let i = 0; i < sources.length; i++) {
    const srcStart = sources[i]
    const srcEnd = addDaysUTC(srcStart, 7)
    const dstStart = addDaysUTC(targetStart, i * 7)
    const dstEnd = addDaysUTC(dstStart, 7)
    const offsetDays = Math.round((dstStart.getTime() - srcStart.getTime()) / 86400000)

    const srcSlots = await prisma.coverageRequirement.findMany({
      where: { locationId: data.locationId, date: { gte: srcStart, lt: srcEnd } },
      include: { roleRequirements: true } as any,
    })

    // Reemplazar la semana destino (aunque el origen esté vacío → destino vacío).
    await prisma.coverageRequirement.deleteMany({
      where: { locationId: data.locationId, date: { gte: dstStart, lt: dstEnd } },
    })

    if (srcSlots.length === 0) continue

    await prisma.coverageRequirement.createMany({
      data: srcSlots.map(s => ({
        locationId: data.locationId,
        organizationId: data.organizationId,
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
      where: { locationId: data.locationId, date: { gte: dstStart, lt: dstEnd } },
      select: { id: true, date: true, startTime: true, endTime: true },
    })
    const keyOf = (d: Date, st: string, en: string) =>
      `${d.toISOString().slice(0, 10)}|${st}|${en}`
    const idByKey = new Map<string, string>()
    for (const c of created) idByKey.set(keyOf(c.date as Date, c.startTime, c.endTime), c.id)

    const roleRows: any[] = []
    for (const s of srcSlots as any[]) {
      const dstDate = addDaysUTC(s.date as Date, offsetDays)
      const id = idByKey.get(keyOf(dstDate, s.startTime, s.endTime))
      if (!id) continue
      for (const rr of (s.roleRequirements ?? [])) {
        roleRows.push({
          coverageRequirementId: id,
          laborRoleId: rr.laborRoleId,
          minWorkers: rr.minWorkers,
          idealWorkers: rr.idealWorkers,
        })
      }
    }
    if (roleRows.length > 0) {
      await (prisma as any).coverageRoleRequirement.createMany({ data: roleRows, skipDuplicates: true })
    }

    totalCopied += srcSlots.length
  }

  revalidatePath('/coverage')
  return { weeksCopied: sources.length, slotsCopied: totalCopied }
}

// ── Semanas del año que tienen cobertura (para el selector de copia) ─────────
export async function getWeeksWithCoverage(locationId: string, year: number) {
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1))
  const rows = await prisma.coverageRequirement.findMany({
    where: { locationId, date: { gte: yearStart, lt: yearEnd } },
    select: { date: true },
  })
  // Reducir a lunes ISO únicos.
  const mondays = new Set<string>()
  for (const r of rows) {
    const d = r.date as Date
    const dow = (d.getUTCDay() + 6) % 7
    const monday = new Date(d)
    monday.setUTCDate(monday.getUTCDate() - dow)
    mondays.add(monday.toISOString().slice(0, 10))
  }
  return Array.from(mondays)
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
