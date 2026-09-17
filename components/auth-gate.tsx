'use client'

import { useEffect, useRef, useState } from 'react'
import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'

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
      data?.error || 'Não foi possível concluir a autenticação.'
    )
  }

  return data
}

function AuthScreen({
  configured,
  onAuthenticated,
}: {
  configured: boolean
  onAuthenticated: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const busyRef = useRef(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const button = buttonRef.current

    if (!button) return

    const handleClick = async () => {
      if (busyRef.current) return

      busyRef.current = true
      setBusy(true)
      setError('')

      try {
        if (configured) {
          const optionsResponse = await authRequest({
            action: 'authentication-options',
          })

          const authenticationResponse = await startAuthentication({
            optionsJSON: {
              ...optionsResponse,
              rpId: window.location.hostname,
            },
          })

          await authRequest({
            action: 'authentication-verify',
            response: authenticationResponse,
          })
        } else {
          const optionsResponse = await authRequest({
            action: 'registration-options',
          })

          const registrationResponse = await startRegistration({
            optionsJSON: {
              ...optionsResponse,
              rp: {
                ...optionsResponse.rp,
                id: window.location.hostname,
              },
            },
          })

          await authRequest({
            action: 'registration-verify',
            response: registrationResponse,
          })
        }

        onAuthenticated()
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Não foi possível concluir a autenticação.'

        console.error('Erro de autenticação:', err)

        if (
          message.includes('NotAllowedError') ||
          message.includes('not allowed') ||
          message.toLowerCase().includes('cancel')
        ) {
          setError(
            'A autenticação foi cancelada ou não foi permitida pelo navegador. Tente novamente.'
          )
        } else {
          setError(message)
        }
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    }

    button.addEventListener('click', handleClick)

    return () => {
      button.removeEventListener('click', handleClick)
    }
  }, [configured, onAuthenticated])

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
            marginBottom: 28,
            color: '#aaa',
            lineHeight: 1.5,
          }}
        >
          {configured
            ? 'Use o Face ID para acessar o seu Gerente de Renda.'
            : 'Cadastre o Face ID deste dispositivo para proteger o Gerente de Renda.'}
        </p>

        <button
          ref={buttonRef}
          type="button"
          disabled={busy}
          style={{
            width: '100%',
            padding: '16px 20px',
            border: 0,
            borderRadius: 12,
            background: busy ? '#555' : '#fff',
            color: '#000',
            fontSize: 17,
            fontWeight: 700,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy
            ? 'Aguarde...'
            : configured
              ? 'Entrar com Face ID'
              : 'Cadastrar Face ID'}
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
  const [auth, setAuth] = useState<AuthState | null>(null)

  const loadAuth = async () => {
    try {
      const response = await fetch('/api/auth', {
        credentials: 'same-origin',
        cache: 'no-store',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data?.error || 'Falha ao verificar autenticação.'
        )
      }

      setAuth(data)
    } catch (error) {
      console.error('Erro ao verificar autenticação:', error)

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

    const heartbeat = window.setInterval(async () => {
      try {
        await authRequest({
          action: 'heartbeat',
        })
      } catch {
        await loadAuth()
      }
    }, 60_000)

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
        configured={Boolean(auth?.configured)}
        onAuthenticated={() => {
          void loadAuth()
        }}
      />
    )
  }

  return <>{children}</>
}
