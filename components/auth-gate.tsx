'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

type AuthStatus = {
  configured: boolean
  authenticated: boolean
  session?: {
    active: boolean
    idleTimeoutSeconds: number
  }
}

type AuthOptions = Record<string, unknown>

async function authRequest(action: string, response?: unknown) {
  const result = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ action, response }),
  })

  const data = await result.json() as Record<string, unknown>

  if (!result.ok) {
    throw new Error(String(data.error ?? 'Falha de autenticação.'))
  }

  return data
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [authenticationOptions, setAuthenticationOptions] = useState<AuthOptions | null>(null)
  const [registrationOptions, setRegistrationOptions] = useState<AuthOptions | null>(null)

  const pathname = usePathname()
  const router = useRouter()

  async function refresh() {
    const response = await fetch('/api/auth', {
      credentials: 'same-origin',
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error('Não foi possível consultar a autenticação.')
    }

    setStatus(await response.json() as AuthStatus)
  }

  useEffect(() => {
    void refresh().catch((reason: unknown) => {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Não foi possível consultar a autenticação.'
      )
    })
  }, [])

  /*
   * IMPORTANTE PARA SAFARI/iOS:
   *
   * As opções do WebAuthn são carregadas ANTES do usuário tocar
   * no botão. Assim, o startAuthentication()/startRegistration()
   * pode ser executado diretamente no gesto do usuário.
   */
  useEffect(() => {
    if (!status || status.authenticated) return

    let cancelled = false

    async function prepareWebAuthn() {
      try {
        setError('')

        if (status.configured) {
          const options = await authRequest('authentication-options')

          if (!cancelled) {
            setAuthenticationOptions(options as AuthOptions)
          }
        } else {
          const options = await authRequest('registration-options')

          if (!cancelled) {
            setRegistrationOptions(options as AuthOptions)
          }
        }
      } catch (reason) {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Não foi possível preparar a autenticação segura.'
          )
        }
      }
    }

    void prepareWebAuthn()

    return () => {
      cancelled = true
    }
  }, [status?.configured, status?.authenticated])

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

      setStatus((current) =>
        current
          ? {
              ...current,
              authenticated: false,
              session: current.session
                ? { ...current.session, active: false }
                : current.session,
            }
          : current
      )
    }

    const timeout =
      (status.session?.idleTimeoutSeconds ?? 900) * 1000

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

      if (timer) {
        clearInterval(timer)
      }
    }
  }, [
    status?.authenticated,
    status?.session?.idleTimeoutSeconds,
  ])

  async function authenticateWithPreparedOptions() {
    if (!authenticationOptions) {
      setError('A autenticação segura ainda está sendo preparada. Tente novamente em alguns segundos.')
      return
    }

    setBusy(true)
    setError('')

    try {
      /*
       * Esta chamada acontece imediatamente após o toque do usuário.
       * Não fazemos fetch antes dela.
       */
      const credential = await startAuthentication({
        optionsJSON:
          authenticationOptions as Parameters<
            typeof startAuthentication
          >[0]['optionsJSON'],
      })

      await authRequest('authentication-verify', credential)

      await refresh()

      router.replace('/')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Não foi possível autenticar a passkey.'
      )

      /*
       * Se a tentativa consumiu o desafio, preparamos um novo.
       */
      try {
        const options = await authRequest('authentication-options')
        setAuthenticationOptions(options as AuthOptions)
      } catch {
        // O erro principal já foi mostrado ao usuário.
      }
    } finally {
      setBusy(false)
    }
  }

  async function registerWithPreparedOptions() {
    if (!registrationOptions) {
      setError('O cadastro seguro ainda está sendo preparado. Tente novamente em alguns segundos.')
      return
    }

    setBusy(true)
    setError('')

    try {
      /*
       * Também acontece diretamente após o toque do usuário.
       */
      const credential = await startRegistration({
        optionsJSON:
          registrationOptions as Parameters<
            typeof startRegistration
          >[0]['optionsJSON'],
      })

      await authRequest('registration-verify', credential)

      await refresh()

      router.replace('/')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Não foi possível cadastrar a passkey.'
      )

      /*
       * Prepara novamente as opções caso o desafio tenha expirado
       * ou sido consumido.
       */
      try {
        const options = await authRequest('registration-options')
        setRegistrationOptions(options as AuthOptions)
      } catch {
        // O erro principal já foi mostrado ao usuário.
      }
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return (
      <AuthScreen
        title="Verificando proteção"
        description="Consultando a sessão segura do Gerente..."
      />
    )
  }

  if (!status.authenticated) {
    const configured = status.configured

    const action = configured
      ? authenticateWithPreparedOptions
      : registerWithPreparedOptions

    const optionsReady = configured
      ? Boolean(authenticationOptions)
      : Boolean(registrationOptions)

    return (
      <AuthScreen
        title={
          configured
            ? 'Desbloquear Gerente'
            : 'Configurar acesso seguro'
        }
        description={
          configured
            ? 'Use a passkey deste dispositivo. O iPhone poderá solicitar Face ID ou Touch ID.'
            : 'Cadastre a passkey deste dispositivo para proteger o painel. Nenhuma imagem ou dado biométrico será enviado.'
        }
        action={action}
        actionLabel={
          configured
            ? 'Usar Face ID / passkey'
            : 'Cadastrar passkey neste dispositivo'
        }
        busy={busy}
        actionReady={optionsReady}
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
  actionReady = true,
  error,
}: {
  title: string
  description: string
  action?: () => void
  actionLabel?: string
  busy?: boolean
  actionReady?: boolean
  error?: string
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)

  /*
   * Safari/iOS: registra um listener nativo de click.
   *
   * Isso mantém a chamada do WebAuthn ligada diretamente ao
   * gesto físico do usuário.
   */
  useEffect(() => {
    const button = buttonRef.current

    if (!button || !action) return

    const handleClick = () => {
      if (busy || !actionReady) return
      action()
    }

    button.addEventListener('click', handleClick)

    return () => {
      button.removeEventListener('click', handleClick)
    }
  }, [action, busy, actionReady])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-7 shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {action ? (
            <Fingerprint className="size-7" />
          ) : (
            <LockKeyhole className="size-7" />
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {title}
          </h1>

          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>

        {action && (
          <Button
            ref={buttonRef}
            type="button"
            className="w-full"
            disabled={busy || !actionReady}
            onClick={() => {
              /*
               * O listener nativo acima é o responsável pela ação.
               * Este handler fica vazio propositalmente para evitar
               * duas chamadas no Safari.
               */
            }}
          >
            <ShieldCheck />

            {busy
              ? 'Aguardando dispositivo...'
              : !actionReady
                ? 'Preparando acesso seguro...'
                : actionLabel}
          </Button>
        )}

        {error && (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <p className="text-xs leading-5 text-muted-foreground">
          A autenticação é feita pelo sistema operacional. O servidor
          armazena apenas a credencial pública necessária ao WebAuthn.
        </p>
      </section>
    </main>
  )
}
