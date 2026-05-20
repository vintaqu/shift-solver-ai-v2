'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

// ── Skills (etiquetas) ────────────────────────────────────────────────────

export async function createSkill(data: {
  organizationId: string
  name: string
  color: string
}) {
  const name = data.name.trim().toUpperCase().replace(/\s+/g, '_')
  if (!name) throw new Error('El nombre es obligatorio')

  const existing = await prisma.skill.findFirst({
    where: { organizationId: data.organizationId, name },
  })
  if (existing) throw new Error(`Ya existe una etiqueta llamada "${name}"`)

  const skill = await prisma.skill.create({
    data: { name, color: data.color, organizationId: data.organizationId },
  })
  revalidatePath('/settings')
  return skill
}

export async function updateSkill(id: string, data: { name?: string; color?: string }) {
  const updated = await prisma.skill.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name.trim().toUpperCase().replace(/\s+/g, '_') }),
      ...(data.color && { color: data.color }),
    },
  })
  revalidatePath('/settings')
  return updated
}

export async function deleteSkill(id: string) {
  // Verificar si está asignada a empleados
  const inUse = await prisma.employeeSkill.count({ where: { skillId: id } })
  if (inUse > 0) throw new Error(`Esta etiqueta está asignada a ${inUse} empleado${inUse > 1 ? 's' : ''}. Desasígnala antes de eliminarla.`)

  await prisma.skill.delete({ where: { id } })
  revalidatePath('/settings')
  return { success: true }
}

// ── Labor Roles (nombres y colores) ──────────────────────────────────────

export async function updateLaborRole(id: string, data: { name?: string; color?: string }) {
  const updated = await prisma.laborRole.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name.trim() }),
      ...(data.color && { color: data.color }),
    },
  })
  revalidatePath('/settings')
  return updated
}

export async function getSkillsAndRoles(organizationId: string) {
  const [skills, roles] = await Promise.all([
    prisma.skill.findMany({
      where: { organizationId },
      include: { _count: { select: { employeeSkills: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.laborRole.findMany({
      where: { organizationId },
      include: { _count: { select: { employeeSkills: true } } },
      orderBy: { priority: 'asc' },
    }),
  ])
  return { skills, roles }
}
