'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getPeriodOrThrow(planningPeriodId: string) {
  const period = await prisma.planningPeriod.findUnique({
    where: { id: planningPeriodId },
  })
  if (!period) throw new Error('Planning period not found')
  return period
}

async function getAssignmentOrThrow(assignmentId: string) {
  const a = await prisma.scheduleAssignment.findUnique({
    where: { id: assignmentId },
    include: { planningPeriod: true },
  })
  if (!a) throw new Error('Assignment not found')
  return a
}

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function calcHours(startTime: string, endTime: string, breakMinutes: number) {
  let s = timeToMin(startTime), e = timeToMin(endTime)
  if (e <= s) e += 24 * 60
  return Math.max(0, (e - s - breakMinutes) / 60)
}

function calcNightHours(startTime: string, endTime: string) {
  const s = timeToMin(startTime)
  let e = timeToMin(endTime)
  if (e <= s) e += 24 * 60
  let night = 0
  for (let m = s; m < e; m++) {
    const n = m % (24 * 60)
    if (n >= 22 * 60 || n < 6 * 60) night++
  }
  return night / 60
}

// ─── Create assignment ────────────────────────────────────────────────────────
export async function createAssignment(planningPeriodId: string, values: {
  employeeId: string
  date: Date
  startTime: string
  endTime: string
  breakMinutes: number
  isSplit?: boolean
  isLocked?: boolean
  notes?: string
  laborRoleId?: string
}) {
  const period = await getPeriodOrThrow(planningPeriodId)
  if (period.status === 'PUBLISHED') throw new Error('El cuadrante está publicado. Crea una nueva versión.')

  const normalHours = calcHours(values.startTime, values.endTime, values.breakMinutes)
  const nightHours = calcNightHours(values.startTime, values.endTime)

  const assignment = await prisma.scheduleAssignment.create({
    data: {
      planningPeriodId,
      employeeId: values.employeeId,
      locationId: period.locationId,
      laborRoleId: values.laborRoleId || null,
      date: values.date,
      startTime: values.startTime,
      endTime: values.endTime,
      breakMinutes: values.breakMinutes,
      origin: 'MANUAL',
      status: 'DRAFT',
      isLocked: values.isLocked ?? false,
      isSplit: values.isSplit ?? false,
      normalHours,
      nightHours,
      overtimeHours: 0,
      notes: values.notes || null,
    },
  })

  await prisma.auditLog.create({
    data: {
      organizationId: period.organizationId,
      action: 'CREATE',
      entity: 'ScheduleAssignment',
      entityId: assignment.id,
      newValues: assignment as object,
    },
  })

  revalidatePath(`/planning/week/${planningPeriodId}`)
  return assignment
}

// ─── Update assignment ────────────────────────────────────────────────────────
export async function updateAssignment(assignmentId: string, values: {
  startTime?: string
  endTime?: string
  breakMinutes?: number
  notes?: string
  isLocked?: boolean
  isSplit?: boolean
  laborRoleId?: string
}) {
  const existing = await getAssignmentOrThrow(assignmentId)
  if (existing.isLocked) throw new Error('El turno está bloqueado.')

  const startTime = values.startTime || existing.startTime
  const endTime = values.endTime || existing.endTime
  const breakMinutes = values.breakMinutes ?? existing.breakMinutes

  const normalHours = calcHours(startTime, endTime, breakMinutes)
  const nightHours = calcNightHours(startTime, endTime)

  const updated = await prisma.scheduleAssignment.update({
    where: { id: assignmentId },
    data: {
      ...(values.startTime && { startTime: values.startTime }),
      ...(values.endTime && { endTime: values.endTime }),
      ...(values.breakMinutes !== undefined && { breakMinutes: values.breakMinutes }),
      ...(values.notes !== undefined && { notes: values.notes }),
      ...(values.isLocked !== undefined && { isLocked: values.isLocked }),
      ...(values.isSplit !== undefined && { isSplit: values.isSplit }),
      ...(values.laborRoleId !== undefined && { laborRoleId: values.laborRoleId }),
      normalHours,
      nightHours,
      origin: 'EDITED',
    },
  })

  await prisma.auditLog.create({
    data: {
      organizationId: existing.planningPeriod.organizationId,
      action: 'UPDATE',
      entity: 'ScheduleAssignment',
      entityId: assignmentId,
      oldValues: existing as object,
      newValues: updated as object,
    },
  })

  revalidatePath(`/planning/week/${existing.planningPeriodId}`)
  return updated
}

