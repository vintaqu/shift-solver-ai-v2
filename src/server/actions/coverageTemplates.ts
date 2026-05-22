'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { evaluateTemplateStatus, isInScheduledRange } from '@/lib/coverageTemplateUtils'

// ── Obtener la plantilla activa para el solver/cobertura ──────────────────
export async function getActiveTemplate(locationId: string) {
  const now = new Date()
  const templates = await prisma.coverageTemplate.findMany({
    where: { locationId },
    include: { coverageRequirements: { include: { laborRole: true, skill: true } } },
  })

  // 1. Buscar activa MANUAL que no haya expirado
  const manualActive = templates.find(t =>
    t.isActive && t.activationType === 'MANUAL' &&
    (!t.activeUntil || new Date(t.activeUntil) > now)
  )
  if (manualActive) return manualActive

  // 2. Buscar activa SCHEDULED en rango
  const scheduledActive = templates.find(t =>
    t.isActive && t.activationType === 'SCHEDULED' && isInScheduledRange(t, now)
  )
  if (scheduledActive) return scheduledActive

  // 3. Fallback: plantilla default
  const defaultTemplate = templates.find(t => t.isDefault)
  return defaultTemplate ?? null
}

// ── CRUD Templates ────────────────────────────────────────────────────────

export async function createTemplate(data: {
  organizationId: string
  locationId: string
  name: string
  description?: string
  color: string
  isDefault?: boolean
  openingTime?: string
  closingTime?: string
}) {
  // Si es default, quitar el default de las demás
  if (data.isDefault) {
    await prisma.coverageTemplate.updateMany({
      where: { locationId: data.locationId },
      data: { isDefault: false },
    })
  }

  const template = await prisma.coverageTemplate.create({
    data: {
      organizationId: data.organizationId,
      locationId: data.locationId,
      name: data.name,
      description: data.description?.trim() || null,
      color: data.color,
      isDefault: data.isDefault ?? false,
      isActive: false,
      openingTime: data.openingTime ?? '06:00',
      closingTime: data.closingTime ?? '00:00',
    },
  })

  revalidatePath('/coverage')
  return template
}

export async function updateTemplate(id: string, data: {
  name?: string
  description?: string
  color?: string
  openingTime?: string
  closingTime?: string
  isDefault?: boolean
}) {
  if (data.isDefault) {
    const template = await prisma.coverageTemplate.findUnique({ where: { id } })
    if (template) {
      await prisma.coverageTemplate.updateMany({
        where: { locationId: template.locationId, id: { not: id } },
        data: { isDefault: false },
      })
    }
  }

  const updated = await prisma.coverageTemplate.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description || null }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
    },
  })

  revalidatePath('/coverage')
  return updated
}

export async function deleteTemplate(id: string) {
  const template = await prisma.coverageTemplate.findUnique({ where: { id } })
  if (!template) throw new Error('Plantilla no encontrada')
  if (template.isDefault) throw new Error('No se puede eliminar la plantilla por defecto')
  if (template.isActive) throw new Error('Desactiva la plantilla antes de eliminarla')

  // Borrar slots asociados
  await prisma.coverageRequirement.deleteMany({ where: { templateId: id } })
  await prisma.coverageTemplate.delete({ where: { id } })

  revalidatePath('/coverage')
  return { success: true }
}

// ── Activación ────────────────────────────────────────────────────────────

export async function activateTemplate(id: string, options: {
  type: 'MANUAL'
  activeUntil?: string | null  // ISO date o null para indefinido
} | {
  type: 'SCHEDULED'
  schedStartMonth: number
  schedStartDay: number
  schedEndMonth: number
  schedEndDay: number
}) {
  const template = await prisma.coverageTemplate.findUnique({ where: { id } })
  if (!template) throw new Error('Plantilla no encontrada')

  // Desactivar TODAS las demás del mismo local (una sola activa)
  await prisma.coverageTemplate.updateMany({
    where: { locationId: template.locationId, id: { not: id } },
    data: { isActive: false, activationType: null, activeUntil: null },
  })

  // Activar ésta
  await prisma.coverageTemplate.update({
    where: { id },
    data: {
      isActive: true,
      activationType: options.type,
      activeUntil: options.type === 'MANUAL' && options.activeUntil
        ? new Date(options.activeUntil)
        : null,
      schedStartMonth: options.type === 'SCHEDULED' ? options.schedStartMonth : null,
      schedStartDay:   options.type === 'SCHEDULED' ? options.schedStartDay   : null,
      schedEndMonth:   options.type === 'SCHEDULED' ? options.schedEndMonth   : null,
      schedEndDay:     options.type === 'SCHEDULED' ? options.schedEndDay     : null,
    },
  })

  revalidatePath('/coverage')
  return { success: true }
}

