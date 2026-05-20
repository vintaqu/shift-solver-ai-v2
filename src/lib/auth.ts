import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: string
      organizationId?: string | null
      locationId?: string | null
    }
  }
  interface User {
    role: string
    organizationId?: string | null
    locationId?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    organizationId?: string | null
    locationId?: string | null
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    // ── Provider 1: Email + Password (Admin, Owner, Manager) ──────────────
    Credentials({
      id: 'credentials',
      name: 'Email y contraseña',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = z.object({
          email: z.string().email(),
          password: z.string().min(1),
        }).safeParse(credentials)

        if (!parsed.success) return null

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: {
            memberships: {
              include: { organization: { include: { locations: { take: 1 } } } },
              take: 1,
            },
          },
        })

        if (!user || !user.isActive) return null

        // Verificar contraseña con bcrypt
        const valid = user.hashedPassword
          ? await bcrypt.compare(parsed.data.password, user.hashedPassword)
          : false

        if (!valid) return null

        const membership = user.memberships[0]
        const organization = membership?.organization
        const location = organization?.locations[0]

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: membership?.role ?? user.role,
          organizationId: organization?.id ?? null,
          locationId: location?.id ?? null,
        }
      },
    }),

    // ── Provider 2: PIN de empleado ────────────────────────────────────────
    Credentials({
      id: 'employee-pin',
      name: 'PIN empleado',
      credentials: {
        employeeId: { label: 'Employee ID', type: 'text' },
        pin: { label: 'PIN', type: 'password' },
        organizationSlug: { label: 'Slug', type: 'text' },
      },
      async authorize(credentials) {
        const parsed = z.object({
          employeeId: z.string().min(1),
          pin: z.string().min(4).max(6),
          organizationSlug: z.string().min(1),
        }).safeParse(credentials)

        if (!parsed.success) return null

        // Verificar que el empleado pertenece a la organización correcta
        const employee = await prisma.employee.findFirst({
          where: {
            id: parsed.data.employeeId,
            organization: { slug: parsed.data.organizationSlug },
            isActive: true,
          },
          include: {
            organization: { include: { locations: { take: 1 } } },
          },
        })

        if (!employee || !employee.pin) return null

        const validPin = await bcrypt.compare(parsed.data.pin, employee.pin)
        if (!validPin) return null

        // Usar la cuenta de usuario vinculada si existe, o crear una virtual
        return {
          id: `emp_${employee.id}`,  // prefijo para distinguir en JWT
          email: `${employee.id}@employee.internal`,
          name: `${employee.firstName} ${employee.lastName}`,
          role: 'EMPLOYEE',
          organizationId: employee.organizationId,
          locationId: employee.organization.locations[0]?.id ?? null,
          // Guardamos employeeId en el token
          employeeId: employee.id,
        } as any
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.organizationId = user.organizationId ?? null
        token.locationId = user.locationId ?? null
        if ((user as any).employeeId) {
          token.employeeId = (user as any).employeeId
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.organizationId = token.organizationId ?? null
        session.user.locationId = token.locationId ?? null
        if (token.employeeId) {
          (session.user as any).employeeId = token.employeeId
        }
      }
      return session
    },
  },
})

// ── Helpers de rol ─────────────────────────────────────────────────────────
export function isSuperAdmin(role: string) { return role === 'SUPER_ADMIN' }
export function isOwnerOrAbove(role: string) { return ['SUPER_ADMIN', 'ORG_OWNER'].includes(role) }
export function isManagerOrAbove(role: string) { return ['SUPER_ADMIN', 'ORG_OWNER', 'MANAGER'].includes(role) }
export function isEmployee(role: string) { return role === 'EMPLOYEE' }
