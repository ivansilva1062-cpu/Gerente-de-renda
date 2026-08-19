import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AgentProvider } from '@/components/agent-provider'
import { AppShell } from '@/components/app-shell'

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
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
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
        <AgentProvider>
          <AppShell>{children}</AppShell>
        </AgentProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
