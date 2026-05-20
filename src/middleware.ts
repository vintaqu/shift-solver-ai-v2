import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Rutas públicas — no requieren auth
const PUBLIC_ROUTES = [
  '/login',
  '/api/auth',
  '/onboarding',
]

// Rutas de empleado — requieren auth pero solo rol EMPLOYEE
const EMPLOYEE_ROUTES = ['/portal']

// Rutas de restaurante (login por PIN) — siempre públicas
const RESTAURANT_LOGIN_PATTERN = /^\/r\/[^/]+\/login/

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Rutas estáticas — siempre pasar
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(png|jpg|svg|ico|css|js)$/)
  ) return NextResponse.next()

  // Login de restaurante (empleados) — público
  if (RESTAURANT_LOGIN_PATTERN.test(pathname)) return NextResponse.next()

  // Rutas públicas normales
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next()

  const token = await getToken({ req, secret: process.env.AUTH_SECRET })

  // Sin sesión → login
  if (!token) {
    // Si va al portal de empleado sin token → login del restaurante
    if (pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role = token.role as string

  // Empleado intentando acceder al dashboard → redirigir a su portal
  if (role === 'EMPLOYEE' && !pathname.startsWith('/portal') && !pathname.startsWith('/api')) {
    return NextResponse.redirect(new URL('/portal', req.url))
  }

  // No-empleado intentando acceder al portal → redirigir al dashboard
  if (role !== 'EMPLOYEE' && pathname.startsWith('/portal')) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // Super admin — acceso total sin necesidad de organización
  if (role === 'SUPER_ADMIN') {
    // Si va al dashboard raíz o login, redirigir al panel de admin
    if (pathname === '/dashboard' || pathname === '/') {
      return NextResponse.redirect(new URL('/admin', req.url))
    }
    return NextResponse.next()
  }

  // Owner y Manager — acceso al dashboard completo
  if (['ORG_OWNER', 'MANAGER'].includes(role)) {
    // Manager no puede acceder a facturación/suscripción
    if (role === 'MANAGER' && pathname.startsWith('/billing')) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
