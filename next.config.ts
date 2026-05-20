import type { NextConfig } from 'next'

const securityHeaders = [
  // Evita que la app se cargue en un iframe (clickjacking)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Evita MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Referrer policy
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Permissions policy
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // HSTS — solo HTTPS en producción
  ...(process.env.NODE_ENV === 'production' ? [{
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  }] : []),
]

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        process.env.NEXT_PUBLIC_APP_URL?.replace('https://', '') ?? '',
        process.env.VERCEL_URL ?? '',
      ].filter(Boolean),
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
  // Evitar exponer info del servidor en errores
  poweredByHeader: false,
}

export default nextConfig
