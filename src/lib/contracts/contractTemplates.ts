'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

/**
 * Plantillas de contrato, versionadas.
 *
 * Editar una plantilla NO modifica la versión existente: crea una nueva y marca
 * la anterior como no vigente. Los contratos ya firmados siguen apuntando a su
 * versión, así que el histórico de cuadrantes, nóminas y validaciones legales no
 * cambia retroactivamente. Migrar empleados a la versión nueva es una acción
 * explícita (`migrateEmployeesToCurrentVersion`).
 */

export interface TemplateValues {
  contractType: string
  weeklyHours: number
  minWeeklyHours?: number | null
  maxWeeklyHours?: number | null
  // null = heredar del convenio. No se duplica el valor.
  maxDailyHours?: number | null
  minRestBetweenShifts?: number | null
  maxConsecutiveDays?: number | null
  annualMaxHours?: number | null
  vacationDaysPerYear?: number | null
  vacationDaysType?: string | null
  preferContinuous?: boolean
  allowSplit?: boolean
  legalFrameworkId?: string | null
  notes?: string | null
}

/** Campos que definen una versión. Sirve para detectar si un cambio es real. */
const CAMPOS_VERSION: (keyof TemplateValues)[] = [
  'contractType', 'weeklyHours', 'minWeeklyHours', 'maxWeeklyHours',
  'maxDailyHours', 'minRestBetweenShifts', 'maxConsecutiveDays', 'annualMaxHours',
  'vacationDaysPerYear', 'vacationDaysType', 'preferContinuous', 'allowSplit',
  'legalFrameworkId',
]

function normalizar(v: TemplateValues) {
  return {
    contractType: v.contractType as any,
    weeklyHours: v.weeklyHours,
    minWeeklyHours: v.minWeeklyHours ?? null,
    maxWeeklyHours: v.maxWeeklyHours ?? null,
    maxDailyHours: v.maxDailyHours ?? null,
    minRestBetweenShifts: v.minRestBetweenShifts ?? null,
    maxConsecutiveDays: v.maxConsecutiveDays ?? null,
    annualMaxHours: v.annualMaxHours ?? null,
    vacationDaysPerYear: v.vacationDaysPerYear ?? null,
    vacationDaysType: v.vacationDaysType ?? null,
    preferContinuous: v.preferContinuous ?? true,
    allowSplit: v.allowSplit ?? true,
    legalFrameworkId: v.legalFrameworkId ?? null,
    notes: v.notes ?? null,
  }
}

// ── Lectura ─────────────────────────────────────────────────────────────────

export async function getContractTemplates(organizationId: string) {
  const templates = await (prisma as any).contractTemplate.findMany({
    where: { organizationId },
    include: {
      versions: {
        orderBy: { version: 'desc' },
        include: {
          legalFramework: { select: { id: true, name: true, code: true } },
          _count: { select: { contracts: true } },
        },
      },
    },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  })

  // Se expone la versión vigente por separado: es la que se asigna a empleados.
  return templates.map((t: any) => ({
    ...t,
    current: t.versions.find((v: any) => v.isCurrent) ?? t.versions[0] ?? null,
    // Nº de empleados con contrato activo en CUALQUIER versión de la plantilla.
    employeeCount: t.versions.reduce((n: number, v: any) => n + (v._count?.contracts ?? 0), 0),
    // Versiones antiguas que aún tienen gente enganchada: hay que migrarlas.
    staleVersions: t.versions.filter((v: any) => !v.isCurrent && (v._count?.contracts ?? 0) > 0),
  }))
}

// ── Escritura ───────────────────────────────────────────────────────────────

export async function createContractTemplate(data: {
  organizationId: string
  name: string
  description?: string
  color?: string
  values: TemplateValues
}) {
  const name = data.name.trim()
  if (!name) throw new Error('El nombre de la plantilla es obligatorio')
  if (!(data.values.weeklyHours > 0)) throw new Error('Las horas semanales deben ser mayores que 0')

  const existing = await (prisma as any).contractTemplate.findFirst({
    where: { organizationId: data.organizationId, name },
  })
  if (existing) throw new Error(`Ya existe una plantilla llamada "${name}"`)

  const last = await (prisma as any).contractTemplate.findFirst({
    where: { organizationId: data.organizationId },
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true },
  })

  const template = await (prisma as any).contractTemplate.create({
    data: {
      organizationId: data.organizationId,
      name,
      description: data.description?.trim() || null,
      color: data.color || '#6366f1',
      displayOrder: (last?.displayOrder ?? -1) + 1,
      versions: {
        create: { version: 1, isCurrent: true, ...normalizar(data.values) },
      },
    },
    include: { versions: true },
  })

  revalidatePath('/settings')
  revalidatePath('/employees')
  return template
}

/** Renombrar / recolorear. No toca las condiciones, así que no versiona. */
export async function updateContractTemplateMeta(id: string, data: {
  name?: string
  description?: string | null
  color?: string
  isActive?: boolean
}) {
  const updated = await (prisma as any).contractTemplate.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description?.trim() || null }),
      ...(data.color && { color: data.color }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })
  revalidatePath('/settings')
  return updated
}

/**
 * Cambiar las condiciones. Crea una versión nueva y jubila la anterior.
 *
 * Los contratos existentes NO se mueven: siguen en su versión hasta que se
 * migren explícitamente. Devuelve cuántos se han quedado en la versión vieja.
 */
