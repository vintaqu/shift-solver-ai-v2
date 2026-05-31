'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

// ── Obtener todos los slots de cobertura ───────────────────────────────────
export async function getCoverageRequirements(locationId: string) {
  return prisma.coverageRequirement.findMany({
    where: { locationId },
    include: { laborRole: true, skill: true },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })
}

// ── Crear o actualizar un slot ─────────────────────────────────────────────
export async function upsertCoverageSlot(data: {
  id?: string
  locationId: string
  organizationId: string
  templateId?: string | null
  dayOfWeek: number
  startTime: string
  endTime: string
  minWorkers: number
  idealWorkers: number
  laborRoleId?: string | null
  skillId?: string | null
  isRequired: boolean
  notes?: string
}) {
  const payload = {
    locationId: data.locationId,
    organizationId: data.organizationId,
    templateId: data.templateId ?? null,
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
    minWorkers: data.minWorkers,
    idealWorkers: data.idealWorkers,
    laborRoleId: data.laborRoleId || null,
    skillId: data.skillId || null,
    isRequired: data.isRequired,
    notes: data.notes || null,
  }

  let slot
  if (data.id) {
    slot = await prisma.coverageRequirement.update({ where: { id: data.id }, data: payload })
  } else {
    const existing = await prisma.coverageRequirement.findFirst({
      where: {
        locationId: data.locationId,
        templateId: data.templateId ?? null,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
      }
    })
    slot = existing
      ? await prisma.coverageRequirement.update({ where: { id: existing.id }, data: payload })
      : await prisma.coverageRequirement.create({ data: payload })
  }

  revalidatePath('/coverage')
  return slot
}

// ── Borrar un slot ─────────────────────────────────────────────────────────
export async function deleteCoverageSlot(id: string) {
  await prisma.coverageRequirement.delete({ where: { id } })
  revalidatePath('/coverage')
  return { success: true }
}

