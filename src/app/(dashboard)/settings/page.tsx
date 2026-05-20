import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { SettingsClient } from '@/components/settings/SettingsClient'
import { getSkillsAndRoles } from '@/server/actions/skills'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const organizationId = session.user.organizationId
  if (!organizationId) redirect('/dashboard')

  const [organization, members, { skills, roles }] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    }),
    getSkillsAndRoles(organizationId),
  ])

  if (!organization) redirect('/dashboard')

  return (
    <SettingsClient
      organization={JSON.parse(JSON.stringify(organization))}
      members={JSON.parse(JSON.stringify(members))}
      skills={JSON.parse(JSON.stringify(skills))}
      roles={JSON.parse(JSON.stringify(roles))}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    />
  )
}
