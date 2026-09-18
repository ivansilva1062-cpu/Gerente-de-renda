'use client'

import { FormEvent, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AccessPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^\d{6}$/.test(pin) || busy) {
      setError('Digite o PIN de 6 números.')
      inputRef.current?.focus()
      return
    }

    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'pin-login', pin }),
      })
      const data = await response.json() as { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível entrar.')
      router.replace('/')
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.')
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-7 shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="size-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Acessar Gerente de Renda</h1>
          <p className="text-sm leading-6 text-muted-foreground">Digite o PIN de 6 números para abrir o aplicativo.</p>
        </div>
        <form className="space-y-4" onSubmit={(event) => void login(event)}>
          <input
            ref={inputRef}
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]{6}"
            type="password"
            value={pin}
            onChange={(event) => {
              setPin(event.target.value.replace(/\D/g, '').slice(0, 6))
              setError('')
            }}
            aria-label="PIN de acesso"
            className="h-14 w-full rounded-lg border border-input bg-background px-4 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-ring"
          />
          <Button className="w-full" type="submit" disabled={busy}>
            <ShieldCheck />
            {busy ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>
    </main>
  )
}