export async function createTemplateVersion(templateId: string, values: TemplateValues) {
  if (!(values.weeklyHours > 0)) throw new Error('Las horas semanales deben ser mayores que 0')

  const current = await (prisma as any).contractTemplateVersion.findFirst({
    where: { templateId, isCurrent: true },
    include: { _count: { select: { contracts: true } } },
  })

  const nuevos = normalizar(values)

  // Si no cambia nada sustantivo, no se crea versión: evita inflar el histórico.
  if (current) {
    const igual = CAMPOS_VERSION.every(k => (current as any)[k] === (nuevos as any)[k])
    if (igual) return { created: false, version: current.version, pending: 0 }
  }

  const last = await (prisma as any).contractTemplateVersion.findFirst({
    where: { templateId },
    orderBy: { version: 'desc' },
    select: { version: true },
  })

  const [, version] = await prisma.$transaction([
    (prisma as any).contractTemplateVersion.updateMany({
      where: { templateId, isCurrent: true },
      data: { isCurrent: false },
    }),
    (prisma as any).contractTemplateVersion.create({
      data: {
        templateId,
        version: (last?.version ?? 0) + 1,
        isCurrent: true,
        ...nuevos,
      },
    }),
  ])

  revalidatePath('/settings')
  revalidatePath('/employees')
  return {
    created: true,
    version: (version as any).version,
    // Empleados que siguen en la versión anterior.
    pending: current?._count?.contracts ?? 0,
  }
}

/** Mueve a la versión vigente todos los contratos activos de la plantilla. */
export async function migrateEmployeesToCurrentVersion(templateId: string) {
  const current = await (prisma as any).contractTemplateVersion.findFirst({
    where: { templateId, isCurrent: true },
    select: { id: true, version: true },
  })
  if (!current) throw new Error('La plantilla no tiene versión vigente')

  const versions = await (prisma as any).contractTemplateVersion.findMany({
    where: { templateId, isCurrent: false },
    select: { id: true },
  })
  if (versions.length === 0) return { migrated: 0, version: current.version }

  const res = await prisma.employeeContract.updateMany({
    where: {
      isActive: true,
      templateVersionId: { in: versions.map((v: any) => v.id) },
    } as any,
    data: { templateVersionId: current.id } as any,
  })

  revalidatePath('/settings')
  revalidatePath('/employees')
  revalidatePath('/planning')
  return { migrated: res.count, version: current.version }
}

export async function deleteContractTemplate(id: string) {
  const enUso = await prisma.employeeContract.count({
    where: { templateVersion: { templateId: id } } as any,
  })
  if (enUso > 0) {
    throw new Error(
      `La plantilla está asignada a ${enUso} contrato(s). Cambia esos empleados de plantilla, ` +
      `o desactívala para que no se pueda asignar a nadie nuevo conservando el histórico.`
    )
  }
  await (prisma as any).contractTemplate.delete({ where: { id } })
  revalidatePath('/settings')
  return { success: true }
}

// ── Asignación a empleados ──────────────────────────────────────────────────

/**
 * Asigna una plantilla a un empleado. Cierra el contrato anterior y abre uno
 * nuevo apuntando a la versión vigente, en vez de editar el existente: así
 * queda rastro de cuándo cambió de condiciones.
 */
export async function assignContractTemplate(data: {
  employeeId: string
  templateId: string
  startDate: string
  endDate?: string | null
  hourlyWage?: number | null
  hourlyCost?: number | null
  notes?: string | null
}) {
  const current = await (prisma as any).contractTemplateVersion.findFirst({
    where: { templateId: data.templateId, isCurrent: true },
  })
  if (!current) throw new Error('La plantilla no tiene una versión vigente')

  const startDate = new Date(data.startDate)

  await prisma.$transaction(async (tx) => {
    // Cerrar los contratos activos anteriores.
    await tx.employeeContract.updateMany({
      where: { employeeId: data.employeeId, isActive: true },
      data: { isActive: false, endDate: startDate },
    })

    await tx.employeeContract.create({
      data: {
        employeeId: data.employeeId,
        templateVersionId: current.id,
        startDate,
        endDate: data.endDate ? new Date(data.endDate) : null,
        hourlyWage: data.hourlyWage ?? null,
        hourlyCost: data.hourlyCost ?? null,
        notes: data.notes ?? null,
        isActive: true,
        // Columnas legacy: siguen siendo NOT NULL en la tabla hasta que se
        // ejecute el DROP opcional de la migración. Se rellenan con la versión
        // para que un dump antiguo siga siendo legible, pero NADIE las lee.
        contractType: current.contractType,
        weeklyHours: current.weeklyHours,
        minWeeklyHours: current.minWeeklyHours,
        maxWeeklyHours: current.maxWeeklyHours,
        maxDailyHours: current.maxDailyHours ?? 9,
        minRestBetweenShifts: current.minRestBetweenShifts ?? 12,
        maxConsecutiveDays: current.maxConsecutiveDays ?? 6,
        annualMaxHours: current.annualMaxHours ?? 1791,
        preferContinuous: current.preferContinuous,
        allowSplit: current.allowSplit,
      } as any,
    })
  })

  revalidatePath(`/employees/${data.employeeId}`)
  revalidatePath('/employees')
  revalidatePath('/planning')
  return { success: true }
}