// ── Copiar un día completo a otro ──────────────────────────────────────────
export async function copyDaySlots(
  locationId: string,
  organizationId: string,
  fromDay: number,
  toDay: number,
  templateId?: string | null,
) {
  const where = templateId
    ? { locationId, dayOfWeek: fromDay, templateId }
    : { locationId, dayOfWeek: fromDay }

  const source = await prisma.coverageRequirement.findMany({ where })

  // Borrar destino (solo slots de la misma plantilla si aplica)
  await prisma.coverageRequirement.deleteMany({
    where: templateId
      ? { locationId, dayOfWeek: toDay, templateId }
      : { locationId, dayOfWeek: toDay },
  })

  // Recrear
  if (source.length > 0) {
    await prisma.coverageRequirement.createMany({
      data: source.map(s => ({
        locationId,
        organizationId,
        templateId: s.templateId,
        dayOfWeek: toDay,
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
  }

  revalidatePath('/coverage')
  return { copied: source.length }
}

// ── Cargar plantilla predefinida ───────────────────────────────────────────
export async function loadCoverageTemplate(
  locationId: string,
  organizationId: string,
  template: 'restaurante_tipico' | 'cafe_desayunos' | 'bar_noches',
  templateId?: string | null,
) {
  const TEMPLATES: Record<string, Array<{ day: number; start: string; end: string; min: number; ideal: number }>> = {
    restaurante_tipico: [
      // Lun-Jue (0-3)
      ...([0, 1, 2, 3].flatMap(day => [
        { day, start: '06:00', end: '06:30', min: 1, ideal: 1 },
        { day, start: '06:30', end: '07:00', min: 1, ideal: 1 },
        { day, start: '07:00', end: '08:00', min: 2, ideal: 2 },
        { day, start: '08:00', end: '10:00', min: 2, ideal: 3 },
        { day, start: '10:00', end: '14:00', min: 3, ideal: 4 },
        { day, start: '14:00', end: '16:00', min: 2, ideal: 2 },
        { day, start: '16:00', end: '18:00', min: 1, ideal: 1 },
        { day, start: '20:00', end: '22:00', min: 2, ideal: 3 },
        { day, start: '22:00', end: '00:00', min: 2, ideal: 2 },
      ])),
      // Vie (4)
      ...([4].flatMap(day => [
        { day, start: '06:00', end: '08:00', min: 2, ideal: 2 },
        { day, start: '08:00', end: '10:00', min: 3, ideal: 3 },
        { day, start: '10:00', end: '14:00', min: 4, ideal: 4 },
        { day, start: '14:00', end: '16:00', min: 2, ideal: 3 },
        { day, start: '20:00', end: '22:00', min: 3, ideal: 4 },
        { day, start: '22:00', end: '00:00', min: 3, ideal: 4 },
      ])),
      // Sáb-Dom (5-6)
      ...([5, 6].flatMap(day => [
        { day, start: '08:00', end: '10:00', min: 2, ideal: 3 },
        { day, start: '10:00', end: '14:00', min: 4, ideal: 4 },
        { day, start: '14:00', end: '16:00', min: 3, ideal: 3 },
        { day, start: '20:00', end: '22:00', min: 3, ideal: 4 },
        { day, start: '22:00', end: '00:00', min: 4, ideal: 5 },
      ])),
    ],
    cafe_desayunos: [
      ...([0, 1, 2, 3, 4].flatMap(day => [
        { day, start: '07:00', end: '09:00', min: 2, ideal: 2 },
        { day, start: '09:00', end: '12:00', min: 3, ideal: 3 },
        { day, start: '12:00', end: '14:00', min: 2, ideal: 2 },
        { day, start: '14:00', end: '16:00', min: 1, ideal: 1 },
      ])),
      ...([5, 6].flatMap(day => [
        { day, start: '08:00', end: '10:00', min: 3, ideal: 4 },
        { day, start: '10:00', end: '13:00', min: 4, ideal: 4 },
        { day, start: '13:00', end: '16:00', min: 2, ideal: 2 },
      ])),
    ],
    bar_noches: [
      ...([0, 1, 2, 3].flatMap(day => [
        { day, start: '18:00', end: '20:00', min: 1, ideal: 2 },
        { day, start: '20:00', end: '22:00', min: 2, ideal: 2 },
        { day, start: '22:00', end: '00:00', min: 2, ideal: 3 },
      ])),
      ...([4, 5, 6].flatMap(day => [
        { day, start: '18:00', end: '20:00', min: 2, ideal: 3 },
        { day, start: '20:00', end: '22:00', min: 3, ideal: 4 },
        { day, start: '22:00', end: '00:00', min: 4, ideal: 5 },
      ])),
    ],
  }

  const slots = TEMPLATES[template] || []

  // Borrar slots actuales (de esta plantilla si aplica, o todos si no)
  await prisma.coverageRequirement.deleteMany({
    where: templateId ? { locationId, templateId } : { locationId },
  })

  if (slots.length > 0) {
    await prisma.coverageRequirement.createMany({
      data: slots.map(s => ({
        locationId,
        organizationId,
        templateId: templateId ?? null,
        dayOfWeek: s.day,
        startTime: s.start,
        endTime: s.end,
        minWorkers: s.min,
        idealWorkers: s.ideal,
        isRequired: true,
        priority: 1,
      })),
    })
  }

  revalidatePath('/coverage')
  return { loaded: slots.length }
}

// ── Borrar todos los slots de una plantilla (bulk) ───────────────────────
export async function clearAllSlots(templateId: string, locationId: string) {
  await prisma.coverageRequirement.deleteMany({
    where: { templateId, locationId },
  })
  revalidatePath('/coverage')
  return { success: true }
}

// ── Copiar slots de una plantilla a otra ──────────────────────────────────
export async function copySlotsBetweenTemplates(
  fromTemplateId: string,
  toTemplateId: string,
  locationId: string,
  organizationId: string,
) {
  const source = await prisma.coverageRequirement.findMany({
    where: { templateId: fromTemplateId, locationId },
  })
  if (source.length === 0) throw new Error('La plantilla origen no tiene slots configurados')
  await prisma.coverageRequirement.deleteMany({
    where: { templateId: toTemplateId, locationId },
  })
  await prisma.coverageRequirement.createMany({
    data: source.map(s => ({
      locationId,
      organizationId,
      templateId: toTemplateId,
      dayOfWeek: s.dayOfWeek,
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
  revalidatePath('/coverage')
  return { copied: source.length }
}

// ── Generar slots de 30min automáticamente para un rango ──────────────────
export async function generateSlotsForDay(
  locationId: string,
  organizationId: string,
  dayOfWeek: number,
  openTime: string,
  closeTime: string,
  defaultMin: number,
  defaultIdeal: number,
  templateId?: string | null,
) {
  // Borrar slots del día (filtrando por plantilla si aplica)
  await prisma.coverageRequirement.deleteMany({
    where: templateId
      ? { locationId, dayOfWeek, templateId }
      : { locationId, dayOfWeek },
  })

  // Generar slots de 30 min
  const slots = []
  let [h, m] = openTime.split(':').map(Number)
  const [ch, cm] = closeTime === '00:00' ? [24, 0] : closeTime.split(':').map(Number)
  const closeMinutes = ch * 60 + cm
  let current = h * 60 + m

  while (current < closeMinutes) {
    const next = current + 30
    const startStr = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`
    const endMin = next >= 24 * 60 ? next - 24 * 60 : next
    const endStr = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`

    slots.push({
      locationId,
      organizationId,
      templateId: templateId ?? null,
      dayOfWeek,
      startTime: startStr,
      endTime: endStr === '00:00' ? '00:00' : endStr,
      minWorkers: defaultMin,
      idealWorkers: defaultIdeal,
      isRequired: true,
      priority: 1,
    })
    current = next
  }

  await prisma.coverageRequirement.createMany({ data: slots })
  revalidatePath('/coverage')
  return { generated: slots.length }
}
