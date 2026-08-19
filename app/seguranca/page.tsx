'use client'

import {
  ShieldCheck,
  Lock,
  KeyRound,
  MonitorSmartphone,
  Server,
  Eye,
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
    description: 'Login privado por e-mail e senha para proteger o painel.',
    status: 'planned',
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
  return (
    <div>
      <PageHeader
        title="Segurança"
        description="Postura de segurança do painel. Nesta V1 não há credenciais reais, contas de plataformas ou movimentação financeira conectadas."
      />

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
