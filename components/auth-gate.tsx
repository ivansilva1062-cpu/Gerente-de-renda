'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { LockKeyhole } from 'lucide-react'
import { AgentProvider } from '@/components/agent-provider'
import { AppShell } from '@/components/app-shell'
import { PwaRegister } from '@/components/pwa-register'

type AuthStatus = {
  configured: boolean
  authenticated: boolean
  session?: {
    active: boolean
    idleTimeoutSeconds: number
  }
}

async function authRequest(action: string, response?: unknown) {
  const result = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ action, response }),
  })
  const data = await result.json() as Record<string, unknown>
  if (!result.ok) throw new Error(String(data.error ?? 'Falha de autenticação.'))
  return data
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [error, setError] = useState('')
  const pathname = usePathname()

  async function refresh() {
    const response = await fetch('/api/auth', { credentials: 'same-origin', cache: 'no-store' })
    setStatus(await response.json() as AuthStatus)
  }

  useEffect(() => {
    if (pathname === '/acesso') return
    void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível consultar a autenticação.'))
  }, [pathname])

  useEffect(() => {
    if (!status?.authenticated) return

    let lastActivity = Date.now()
    let lastHeartbeat = Date.now()
    let locking = false
    let timer: ReturnType<typeof setInterval> | undefined
    const markActivity = () => {
      lastActivity = Date.now()
    }
    const lock = async () => {
      if (locking) return
      locking = true
      await authRequest('block').catch(() => undefined)
      setStatus((current) => current ? { ...current, authenticated: false, session: current.session ? { ...current.session, active: false } : current.session } : current)
    }

    const timeout = (status.session?.idleTimeoutSeconds ?? 900) * 1000
    window.addEventListener('pointerdown', markActivity, { passive: true })
    window.addEventListener('keydown', markActivity, { passive: true })
    window.addEventListener('touchstart', markActivity, { passive: true })
    timer = setInterval(() => {
      const now = Date.now()
      if (now - lastActivity >= timeout) {
        void lock()
      } else if (now - lastHeartbeat >= 60_000) {
        lastHeartbeat = now
        void authRequest('heartbeat').catch(() => lock())
      }
    }, 15_000)

    return () => {
      window.removeEventListener('pointerdown', markActivity)
      window.removeEventListener('keydown', markActivity)
      window.removeEventListener('touchstart', markActivity)
      if (timer) clearInterval(timer)
    }
  }, [status?.authenticated, status?.session?.idleTimeoutSeconds])

  if (pathname === '/acesso') return <>{children}</>

  if (!status) {
    return <AuthScreen title="Verificando proteção" description="Consultando a sessão segura do Gerente..." error={error} />
  }

  if (!status.authenticated) {
    return (
      <AuthScreen
        title="Acesso necessário"
        description="A sessão do Gerente não está ativa. Abra a página de acesso para entrar com o PIN."
      />
    )
  }

  return <><PwaRegister /><AgentProvider><AppShell>{children}</AppShell></AgentProvider></>
}

function AuthScreen({
  title,
  description,
  error,
}: {
  title: string
  description: string
  error?: string
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-7 shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LockKeyhole className="size-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>
    </main>
  )
}