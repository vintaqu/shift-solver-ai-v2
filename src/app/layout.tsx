import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Toaster } from 'sonner'
import { SessionProvider } from 'next-auth/react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Shift Solver AI',
  description: 'Planificación de turnos inteligente para restauración y hostelería',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased bg-gray-50`}>
        <SessionProvider>
          {children}
        </SessionProvider>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              fontFamily: 'var(--font-geist-sans)',
              fontSize: '13px',
              fontWeight: '500',
            },
          }}
        />
      </body>
    </html>
  )
}
