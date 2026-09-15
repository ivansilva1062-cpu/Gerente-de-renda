'use client'

import { useEffect, useState } from 'react'

import {
  ShieldCheck,
  Lock,
  KeyRound,
  MonitorSmartphone,
  Server,
  Eye,
  Clock3,
  type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface SecurityItem {
  icon: LucideIcon
  title: string
  description: string
  status: 'ready' | 'pending' | 'planned'
}

const items: SecurityItem[] = [
  {
    icon: KeyRound,
    title: 'Autenticação de acesso',
    description: 'Passkey protegida pelo autenticador do dispositivo, com Face ID ou Touch ID quando disponível.',
    status: 'ready',
  },
  {
    icon: Lock,
    title: 'Verificação em duas etapas (2FA)',
    description: 'Camada extra para autorizar ações sensíveis como saques.',
    status: 'planned',
  },
  {
    icon: Server,
    title: 'Navegador automatizado isolado',
    description: 'Execução de tarefas em ambiente sandbox, separado dos seus dados.',
    status: 'planned',
  },
  {
    icon: Eye,
    title: 'Registro de auditoria',
    description: 'Trilha completa de todas as ações executadas pelo agente.',
    status: 'ready',
  },
  {
    icon: MonitorSmartphone,
    title: 'Sessões e dispositivos',
    description: 'Controle de onde o painel está aberto e encerramento remoto.',
    status: 'planned',
  },
]

const statusMeta = {
  ready: { label: 'Ativo', variant: 'success' as const },
  pending: { label: 'Requer ação', variant: 'warning' as const },
  planned: { label: 'A conectar', variant: 'neutral' as const },
}

export default function SecurityPage() {
  const [session, setSession] = useState<{
    active: boolean
    idleTimeoutSeconds: number
    lastSeenAt?: string | null
    expiresAt?: string | null
  } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data: { session?: typeof session }) => setSession(data.session ?? null))
      .catch(() => setSession(null))
  }, [])

  async function updateTimeout(value: number) {
    setSaving(true)
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'settings', idleTimeoutSeconds: value }),
      })
      const data = await response.json() as { idleTimeoutSeconds?: number }
      if (response.ok && data.idleTimeoutSeconds) {
        setSession((current) => current ? { ...current, idleTimeoutSeconds: data.idleTimeoutSeconds ?? current.idleTimeoutSeconds } : current)
      }
    } finally {
      setSaving(false)
    }
  }

  async function blockNow() {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'block' }),
    })
    window.location.assign('/acesso')
  }

  const minutes = Math.max(1, Math.round((session?.idleTimeoutSeconds ?? 900) / 60))

  return (
    <div>
      <PageHeader
        title="Segurança do Gerente"
        description="Controle da passkey, sessão ativa e bloqueio automático do painel."
      />

      <Card className="mb-6 border-primary/20 bg-primary/[0.04]">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Clock3 className="size-5" /> Sessão do Gerente</CardTitle>
              <CardDescription>O painel exige uma sessão WebAuthn ativa e é bloqueado após inatividade.</CardDescription>
            </div>
            <Badge variant={session?.active ? 'success' : 'warning'}>{session?.active ? 'Ativa' : 'Inativa'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-muted-foreground">Dispositivo autenticado</p><p className="font-medium">Passkey deste dispositivo</p></div>
            <div><p className="text-muted-foreground">Passkey cadastrada</p><p className="font-medium">Sim, protegida pelo sistema</p></div>
            <div><p className="text-muted-foreground">Última atividade</p><p className="font-medium">{session?.lastSeenAt ? new Date(session.lastSeenAt).toLocaleString('pt-BR') : 'Agora'}</p></div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border/70 pt-4">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Bloqueio automático por inatividade</span>
              <select
                className="h-9 rounded-lg border border-input bg-background px-3"
                value={minutes}
                disabled={saving}
                onChange={(event) => void updateTimeout(Number(event.target.value) * 60)}
              >
                <option value="1">1 minuto</option>
                <option value="5">5 minutos</option>
                <option value="15">15 minutos</option>
                <option value="30">30 minutos</option>
                <option value="60">1 hora</option>
              </select>
            </label>
            <Button variant="destructive" onClick={() => void blockNow()}>
              <Lock />
              Bloquear Gerente agora
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6 border-primary/20 bg-primary/[0.04]">
        <CardContent className="flex items-start gap-4 p-5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">Modo demonstração seguro</p>
            <p className="text-sm text-muted-foreground text-pretty">
              O aplicativo opera apenas com dados simulados. Nenhum Pix, credencial ou conta
              de plataforma está ativo. A arquitetura já está preparada para conectar
              autenticação, 2FA e execução isolada.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon
          const meta = statusMeta[item.status]
          return (
            <Card key={item.title}>
              <CardContent className="flex items-start gap-4 p-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{item.title}</p>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground text-pretty">
                    {item.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Privacidade dos dados</CardTitle>
          <CardDescription>
            Como os dados serão tratados quando as integrações forem conectadas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>• Dados sensíveis serão armazenados em banco de dados protegido, nunca no navegador.</p>
          <p>• Ações financeiras exigirão confirmação humana explícita antes de qualquer execução.</p>
          <p>• O agente operará em ambiente isolado, sem acesso direto às suas contas pessoais.</p>
          <div className="pt-2">
            <Button variant="outline" size="sm" disabled>
              Revisar política completa (em breve)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
