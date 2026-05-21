'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireOrgContext } from '@/lib/session'
import { auth } from '@/lib/auth'
import { startOfDay, endOfDay, format, addMinutes, parseISO } from 'date-fns'

// ── Tipos ────────────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function calcMinutes(clockIn: Date, clockOut: Date): number {
  return Math.round((clockOut.getTime() - clockIn.getTime()) / 60000)
}

// ── Fichar entrada (empleado) ─────────────────────────────────────────────────

export async function clockIn(data: {
  employeeId: string
  lat?: number
  lng?: number
}) {
  const session = await auth()
  if (!session?.user) throw new Error('No autenticado')

  const today = new Date()
  const todayDate = startOfDay(today)

  // Verificar que no hay ya una entrada activa hoy
  const existing = await prisma.timeClockEntry.findFirst({
    where: {
      employeeId: data.employeeId,
      date: todayDate,
      clockOut: null,
    },
  })
  if (existing) throw new Error('Ya tienes una entrada activa hoy')

  // Buscar el turno asignado para hoy
  const assignment = await prisma.scheduleAssignment.findFirst({
    where: {
      employeeId: data.employeeId,
      date: { gte: todayDate, lt: endOfDay(today) },
    },
    include: { planningPeriod: { include: { organization: true } } },
  })

  const organizationId = assignment?.planningPeriod?.organizationId
    ?? (await prisma.employee.findUnique({ where: { id: data.employeeId } }))?.organizationId
  if (!organizationId) throw new Error('Organización no encontrada')

  const entry = await prisma.timeClockEntry.create({
    data: {
      employeeId: data.employeeId,
      organizationId,
      date: todayDate,
      clockIn: today,
      clockInLat: data.lat,
      clockInLng: data.lng,
      scheduledStart: assignment?.startTime ?? null,
      scheduledEnd: assignment?.endTime ?? null,
      assignmentId: assignment?.id ?? null,
      scheduledMinutes: assignment
        ? (() => {
            let s = timeToMin(assignment.startTime), e = timeToMin(assignment.endTime)
            if (e <= s) e += 24 * 60
            return e - s - (assignment.breakMinutes || 0)
          })()
        : null,
      status: 'PENDING',
      entryType: 'MANUAL',
    },
  })

  // Incidencia si llega tarde (>5 min)
  if (assignment) {
    const scheduledMin = timeToMin(assignment.startTime)
    const nowMin = today.getHours() * 60 + today.getMinutes()
    if (nowMin > scheduledMin + 5) {
      await createIncidentNotification(
        organizationId,
        data.employeeId,
        `Llegada tarde: fichaje a las ${format(today, 'HH:mm')} (turno desde ${assignment.startTime})`
      )
    }
  }

  revalidatePath('/portal')
  revalidatePath('/timeclock')
  return entry
}

// ── Fichar salida (empleado) ──────────────────────────────────────────────────

export async function clockOut(data: {
  entryId: string
  lat?: number
  lng?: number
}) {
  const session = await auth()
  if (!session?.user) throw new Error('No autenticado')

  const entry = await prisma.timeClockEntry.findUnique({
    where: { id: data.entryId },
    include: { employee: true },
  })
  if (!entry) throw new Error('Fichaje no encontrado')
  if (entry.clockOut) throw new Error('Ya has fichado la salida')

  const now = new Date()
  const workedMinutes = calcMinutes(entry.clockIn!, now)
  const scheduled = entry.scheduledMinutes ?? workedMinutes
  const extraMinutes = workedMinutes - scheduled

  // Estado final
  let status: 'COMPLETE' | 'OVERTIME' | 'INCIDENT' = 'COMPLETE'
  if (extraMinutes > 5) status = 'OVERTIME'
  else if (entry.scheduledEnd) {
    const scheduledEndMin = timeToMin(entry.scheduledEnd)
    const nowMin = now.getHours() * 60 + now.getMinutes()
    if (nowMin < scheduledEndMin - 5) status = 'INCIDENT'
  }

  const updated = await prisma.timeClockEntry.update({
    where: { id: data.entryId },
    data: {
      clockOut: now,
      clockOutLat: data.lat,
      clockOutLng: data.lng,
      workedMinutes,
      extraMinutes,
      status,
    },
  })

  // Notificar incidencias al manager
  if (status === 'INCIDENT') {
    await createIncidentNotification(
      entry.organizationId,
      entry.employeeId,
      `Salida anticipada: fichaje a las ${format(now, 'HH:mm')} (turno hasta ${entry.scheduledEnd})`
    )
  }

  revalidatePath('/portal')
  revalidatePath('/timeclock')
  return updated
}

