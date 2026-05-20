'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'

// ── Crear usuario (Owner o Manager) ───────────────────────────────────────
export async function createUser(data: {
  email: string
  name: string
  password: string
  role: 'ORG_OWNER' | 'MANAGER'
  organizationId: string
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) throw new Error('Ya existe un usuario con ese email')

  const hashedPassword = await bcrypt.hash(data.password, 12)

  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase().trim(),
      name: data.name.trim(),
      hashedPassword,
      role: data.role,
      isActive: true,
      memberships: {
        create: {
          organizationId: data.organizationId,
          role: data.role,
        },
      },
    },
  })

  revalidatePath('/settings/users')
  return user
}

// ── Cambiar contraseña ─────────────────────────────────────────────────────
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('Usuario no encontrado')

  if (user.hashedPassword) {
    const valid = await bcrypt.compare(currentPassword, user.hashedPassword)
    if (!valid) throw new Error('La contraseña actual no es correcta')
  }

  if (newPassword.length < 8) throw new Error('La nueva contraseña debe tener al menos 8 caracteres')

  const hashedPassword = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: userId }, data: { hashedPassword } })
  return { success: true }
}

// ── Reset contraseña (solo Owner/SuperAdmin) ───────────────────────────────
export async function resetUserPassword(userId: string, newPassword: string) {
  if (newPassword.length < 8) throw new Error('Mínimo 8 caracteres')
  const hashedPassword = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: userId }, data: { hashedPassword } })
  return { success: true }
}

// ── Toggle activo/inactivo usuario ─────────────────────────────────────────
export async function toggleUserActive(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('Usuario no encontrado')
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  })
  revalidatePath('/settings/users')
  return updated
}

// ── Asignar/actualizar PIN de empleado ─────────────────────────────────────
export async function setEmployeePin(employeeId: string, pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('El PIN debe ser de 4 a 6 dígitos numéricos')

  const hashedPin = await bcrypt.hash(pin, 10)
  await prisma.employee.update({
    where: { id: employeeId },
    data: { pin: hashedPin },
  })

  revalidatePath(`/employees/${employeeId}`)
  return { success: true }
}

// ── Quitar PIN de empleado ─────────────────────────────────────────────────
export async function removeEmployeePin(employeeId: string) {
  await prisma.employee.update({
    where: { id: employeeId },
    data: { pin: null },
  })
  revalidatePath(`/employees/${employeeId}`)
  return { success: true }
}

// ── Generar link de invitación de empleado ─────────────────────────────────
export async function getEmployeeLoginLink(employeeId: string, baseUrl: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { organization: true },
  })
  if (!employee) throw new Error('Empleado no encontrado')
  if (!employee.pin) throw new Error('El empleado no tiene PIN configurado. Asígnale un PIN primero.')

  const url = `${baseUrl}/r/${employee.organization.slug}/login`
  return {
    url,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    organizationName: employee.organization.name,
    slug: employee.organization.slug,
  }
}

// ── Actualizar branding de organización ───────────────────────────────────
export async function updateOrganizationBranding(organizationId: string, data: {
  name?: string
  description?: string
  logoUrl?: string
  brandColor?: string
  loginMessage?: string
  slug?: string
}) {
  // Verificar slug único si se cambia
  if (data.slug) {
    const slugClean = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    const existing = await prisma.organization.findFirst({
      where: { slug: slugClean, id: { not: organizationId } },
    })
    if (existing) throw new Error('Ese identificador ya está en uso por otro restaurante')
    data.slug = slugClean
  }

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      ...(data.brandColor !== undefined && { brandColor: data.brandColor }),
      ...(data.loginMessage !== undefined && { loginMessage: data.loginMessage }),
      ...(data.slug && { slug: data.slug }),
    },
  })

  revalidatePath('/settings')
  return updated
}

// ── Obtener usuarios de la organización ───────────────────────────────────
export async function getOrganizationUsers(organizationId: string) {
  return prisma.organizationMember.findMany({
    where: { organizationId },
    include: { user: true },
    orderBy: { joinedAt: 'asc' },
  })
}

// ── Migrar seed: hashear contraseña en texto plano ─────────────────────────
export async function migrateHashPasswords(organizationId: string) {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId },
    include: { user: true },
  })

  let migrated = 0
  for (const m of members) {
    const user = m.user
    // Si la contraseña no parece bcrypt, hashearla
    if (user.hashedPassword && !user.hashedPassword.startsWith('$2')) {
      const hashed = await bcrypt.hash(user.hashedPassword, 12)
      await prisma.user.update({ where: { id: user.id }, data: { hashedPassword: hashed } })
      migrated++
    }
    // Si no tiene contraseña, asignar una por defecto temporal
    if (!user.hashedPassword) {
      const hashed = await bcrypt.hash('Cambiar123!', 12)
      await prisma.user.update({ where: { id: user.id }, data: { hashedPassword: hashed } })
      migrated++
    }
  }
  return { migrated }
}
