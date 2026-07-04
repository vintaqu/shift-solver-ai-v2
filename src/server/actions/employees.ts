'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'

// ── Upsert empleado base ───────────────────────────────────────────────────
export async function upsertEmployee(data: {
  id?: string
  organizationId: string
  locationId?: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  color: string
  hireDate?: string
  notes?: string
  isActive?: boolean
}) {
  const payload = {
    organizationId: data.organizationId,
    locationId: data.locationId || null,
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    email: data.email?.trim() || null,
    phone: data.phone?.trim() || null,
    color: data.color,
    hireDate: data.hireDate ? new Date(data.hireDate) : null,
    notes: data.notes?.trim() || null,
    isActive: data.isActive ?? true,
  }

  const emp = data.id
    ? await prisma.employee.update({ where: { id: data.id }, data: payload })
    : await prisma.employee.create({ data: payload })

  revalidatePath('/employees')
  revalidatePath(`/employees/${emp.id}`)
  return emp
}

// ── Toggle activo/inactivo ─────────────────────────────────────────────────
export async function toggleEmployeeActive(id: string) {
  const emp = await prisma.employee.findUnique({ where: { id } })
  if (!emp) throw new Error('Empleado no encontrado')
  const updated = await prisma.employee.update({
    where: { id },
    data: { isActive: !emp.isActive },
  })
  revalidatePath('/employees')
  revalidatePath(`/employees/${id}`)
  return updated
}

// ── Upsert contrato ────────────────────────────────────────────────────────
export async function upsertContract(data: {
  id?: string
  employeeId: string
  contractType: string
  weeklyHours: number
  minWeeklyHours?: number | null
  maxWeeklyHours?: number | null
  maxDailyHours: number
  maxConsecutiveDays: number
  minRestBetweenShifts: number
  annualMaxHours: number
  preferContinuous: boolean
  allowSplit: boolean
  hourlyWage?: number | null
  collectiveAgreement?: string
  startDate: string
  endDate?: string | null
}) {
  // Desactivar contratos anteriores
  await prisma.employeeContract.updateMany({
    where: { employeeId: data.employeeId, isActive: true },
    data: { isActive: false },
  })

  const contract = data.id
    ? await prisma.employeeContract.update({
        where: { id: data.id },
        data: {
          contractType: data.contractType as any,
          weeklyHours: data.weeklyHours,
          minWeeklyHours: data.minWeeklyHours ?? null,
          maxWeeklyHours: data.maxWeeklyHours ?? null,
          maxDailyHours: data.maxDailyHours,
          maxConsecutiveDays: data.maxConsecutiveDays,
          minRestBetweenShifts: data.minRestBetweenShifts,
          annualMaxHours: data.annualMaxHours,
          hourlyWage: data.hourlyWage ?? null,
          collectiveAgreement: data.collectiveAgreement || null,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          isActive: true,
          notes: `preferContinuous:${data.preferContinuous},allowSplit:${data.allowSplit}`,
        },
      })
    : await prisma.employeeContract.create({
        data: {
          employeeId: data.employeeId,
          contractType: data.contractType as any,
          weeklyHours: data.weeklyHours,
          minWeeklyHours: data.minWeeklyHours ?? null,
          maxWeeklyHours: data.maxWeeklyHours ?? null,
          maxDailyHours: data.maxDailyHours,
          maxConsecutiveDays: data.maxConsecutiveDays,
          minRestBetweenShifts: data.minRestBetweenShifts,
          annualMaxHours: data.annualMaxHours,
          hourlyWage: data.hourlyWage ?? null,
          collectiveAgreement: data.collectiveAgreement || null,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          isActive: true,
          notes: `preferContinuous:${data.preferContinuous},allowSplit:${data.allowSplit}`,
        },
      })

  revalidatePath(`/employees/${data.employeeId}`)
  return contract
}

