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
  const [skills, roles, groups] = await Promise.all([
    prisma.skill.findMany({
      where: { organizationId },
      include: { _count: { select: { employeeSkills: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.laborRole.findMany({
      where: { organizationId },
      include: { _count: { select: { employeeSkills: true } }, group: true } as any,
      orderBy: [{ rank: 'asc' }, { name: 'asc' }] as any,
    }),
    prisma.laborRoleGroup.findMany({
      where: { organizationId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    }),
  ])
  return { skills, roles, groups }
}

// ── Grupos de roles ───────────────────────────────────────────────────────
// Un grupo es una familia con jerarquía propia (sala, cocina, barra...).
// Los grupos son ESTANCOS: nadie cubre demanda de otro grupo, ni el rol más
// alto. Por eso borrar un grupo con roles dentro se bloquea explícitamente.

export async function createRoleGroup(data: {
  organizationId: string
  name: string
  color?: string
}) {
  const name = data.name.trim()
  if (!name) throw new Error('El nombre del grupo es obligatorio')

  const existing = await prisma.laborRoleGroup.findFirst({
    where: { organizationId: data.organizationId, name },
  })
  if (existing) throw new Error(`Ya existe un grupo llamado "${name}"`)

  const last = await prisma.laborRoleGroup.findFirst({
    where: { organizationId: data.organizationId },
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true },
  })

  const group = await prisma.laborRoleGroup.create({
    data: {
      organizationId: data.organizationId,
      name,
      color: data.color || '#6366f1',
      displayOrder: (last?.displayOrder ?? -1) + 1,
    },
  })
  revalidatePath('/settings')
  return group
}

export async function updateRoleGroup(id: string, data: { name?: string; color?: string }) {
  const updated = await prisma.laborRoleGroup.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name.trim() }),
      ...(data.color && { color: data.color }),
    },
  })
  revalidatePath('/settings')
  return updated
}

export async function deleteRoleGroup(id: string) {
  const roles = await prisma.laborRole.count({ where: { groupId: id } as any })
  if (roles > 0) {
    throw new Error(
      `El grupo tiene ${roles} rol${roles > 1 ? 'es' : ''} dentro. Muévelos o bórralos antes de eliminar el grupo.`
    )
  }
  await prisma.laborRoleGroup.delete({ where: { id } })
  revalidatePath('/settings')
  return { success: true }
}

// ── Roles dentro de un grupo ─────────────────────────────────────────────

export async function createLaborRole(data: {
  organizationId: string
  groupId: string
  name: string
  color?: string
  description?: string
}) {
  const name = data.name.trim()
  if (!name) throw new Error('El nombre del rol es obligatorio')

  const existing = await prisma.laborRole.findFirst({
    where: { organizationId: data.organizationId, name },
  })
  if (existing) {
    throw new Error(
      `Ya existe un rol llamado "${name}". Los nombres deben ser únicos porque el solver los usa como identificador.`
    )
  }

  // El rol nuevo entra por arriba del grupo.
  const top = await prisma.laborRole.findFirst({
    where: { groupId: data.groupId } as any,
    orderBy: { rank: 'desc' } as any,
    select: { rank: true } as any,
  })

  const role = await prisma.laborRole.create({
    data: {
      organizationId: data.organizationId,
      groupId: data.groupId,
      name,
      color: data.color || '#6366f1',
      description: data.description?.trim() || null,
      rank: ((top as any)?.rank ?? -1) + 1,
      // `level` es legacy pero sigue siendo NOT NULL en la tabla.
      level: 'BASIC',
    } as any,
  })
  revalidatePath('/settings')
  revalidatePath('/coverage')
  return role
}

export async function deleteLaborRole(id: string) {
  const [employees, coverage, assignments] = await Promise.all([
    prisma.employeeSkill.count({ where: { laborRoleId: id } }),
    prisma.coverageRoleRequirement.count({ where: { laborRoleId: id } }),
    prisma.scheduleAssignment.count({ where: { laborRoleId: id } }),
  ])
  if (employees > 0) {
    throw new Error(`El rol está asignado a ${employees} empleado(s). Cámbialos de rol antes de borrarlo.`)
  }
  if (coverage > 0 || assignments > 0) {
    throw new Error(
      `El rol se usa en ${coverage} requisito(s) de cobertura y ${assignments} turno(s). Quítalo de ahí antes de borrarlo.`
    )
  }
  await prisma.laborRole.delete({ where: { id } })
  revalidatePath('/settings')
  revalidatePath('/coverage')
  return { success: true }
}

/**
 * Reordena la jerarquía de un grupo. `orderedIds` va de MENOR a MAYOR rango,
 * es decir el último de la lista es el que puede cubrir a todos los demás.
 */
export async function reorderRolesInGroup(groupId: string, orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.laborRole.update({
        where: { id },
        data: { groupId, rank: index } as any,
      })
    )
  )
  revalidatePath('/settings')
  revalidatePath('/coverage')
  return { success: true }
}

/** Mueve un rol a otro grupo, colocándolo arriba del destino. */
export async function moveRoleToGroup(roleId: string, groupId: string) {
  const top = await prisma.laborRole.findFirst({
    where: { groupId } as any,
    orderBy: { rank: 'desc' } as any,
    select: { rank: true } as any,
  })
  const updated = await prisma.laborRole.update({
    where: { id: roleId },
    data: { groupId, rank: ((top as any)?.rank ?? -1) + 1 } as any,
  })
  revalidatePath('/settings')
  revalidatePath('/coverage')
  return updated
}
