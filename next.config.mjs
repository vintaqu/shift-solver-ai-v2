/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(process.env.NODE_ENV === 'production' ? [{
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  }] : []),
]

const nextConfig = {
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
  poweredByHeader: false,
}

export default nextConfig