// ─── Move assignment ──────────────────────────────────────────────────────────
export async function moveAssignment(assignmentId: string, newEmployeeId: string, newDate: Date) {
  const existing = await getAssignmentOrThrow(assignmentId)
  if (existing.isLocked) throw new Error('El turno está bloqueado.')

  // Normalizar la fecha a medianoche UTC para evitar desfase de timezone
  const normalizedDate = new Date(Date.UTC(
    newDate.getFullYear(),
    newDate.getMonth(),
    newDate.getDate(),
    0, 0, 0, 0
  ))

  const updated = await prisma.scheduleAssignment.update({
    where: { id: assignmentId },
    data: { employeeId: newEmployeeId, date: normalizedDate, origin: 'EDITED' },
  })

  revalidatePath(`/planning/week/${existing.planningPeriodId}`)
  return updated
}

// ─── Delete assignment ────────────────────────────────────────────────────────
export async function deleteAssignment(assignmentId: string) {
  const existing = await getAssignmentOrThrow(assignmentId)
  if (existing.isLocked) throw new Error('El turno está bloqueado. Desbloquéalo primero.')

  await prisma.scheduleAssignment.delete({ where: { id: assignmentId } })
  revalidatePath(`/planning/week/${existing.planningPeriodId}`)
  return { success: true }
}

// ─── Toggle lock ──────────────────────────────────────────────────────────────
export async function toggleAssignmentLock(assignmentId: string) {
  const existing = await getAssignmentOrThrow(assignmentId)
  const updated = await prisma.scheduleAssignment.update({
    where: { id: assignmentId },
    data: { isLocked: !existing.isLocked },
  })
  revalidatePath(`/planning/week/${existing.planningPeriodId}`)
  return updated
}

// ─── Publish ──────────────────────────────────────────────────────────────────
// ── Intercambiar turnos entre dos empleados en un rango de fechas ──────────
// scope 'day': una fecha concreta · scope 'week': la semana entera del periodo
export async function swapAssignments(data: {
  planningPeriodId: string
  employeeAId: string
  employeeBId: string
  fromDateISO: string   // inicio del rango (inclusive)
  toDateISO: string     // fin del rango (inclusive)
}) {
  const period = await prisma.planningPeriod.findUnique({ where: { id: data.planningPeriodId } })
  if (!period) throw new Error('Periodo de planificación no encontrado')
  if (period.status === 'PUBLISHED') throw new Error('No se puede intercambiar en una semana publicada')
  if (data.employeeAId === data.employeeBId) throw new Error('Selecciona dos empleados distintos')

  const from = new Date(data.fromDateISO + 'T00:00:00Z')
  const to = new Date(data.toDateISO + 'T23:59:59Z')

  const [aShifts, bShifts] = await Promise.all([
    prisma.scheduleAssignment.findMany({
      where: { planningPeriodId: data.planningPeriodId, employeeId: data.employeeAId, date: { gte: from, lte: to } },
      select: { id: true },
    }),
    prisma.scheduleAssignment.findMany({
      where: { planningPeriodId: data.planningPeriodId, employeeId: data.employeeBId, date: { gte: from, lte: to } },
      select: { id: true },
    }),
  ])

  if (aShifts.length === 0 && bShifts.length === 0) {
    throw new Error('Ninguno de los dos empleados tiene turnos en ese rango')
  }

  await prisma.$transaction([
    prisma.scheduleAssignment.updateMany({
      where: { id: { in: aShifts.map(s => s.id) } },
      data: { employeeId: data.employeeBId },
    }),
    prisma.scheduleAssignment.updateMany({
      where: { id: { in: bShifts.map(s => s.id) } },
      data: { employeeId: data.employeeAId },
    }),
  ])

  revalidatePath(`/planning/week/${data.planningPeriodId}`)
  return { movedFromA: aShifts.length, movedFromB: bShifts.length }
}

export async function publishPlanningPeriod(planningPeriodId: string) {
  const period = await getPeriodOrThrow(planningPeriodId)

  await prisma.$transaction([
    prisma.planningPeriod.update({
      where: { id: planningPeriodId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    }),
    prisma.scheduleAssignment.updateMany({
      where: { planningPeriodId },
      data: { status: 'PUBLISHED' },
    }),
  ])

  revalidatePath(`/planning/week/${planningPeriodId}`)
  revalidatePath('/planning')
  return { success: true }
}

// ─── Create planning period ───────────────────────────────────────────────────
export async function createPlanningPeriod(data: {
  organizationId: string
  locationId: string
  weekStart: Date
}) {
  const weekEnd = new Date(data.weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const period = await prisma.planningPeriod.create({
    data: {
      organizationId: data.organizationId,
      locationId: data.locationId,
      weekStart: data.weekStart,
      weekEnd,
      status: 'DRAFT',
      origin: 'MANUAL',
      version: 1,
    },
  })

  revalidatePath('/planning')
  return period
}
