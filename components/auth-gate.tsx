'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

type AuthStatus = {
  configured: boolean
  authenticated: boolean
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pathname = usePathname()
  const router = useRouter()

  async function refresh() {
    const response = await fetch('/api/auth', { credentials: 'same-origin', cache: 'no-store' })
    setStatus(await response.json() as AuthStatus)
  }

  useEffect(() => {
    void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Não foi possível consultar a autenticação.'))
  }, [])

  async function register() {
    setBusy(true)
    setError('')
    try {
      const options = await authRequest('registration-options')
      const credential = await startRegistration({ optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON'] })
      await authRequest('registration-verify', credential)
      await refresh()
      router.replace('/')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível cadastrar a passkey.')
    } finally {
      setBusy(false)
    }
  }

  async function authenticate() {
    setBusy(true)
    setError('')
    try {
      const options = await authRequest('authentication-options')
      const credential = await startAuthentication({ optionsJSON: options as Parameters<typeof startAuthentication>[0]['optionsJSON'] })
      await authRequest('authentication-verify', credential)
      await refresh()
      router.replace('/')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível autenticar a passkey.')
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return <AuthScreen title="Verificando proteção" description="Consultando a sessão segura do Gerente..." />
  }

  if (!status.authenticated) {
    return (
      <AuthScreen
        title={status.configured ? 'Desbloquear Gerente' : 'Configurar acesso seguro'}
        description={status.configured
          ? 'Use a passkey deste dispositivo. O iPhone poderá solicitar Face ID ou Touch ID.'
          : 'Cadastre a passkey deste dispositivo para proteger o painel. Nenhuma imagem ou dado biométrico será enviado.'}
        action={status.configured ? authenticate : register}
        actionLabel={status.configured ? 'Usar Face ID / passkey' : 'Cadastrar passkey neste dispositivo'}
        busy={busy}
        error={error}
      />
    )
  }

  if (pathname === '/acesso') {
    router.replace('/')
    return null
  }

  return <>{children}</>
}

function AuthScreen({
  title,
  description,
  action,
  actionLabel,
  busy = false,
  error,
}: {
  title: string
  description: string
  action?: () => void
  actionLabel?: string
  busy?: boolean
  error?: string
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-7 shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {action ? <Fingerprint className="size-7" /> : <LockKeyhole className="size-7" />}
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action && (
          <Button className="w-full" disabled={busy} onClick={action}>
            <ShieldCheck />
            {busy ? 'Aguardando dispositivo...' : actionLabel}
          </Button>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p className="text-xs leading-5 text-muted-foreground">
          A autenticação é feita pelo sistema operacional. O servidor armazena apenas a credencial pública necessária ao WebAuthn.
        </p>
      </section>
    </main>
  )
}