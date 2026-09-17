'use client'

import { useEffect, useRef, useState } from 'react'

type Session = {
  authenticated: boolean
  expiresAt?: number
  idleTimeoutSeconds?: number
}

type AuthState = {
  configured: boolean
  authenticated: boolean
  session?: Session
}

async function authRequest(body: Record<string, unknown>) {
  const response = await fetch('/api/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      data?.error ||
        'Não foi possível concluir a autenticação.',
    )
  }

  return data
}

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: () => void
}) {
  const pinInputRef = useRef<HTMLInputElement | null>(null)
  const busyRef = useRef(false)

  const [busy, setBusy] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const loginWithPin = async () => {
    if (busyRef.current) return

    busyRef.current = true
    setBusy(true)
    setError('')

    try {
      if (!/^\d{6}$/.test(pin)) {
        throw new Error('Digite o PIN de 6 números.')
      }

      await authRequest({
        action: 'pin-login',
        pin,
      })

      onAuthenticated()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível entrar.'

      setError(message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#0b0b0b',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 420,
          padding: 32,
          borderRadius: 20,
          background: '#151515',
          border: '1px solid #2a2a2a',
          color: '#fff',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 48,
            marginBottom: 16,
          }}
        >
          🔐
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          Gerente de Renda
        </h1>

        <p
          style={{
            marginTop: 12,
            marginBottom: 24,
            color: '#aaa',
            lineHeight: 1.5,
          }}
        >
          Digite seu PIN para acessar o Gerente.
        </p>

        <input
          ref={pinInputRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="off"
          placeholder="PIN de 6 números"
          value={pin}
          onChange={(event) => {
            setPin(
              event.target.value
                .replace(/\D/g, '')
                .slice(0, 6),
            )
            setError('')
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              pin.length === 6
            ) {
              void loginWithPin()
            }
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '16px',
            borderRadius: 12,
            border: '1px solid #444',
            background: '#0b0b0b',
            color: '#fff',
            fontSize: 22,
            textAlign: 'center',
            letterSpacing: 8,
            outline: 'none',
          }}
        />

        <button
          type="button"
          disabled={busy || pin.length !== 6}
          onClick={() => {
            void loginWithPin()
          }}
          style={{
            width: '100%',
            marginTop: 14,
            padding: '16px 20px',
            border: 0,
            borderRadius: 12,
            background:
              busy || pin.length !== 6
                ? '#555'
                : '#fff',
            color: '#000',
            fontSize: 17,
            fontWeight: 700,
          }}
        >
          {busy ? 'Entrando...' : 'Entrar'}
        </button>

        {error && (
          <div
            style={{
              marginTop: 20,
              padding: 14,
              borderRadius: 10,
              background: '#2a1515',
              color: '#ffb3b3',
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {error}
          </div>
        )}
      </section>
    </main>
  )
}

export function AuthGate({
  children,
}: {
  children: React.ReactNode
}) {
  const [loading, setLoading] = useState(true)
  const [auth, setAuth] =
    useState<AuthState | null>(null)

  const loadAuth = async () => {
    try {
      const response = await fetch('/api/auth', {
        credentials: 'same-origin',
        cache: 'no-store',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Falha ao verificar autenticação.',
        )
      }

      setAuth(data)
    } catch (error) {
      console.error(
        'Erro ao verificar autenticação:',
        error,
      )

      setAuth({
        configured: false,
        authenticated: false,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAuth()
  }, [])

  useEffect(() => {
    if (!auth?.authenticated) return

    const heartbeat = window.setInterval(
      async () => {
        try {
          await authRequest({
            action: 'heartbeat',
          })
        } catch {
          await loadAuth()
        }
      },
      60_000,
    )

    return () => {
      window.clearInterval(heartbeat)
    }
  }, [auth?.authenticated])

  if (loading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0b0b',
          color: '#fff',
          fontSize: 18,
        }}
      >
        Carregando Gerente de Renda...
      </main>
    )
  }

  if (!auth?.authenticated) {
    return (
      <AuthScreen
        onAuthenticated={() => {
          void loadAuth()
        }}
      />
    )
  }

  return <>{children}</>
}