// ── Auto-completar fichajes (cron o trigger) ──────────────────────────────────

export async function autoCompleteMissingClocks(organizationId: string) {
  const ctx = await requireOrgContext()
  const now = new Date()
  const today = startOfDay(now)

  // Buscar entradas sin salida de hoy cuyo turno ya terminó
  const pending = await prisma.timeClockEntry.findMany({
    where: {
      organizationId,
      date: today,
      clockOut: null,
      scheduledEnd: { not: null },
    },
  })

  for (const entry of pending) {
    if (!entry.scheduledEnd || !entry.clockIn) continue
    const endMin = timeToMin(entry.scheduledEnd)
    const nowMin = now.getHours() * 60 + now.getMinutes()

    // Solo auto-completar si ya pasó la hora de fin + 15 min
    if (nowMin < endMin + 15) continue

    // Calcular hora de salida: hora fin del turno
    const clockOutTime = new Date(today)
    clockOutTime.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0)

    const workedMinutes = calcMinutes(entry.clockIn, clockOutTime)
    const extraMinutes = workedMinutes - (entry.scheduledMinutes ?? workedMinutes)

    await prisma.timeClockEntry.update({
      where: { id: entry.id },
      data: {
        clockOut: clockOutTime,
        workedMinutes,
        extraMinutes,
        autoCompletedOut: true,
        status: extraMinutes > 5 ? 'OVERTIME' : 'COMPLETE',
      },
    })

    await createIncidentNotification(
      organizationId,
      entry.employeeId,
      `Salida auto-completada a las ${entry.scheduledEnd} por no fichar`
    )
  }

  // Buscar empleados con turno hoy que nunca ficharon
  const assignmentsToday = await prisma.scheduleAssignment.findMany({
    where: {
      planningPeriod: { organizationId },
      date: { gte: today, lt: endOfDay(now) },
    },
    include: { employee: true },
  })

  for (const assignment of assignmentsToday) {
    const endMin = timeToMin(assignment.endTime)
    const nowMin = now.getHours() * 60 + now.getMinutes()
    if (nowMin < endMin + 15) continue

    const existingEntry = await prisma.timeClockEntry.findFirst({
      where: {
        employeeId: assignment.employeeId,
        date: today,
      },
    })
    if (existingEntry) continue

    // No fichó nada — crear entrada completa auto-completada
    const startMin = timeToMin(assignment.startTime)
    const clockInTime = new Date(today)
    clockInTime.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0)
    const clockOutTime = new Date(today)
    clockOutTime.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0)

    let s = startMin, e = endMin
    if (e <= s) e += 24 * 60
    const scheduledMinutes = e - s - (assignment.breakMinutes || 0)

    await prisma.timeClockEntry.create({
      data: {
        employeeId: assignment.employeeId,
        organizationId,
        date: today,
        clockIn: clockInTime,
        clockOut: clockOutTime,
        scheduledStart: assignment.startTime,
        scheduledEnd: assignment.endTime,
        assignmentId: assignment.id,
        scheduledMinutes,
        workedMinutes: scheduledMinutes,
        extraMinutes: 0,
        autoCompletedIn: true,
        autoCompletedOut: true,
        entryType: 'AUTO_COMPLETE',
        status: 'INCOMPLETE',
      },
    })

    await createIncidentNotification(
      organizationId,
      assignment.employeeId,
      `No fichó entrada ni salida — turno ${assignment.startTime}–${assignment.endTime} auto-completado`
    )
  }

  revalidatePath('/timeclock')
}

