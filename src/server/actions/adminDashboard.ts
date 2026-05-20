'use server'

import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/session'
import { startOfWeek, endOfWeek, startOfMonth, subMonths, startOfDay } from 'date-fns'

export async function getAdminDashboardData() {
  await requireSuperAdmin()
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(now, { weekStartsOn: 1 })
  const monthStart = startOfMonth(now)
  const prevMonthStart = startOfMonth(subMonths(now, 1))
  const prevMonthEnd   = startOfMonth(now)
  const todayStart = startOfDay(now)

  const [
    totalOrgs,
    activeOrgs,
    totalUsers,
    totalEmployees,
    activeEmployees,
    totalPeriods,
    periodsThisWeek,
    periodsThisMonth,
    periodsPrevMonth,
    totalAssignments,
    assignmentsThisMonth,
    recentOrgs,
    recentUsers,
    legalFrameworks,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count(),  // todos activos por ahora
    prisma.user.count(),
    prisma.employee.count(),
    prisma.employee.count({ where: { isActive: true } }),
    prisma.planningPeriod.count(),
    prisma.planningPeriod.count({ where: { weekStart: { gte: weekStart, lte: weekEnd } } }),
    prisma.planningPeriod.count({ where: { weekStart: { gte: monthStart } } }),
    prisma.planningPeriod.count({ where: { weekStart: { gte: prevMonthStart, lt: prevMonthEnd } } }),
    prisma.scheduleAssignment.count(),
    prisma.scheduleAssignment.count({
      where: { planningPeriod: { weekStart: { gte: monthStart } } },
    }),
    prisma.organization.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { employees: true, members: true } },
        locations: { take: 1 },
      },
    }),
    prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      where: { role: { not: 'SUPER_ADMIN' } },
      include: {
        memberships: {
          include: { organization: { select: { name: true } } },
          take: 1,
        },
      },
    }),
    prisma.legalFramework.findMany({
      include: { _count: { select: { organizations: true, employees: true } } },
    }),
  ])

  // Distribución de roles
  const roleDistribution = await prisma.organizationMember.groupBy({
    by: ['role'],
    _count: true,
  })

  // Periodos con IA vs manuales
  const aiPeriods = await prisma.planningPeriod.count({ where: { origin: 'AUTOMATIC' } })
  const mixedPeriods = await prisma.planningPeriod.count({ where: { origin: 'MIXED' } })

  return {
    kpis: {
      totalOrgs,
      activeOrgs,
      totalUsers,
      totalEmployees,
      activeEmployees,
      totalPeriods,
      periodsThisWeek,
      periodsThisMonth,
      periodsPrevMonth,
      periodsGrowthPct: periodsPrevMonth > 0
        ? Math.round(((periodsThisMonth - periodsPrevMonth) / periodsPrevMonth) * 100)
        : 0,
      totalAssignments,
      assignmentsThisMonth,
      aiPeriods,
      aiUsagePct: totalPeriods > 0 ? Math.round(((aiPeriods + mixedPeriods) / totalPeriods) * 100) : 0,
    },
    recentOrgs: recentOrgs.map(o => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      employeesCount: o._count.employees,
      membersCount: o._count.members,
      locationName: o.locations[0]?.name ?? '—',
      createdAt: o.createdAt.toISOString(),
    })),
    recentUsers: recentUsers.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      orgName: u.memberships[0]?.organization?.name ?? '—',
      createdAt: u.createdAt.toISOString(),
    })),
    legalFrameworks: legalFrameworks.map(f => ({
      id: f.id,
      name: f.name,
      code: f.code,
      scope: f.scope,
      isActive: f.isActive,
      orgsCount: f._count.organizations,
      employeesCount: f._count.employees,
    })),
    roleDistribution: roleDistribution.map(r => ({
      role: r.role,
      count: r._count,
    })),
  }
}
