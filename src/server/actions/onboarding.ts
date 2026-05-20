'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // quitar acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base
  let i = 1
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${base}-${i++}`
  }
  return slug
}

export async function createOrganizationWithOwner(data: {
  // Organización
  orgName: string
  sector: string
  timezone: string
  // Local
  locationName: string
  city: string
  // Owner
  ownerName: string
  ownerEmail: string
  ownerPassword: string
}) {
  // Verificar email único
  const existingUser = await prisma.user.findUnique({ where: { email: data.ownerEmail.toLowerCase().trim() } })
  if (existingUser) throw new Error('Ya existe una cuenta con ese email')

  const slug = await ensureUniqueSlug(generateSlug(data.orgName))
  const hashedPassword = await bcrypt.hash(data.ownerPassword, 12)

  // Crear todo en una transacción
  const result = await prisma.$transaction(async tx => {
    // 1. Organización
    const org = await tx.organization.create({
      data: {
        name: data.orgName.trim(),
        slug,
        sector: data.sector,
        timezone: data.timezone,
        brandColor: '#4f46e5',
        loginMessage: `Bienvenido a ${data.orgName.trim()}`,
      },
    })

    // 2. Local
    const location = await tx.location.create({
      data: {
        organizationId: org.id,
        name: data.locationName.trim(),
        city: data.city.trim(),
        isActive: true,
      },
    })

    // 3. Usuario owner
    const user = await tx.user.create({
      data: {
        email: data.ownerEmail.toLowerCase().trim(),
        name: data.ownerName.trim(),
        hashedPassword,
        role: 'ORG_OWNER',
        isActive: true,
        memberships: {
          create: {
            organizationId: org.id,
            role: 'ORG_OWNER',
          },
        },
      },
    })

    // 4. Roles y etiquetas por defecto
    await tx.laborRole.createMany({
      data: [
        { organizationId: org.id, name: 'Camarero básico',  level: 'BASIC',        color: '#6366f1', priority: 1, isCritical: false },
        { organizationId: org.id, name: 'Semi-encargado',   level: 'SEMI_MANAGER', color: '#0891b2', priority: 2, isCritical: true  },
        { organizationId: org.id, name: 'Encargado',        level: 'MANAGER',      color: '#7c3aed', priority: 3, isCritical: true  },
        { organizationId: org.id, name: 'Dueño',            level: 'OWNER',        color: '#64748b', priority: 4, isCritical: false },
      ],
    })

    await tx.skill.createMany({
      data: [
        { organizationId: org.id, name: 'APERTURA',   color: '#10b981' },
        { organizationId: org.id, name: 'CIERRE',     color: '#78716c' },
        { organizationId: org.id, name: 'CAJERA',     color: '#6366f1' },
        { organizationId: org.id, name: 'BARISTA',    color: '#8b5cf6' },
        { organizationId: org.id, name: 'BARRA',      color: '#0ea5e9' },
        { organizationId: org.id, name: 'BANDEJERA',  color: '#ec4899' },
        { organizationId: org.id, name: 'PASTAS',     color: '#f59e0b' },
        { organizationId: org.id, name: 'PLANCHISTA', color: '#ef4444' },
        { organizationId: org.id, name: 'COMANDERA',  color: '#f97316' },
        { organizationId: org.id, name: 'DELIVERY',   color: '#84cc16' },
        { organizationId: org.id, name: 'CONTABLE',   color: '#14b8a6' },
      ],
    })

    // 5. Plantilla de cobertura por defecto (vacía)
    await tx.coverageTemplate.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        name: 'Configuración base',
        description: 'Plantilla principal del restaurante',
        color: '#6366f1',
        isDefault: true,
        isActive: false,
      },
    })

    // 6. Regla de negocio por defecto (convenio hostelería)
    await tx.businessRule.create({
      data: {
        organizationId,
        name: 'Convenio hostelería Tarragona',
        type: 'MAX_HOURS',
        value: JSON.stringify({
          maxDailyHours: 9,
          maxWeeklyHours: 40,
          maxAnnualHours: 1791,
          minRestBetweenShifts: 12,
          minWeeklyRestDays: 2,
          consecutiveRestDays: true,
          maxOvertimeAnnual: 80,
        }),
        isActive: true,
      },
    })

    return { org, location, user }
  })

  return {
    organizationId: result.org.id,
    locationId: result.location.id,
    userId: result.user.id,
    slug,
  }
}

// Para SUPER_ADMIN: lista de todas las organizaciones
export async function getAllOrganizations() {
  return prisma.organization.findMany({
    include: {
      _count: { select: { members: true, employees: true, locations: true } },
      locations: { take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  })
}
