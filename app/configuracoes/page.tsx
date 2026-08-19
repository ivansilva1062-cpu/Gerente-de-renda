'use client'

import { useState } from 'react'
import {
  Bot,
  Globe,
  MonitorPlay,
  Database,
  MessageCircle,
  KeyRound,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { useAgent } from '@/components/agent-provider'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { usd } from '@/lib/format'

const integrationIcons: Record<string, LucideIcon> = {
  'ai-agent': Bot,
  'web-search': Globe,
  browser: MonitorPlay,
  database: Database,
  whatsapp: MessageCircle,
  auth: KeyRound,
}

export default function SettingsPage() {
  const { integrations, toggleIntegration, dailyGoal } = useAgent()
  const [goal, setGoal] = useState(dailyGoal)
  const [notifyPending, setNotifyPending] = useState(true)
  const [notifyEarnings, setNotifyEarnings] = useState(false)
  const [keepWorking, setKeepWorking] = useState(true)

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Preferências do painel e integrações preparadas para conexão futura. Ativar aqui apenas simula o estado da conexão."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Integrações</CardTitle>
          <CardDescription>
            Estrutura pronta para conectar os serviços que darão vida ao agente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {integrations.map((integration) => {
            const Icon = integrationIcons[integration.key] ?? Bot
            return (
              <div
                key={integration.key}
                className="flex items-center gap-4 rounded-lg border border-border p-4"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{integration.name}</p>
                    <Badge variant={integration.connected ? 'success' : 'neutral'}>
                      {integration.connected ? 'Conectado' : 'Desconectado'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground text-pretty">
                    {integration.description}
                  </p>
                </div>
                <Switch
                  checked={integration.connected}
                  onCheckedChange={() => toggleIntegration(integration.key)}
                  aria-label={`Alternar ${integration.name}`}
                />
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Meta diária (indicador)</CardTitle>
            <CardDescription>
              Usada apenas como referência visual — nunca limita o trabalho do agente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Target className="size-5 text-warning-foreground" />
              <span className="font-mono text-2xl font-semibold tabular-nums">
                {usd(goal)}
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={500}
              step={10}
              value={goal}
              onChange={(e) => setGoal(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
              aria-label="Ajustar meta diária"
            />
            <div className="flex justify-between font-mono text-xs text-muted-foreground">
              <span>{usd(20)}</span>
              <span>{usd(500)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/60 p-3">
              <div>
                <p className="text-sm font-medium">Continuar após atingir a meta</p>
                <p className="text-xs text-muted-foreground">
                  Mantém o agente buscando trabalho o tempo todo
                </p>
              </div>
              <Switch checked={keepWorking} onCheckedChange={setKeepWorking} aria-label="Continuar após meta" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notificações</CardTitle>
            <CardDescription>Alertas via WhatsApp (a conectar)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Tarefas pendentes</p>
                <p className="text-xs text-muted-foreground">
                  Avisar quando algo precisar de intervenção humana
                </p>
              </div>
              <Switch checked={notifyPending} onCheckedChange={setNotifyPending} aria-label="Notificar pendências" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Ganhos relevantes</p>
                <p className="text-xs text-muted-foreground">
                  Resumo quando um valor significativo for gerado
                </p>
              </div>
              <Switch checked={notifyEarnings} onCheckedChange={setNotifyEarnings} aria-label="Notificar ganhos" />
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Conecte o WhatsApp em Integrações para ativar o envio real.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-end">
        <Button disabled>Salvar preferências (em breve)</Button>
      </div>
    </div>
  )
}
