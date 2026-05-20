import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateWeeklyExcel } from '@/lib/exportWeekly'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const periodId = req.nextUrl.searchParams.get('periodId')
  if (!periodId) return NextResponse.json({ error: 'periodId requerido' }, { status: 400 })

  const period = await prisma.planningPeriod.findUnique({
    where: { id: periodId },
    include: {
      location: { include: { organization: true } },
      assignments: {
        include: {
          employee: {
            include: {
              contracts: { where: { isActive: true }, take: 1 },
              skills: { include: { laborRole: true } },
            },
          },
          laborRole: true,
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      },
    },
  })

  if (!period) return NextResponse.json({ error: 'Cuadrante no encontrado' }, { status: 404 })
  if (period.location.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const buffer = await generateWeeklyExcel(period)
  const filename = `cuadrante-${new Date(period.weekStart).toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