// ── Gestión de skills ──────────────────────────────────────────────────────
export async function setEmployeeSkills(employeeId: string, skillIds: string[], laborRoleId: string | null) {
  // Borrar todos y recrear (más simple para esta UI)
  await prisma.employeeSkill.deleteMany({ where: { employeeId } })

  if (skillIds.length > 0) {
    await prisma.employeeSkill.createMany({
      data: skillIds.map(skillId => ({
        employeeId,
        skillId,
        laborRoleId,
      })),
    })
  }

  revalidatePath(`/employees/${employeeId}`)
  return { success: true }
}

// ── Restricciones de disponibilidad ───────────────────────────────────────
export async function upsertAvailability(data: {
  id?: string
  employeeId: string
  type: string                  // NOT_BEFORE | NOT_AFTER | DAY_OFF | ONLY_BETWEEN | PREFER
  dayOfWeek?: number | null     // null = todos los días
  startTime?: string | null
  endTime?: string | null
  isRecurring: boolean
  notes?: string
}) {
  const payload = {
    employeeId: data.employeeId,
    dayOfWeek: data.dayOfWeek ?? null,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
    type: data.type as any,
    isRecurring: data.isRecurring,
    notes: data.notes || null,
  }

  const av = data.id
    ? await prisma.availability.update({ where: { id: data.id }, data: payload })
    : await prisma.availability.create({ data: payload })

  revalidatePath(`/employees/${data.employeeId}`)
  return av
}

export async function deleteAvailability(id: string, employeeId: string) {
  await prisma.availability.delete({ where: { id } })
  revalidatePath(`/employees/${employeeId}`)
  return { success: true }
}

// ── Asegurar skills y roles en BD ──────────────────────────────────────────
export async function ensureSkillsAndRoles(organizationId: string) {
  const [skills, roles] = await Promise.all([
    prisma.skill.findMany({ where: { organizationId } }),
    prisma.laborRole.findMany({ where: { organizationId } }),
  ])

  // Crear defaults si no existen
  if (skills.length === 0) {
    await prisma.skill.createMany({
      data: [
        { organizationId, name: 'PASTAS', color: '#f59e0b' },
        { organizationId, name: 'APERTURA', color: '#10b981' },
        { organizationId, name: 'CAJERA', color: '#6366f1' },
        { organizationId, name: 'BARISTA', color: '#8b5cf6' },
        { organizationId, name: 'BANDEJERA', color: '#ec4899' },
        { organizationId, name: 'PLANCHISTA', color: '#ef4444' },
        { organizationId, name: 'COMANDERA', color: '#f97316' },
        { organizationId, name: 'BARRA', color: '#0ea5e9' },
        { organizationId, name: 'DELIVERY', color: '#84cc16' },
        { organizationId, name: 'CIERRE', color: '#78716c' },
        { organizationId, name: 'CONTABLE', color: '#14b8a6' },
      ],
    })
  }

  if (roles.length === 0) {
    await prisma.laborRole.createMany({
      data: [
        { organizationId, name: 'Camarero básico', level: 'BASIC', color: '#6366f1', isCritical: false, priority: 1 },
        { organizationId, name: 'Semi-encargado', level: 'SEMI_MANAGER', color: '#0891b2', isCritical: true, priority: 2 },
        { organizationId, name: 'Encargado', level: 'MANAGER', color: '#7c3aed', isCritical: true, priority: 3 },
        { organizationId, name: 'Dueño', level: 'OWNER', color: '#64748b', isCritical: false, priority: 4 },
      ],
    })
  }

  return {
    skills: await prisma.skill.findMany({ where: { organizationId } }),
    roles: await prisma.laborRole.findMany({ where: { organizationId }, orderBy: { priority: 'asc' } }),
  }
}

// ── Actualizar orden de empleados en el cuadrante ────────────────────────────
export async function updateEmployeeOrder(orderedIds: string[]) {
  const { organizationId } = await requireOrgContext()

  // Verificar que todos pertenecen a la organización
  const count = await prisma.employee.count({
    where: { organizationId, id: { in: orderedIds } },
  })
  if (count !== orderedIds.length) throw new Error('Empleados no válidos')

  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.employee.update({ where: { id }, data: { displayOrder: index } as any })
    )
  )

  revalidatePath('/planning')
  return { success: true }
}