// ── Modificar fichaje (manager) ───────────────────────────────────────────────

export async function modifyClockEntry(data: {
  entryId: string
  clockIn?: string   // "HH:MM"
  clockOut?: string  // "HH:MM"
  reason: string
}) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('No autenticado')
  if (!data.reason?.trim()) throw new Error('El motivo de la modificación es obligatorio')

  const entry = await prisma.timeClockEntry.findUnique({ where: { id: data.entryId } })
  if (!entry) throw new Error('Fichaje no encontrado')

  const date = new Date(entry.date)

  const newClockIn = data.clockIn
    ? (() => {
        const [h, m] = data.clockIn!.split(':').map(Number)
        const d = new Date(date); d.setHours(h, m, 0, 0); return d
      })()
    : entry.clockIn

  const newClockOut = data.clockOut
    ? (() => {
        const [h, m] = data.clockOut!.split(':').map(Number)
        const d = new Date(date); d.setHours(h, m, 0, 0); return d
      })()
    : entry.clockOut

  const workedMinutes = newClockIn && newClockOut
    ? calcMinutes(newClockIn, newClockOut)
    : entry.workedMinutes

  const extraMinutes = workedMinutes !== null && entry.scheduledMinutes !== null
    ? workedMinutes - (entry.scheduledMinutes ?? 0)
    : entry.extraMinutes

  const updated = await prisma.timeClockEntry.update({
    where: { id: data.entryId },
    data: {
      clockIn: newClockIn,
      clockOut: newClockOut,
      workedMinutes,
      extraMinutes,
      originalClockIn: entry.originalClockIn ?? entry.clockIn,
      originalClockOut: entry.originalClockOut ?? entry.clockOut,
      modifiedById: session.user.id,
      modifiedAt: new Date(),
      modificationReason: data.reason,
      entryType: 'MODIFIED',
      status: extraMinutes && extraMinutes > 5 ? 'OVERTIME' : 'COMPLETE',
    },
  })

  revalidatePath('/timeclock')
  return updated
}

// ── Obtener fichajes del manager ──────────────────────────────────────────────

export async function getTimeclockEntries(params: {
  organizationId: string
  dateFrom: string
  dateTo: string
  employeeId?: string
}) {
  const entries = await prisma.timeClockEntry.findMany({
    where: {
      organizationId: params.organizationId,
      date: {
        gte: new Date(params.dateFrom),
        lte: new Date(params.dateTo),
      },
      ...(params.employeeId ? { employeeId: params.employeeId } : {}),
    },
    include: {
      employee: {
        include: {
          skills: { include: { laborRole: true }, take: 1 },
        },
      },
      modifiedBy: { select: { name: true, email: true } },
    },
    orderBy: [{ date: 'desc' }, { clockIn: 'asc' }],
  })
  return entries
}

// ── Obtener fichaje activo del empleado ───────────────────────────────────────

export async function getActiveClockEntry(employeeId: string) {
  const today = startOfDay(new Date())
  return prisma.timeClockEntry.findFirst({
    where: {
      employeeId,
      date: today,
    },
    orderBy: { createdAt: 'desc' },
  })
}

// ── Helper: crear notificación de incidencia ──────────────────────────────────

async function createIncidentNotification(
  organizationId: string,
  employeeId: string,
  message: string
) {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true },
    })
    const managers = await prisma.organizationMember.findMany({
      where: { organizationId, role: { in: ['ORG_OWNER', 'MANAGER'] } },
      select: { userId: true },
    })
    await prisma.notification.createMany({
      data: managers.map(m => ({
        userId: m.userId,
        organizationId,
        type: 'CLOCK_INCIDENT',
        title: `Incidencia de fichaje — ${employee?.firstName} ${employee?.lastName}`,
        message,
        isRead: false,
      })),
    })
  } catch (e) {
    console.error('Error creating notification:', e)
  }
}
