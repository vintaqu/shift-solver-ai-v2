export const dynamic = 'force-dynamic'

import { requireOrgContext } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { startOfWeek, endOfWeek } from 'date-fns'
import { TimeclockManagerPanel } from '@/components/timeclock/TimeclockManagerPanel'

export default async function TimeclockPage() {
  const ctx = await requireOrgContext()
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

  const entries = await prisma.timeClockEntry.findMany({
    where: {
      organizationId: ctx.organizationId,
      date: { gte: weekStart, lte: weekEnd },
    },
    include: {
      employee: {
        include: { skills: { include: { laborRole: true }, take: 1 } },
      },
      modifiedBy: { select: { name: true, email: true } },
    },
    orderBy: [{ date: 'desc' }, { clockIn: 'asc' }],
  })

  return (
    <div className="p-6 space-y-5 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Control horario</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Fichajes de esta semana · Registro legal según RDL 8/2019
        </p>
      </div>
      <TimeclockManagerPanel
        entries={JSON.parse(JSON.stringify(entries))}
        organizationId={ctx.organizationId}
      />
    </div>
  )
}