export async function deactivateTemplate(id: string) {
  const template = await prisma.coverageTemplate.findUnique({ where: { id } })
  if (!template) throw new Error('Plantilla no encontrada')
  if (template.isDefault) throw new Error('La plantilla por defecto no puede desactivarse — es el fallback')

  await prisma.coverageTemplate.update({
    where: { id },
    data: { isActive: false, activationType: null, activeUntil: null },
  })

  revalidatePath('/coverage')
  return { success: true }
}

// ── Duplicar plantilla ────────────────────────────────────────────────────
export async function duplicateTemplate(id: string, newName: string) {
  const source = await prisma.coverageTemplate.findUnique({
    where: { id },
    include: { coverageRequirements: true },
  })
  if (!source) throw new Error('Plantilla no encontrada')

  const newTemplate = await prisma.coverageTemplate.create({
    data: {
      organizationId: source.organizationId,
      locationId: source.locationId,
      name: newName,
      description: source.description,
      color: source.color,
      isDefault: false,
      isActive: false,
    },
  })

  if (source.coverageRequirements.length > 0) {
    await prisma.coverageRequirement.createMany({
      data: source.coverageRequirements.map(r => ({
        organizationId: r.organizationId,
        locationId: r.locationId,
        templateId: newTemplate.id,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        laborRoleId: r.laborRoleId,
        skillId: r.skillId,
        minWorkers: r.minWorkers,
        idealWorkers: r.idealWorkers,
        priority: r.priority,
        isRequired: r.isRequired,
        notes: r.notes,
      })),
    })
  }

  revalidatePath('/coverage')
  return newTemplate
}

// ── Migrar slots legacy (sin templateId) a la plantilla default ───────────
export async function migrateLegacySlotsToDefault(locationId: string, organizationId: string) {
  // Verificar si hay slots sin templateId
  const legacyCount = await prisma.coverageRequirement.count({
    where: { locationId, templateId: null },
  })
  if (legacyCount === 0) return { migrated: 0 }

  // Buscar o crear plantilla default
  let defaultTemplate = await prisma.coverageTemplate.findFirst({
    where: { locationId, isDefault: true },
  })

  if (!defaultTemplate) {
    defaultTemplate = await prisma.coverageTemplate.create({
      data: {
        organizationId,
        locationId,
        name: 'Configuración base',
        description: 'Plantilla por defecto creada automáticamente',
        color: '#6366f1',
        isDefault: true,
        isActive: false,
      },
    })
  }

  // Migrar slots
  await prisma.coverageRequirement.updateMany({
    where: { locationId, templateId: null },
    data: { templateId: defaultTemplate.id },
  })

  revalidatePath('/coverage')
  return { migrated: legacyCount, templateId: defaultTemplate.id }
}

// ── Obtener todas las plantillas del local con estado calculado ───────────
export async function getTemplatesForLocation(locationId: string) {
  const templates = await prisma.coverageTemplate.findMany({
    where: { locationId },
    include: {
      _count: { select: { coverageRequirements: true } },
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })

  return templates.map(t => ({
    ...t,
    slotsCount: t._count.coverageRequirements,
    computedStatus: evaluateTemplateStatus({
      isDefault: t.isDefault,
      isActive: t.isActive,
      activationType: t.activationType,
      activeUntil: t.activeUntil,
      schedStartMonth: t.schedStartMonth,
      schedStartDay: t.schedStartDay,
      schedEndMonth: t.schedEndMonth,
      schedEndDay: t.schedEndDay,
    }),
  }))
}
