// ============================================================
// Shift Solver AI — Session & Org context helpers
// ============================================================

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export interface OrgContext {
  userId: string
  userRole: string
  userName: string | null
  userEmail: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  locationId: string
  locationName: string
}

// Helper principal — úsalo en todos los page.tsx del dashboard
export async function requireOrgContext(): Promise<OrgContext> {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role
  if (role === 'EMPLOYEE') redirect('/portal')
  // Super Admin no tiene organización — va a su panel
  if (role === 'SUPER_ADMIN' && !session.user.organizationId) redirect('/admin')

  const organizationId = session.user.organizationId
  if (!organizationId) redirect('/onboarding')

  const locationId = session.user.locationId
  if (!locationId) {
    // Buscar primer local de la organización
    const loc = await prisma.location.findFirst({
      where: { organizationId },
      include: { organization: true },
    })
    if (!loc) redirect('/onboarding')
    return {
      userId: session.user.id,
      userRole: role,
      userName: session.user.name ?? null,
      userEmail: session.user.email,
      organizationId,
      organizationName: loc.organization.name,
      organizationSlug: loc.organization.slug,
      locationId: loc.id,
      locationName: loc.name,
    }
  }

  const [location] = await Promise.all([
    prisma.location.findUnique({
      where: { id: locationId },
      include: { organization: true },
    }),
  ])

  if (!location) redirect('/onboarding')

  return {
    userId: session.user.id,
    userRole: role,
    userName: session.user.name ?? null,
    userEmail: session.user.email,
    organizationId,
    organizationName: location.organization.name,
    organizationSlug: location.organization.slug,
    locationId,
    locationName: location.name,
  }
}

// Para SUPER_ADMIN que puede ver todas las organizaciones
export async function requireSuperAdmin() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'SUPER_ADMIN') redirect('/dashboard')
  return session
}
