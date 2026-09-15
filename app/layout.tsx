import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AgentProvider } from '@/components/agent-provider'
import { AppShell } from '@/components/app-shell'
import { PwaRegister } from '@/components/pwa-register'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'Gerente de Renda',
  description:
    'Painel pessoal para gerenciar oportunidades legítimas de renda em dólar operadas por um agente autônomo.',
  generator: 'v0.app',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Gerente de Renda',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f2a24' },
    { media: '(prefers-color-scheme: dark)', color: '#0f2a24' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} bg-background`}>
      <body className="font-sans antialiased">
        <PwaRegister />
        <AgentProvider>
          <AppShell>{children}</AppShell>
        </AgentProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
