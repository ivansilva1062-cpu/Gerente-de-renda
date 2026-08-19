'use client'

import Link from 'next/link'
import {
  DollarSign,
  Wallet,
  Target,
  Compass,
  ArrowRight,
  AlertCircle,
} from 'lucide-react'
import { useAgent } from '@/components/agent-provider'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { AgentControls, LiveStatusLine } from '@/components/agent-status'
import { RunningTaskItem } from '@/components/running-task-item'
import { PendingItem } from '@/components/pending-item'
import { ActivityFeed } from '@/components/activity-feed'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usd } from '@/lib/format'

export default function DashboardPage() {
  const { today, total, dailyGoal, opportunities, runningTasks, pendingTasks } = useAgent()
  const goalPct = Math.round((today / dailyGoal) * 100)
  const openOpportunities = opportunities.filter(
    (o) => o.status === 'new' || o.status === 'queued',
  ).length

  return (
    <div>
      <PageHeader
        title="Painel"
        description="Visão em tempo real do agente autônomo de renda. O agente continua buscando e trabalhando mesmo após atingir a meta ou quando há tarefas pendentes."
        actions={<AgentControls compact />}
      />

      <div className="mb-6">
        <LiveStatusLine />
      </div>

      {/* Estatísticas principais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saldo gerado hoje"
          value={usd(today)}
          icon={DollarSign}
          accent="success"
          hint={<span>Atualizado continuamente</span>}
        />
        <StatCard
          label="Total acumulado"
          value={usd(total)}
          icon={Wallet}
          hint={<span>Desde o início da operação</span>}
        />
        <StatCard
          label="Meta diária (indicador)"
          value={usd(dailyGoal)}
          icon={Target}
          accent="warning"
          hint={
            <div className="flex items-center gap-2">
              <Progress
                value={goalPct}
                className="h-1.5 w-20"
                indicatorClassName="bg-warning"
              />
              <span className="font-mono tabular-nums">{goalPct}%</span>
            </div>
          }
        />
        <StatCard
          label="Oportunidades encontradas"
          value={String(opportunities.length)}
          icon={Compass}
          hint={<span>{openOpportunities} disponíveis para iniciar</span>}
        />
      </div>

      {/* Aviso de regra principal */}
      <Card className="mt-4 border-primary/20 bg-primary/[0.04]">
        <CardContent className="flex items-start gap-3 p-4">
          <Target className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-sm text-pretty">
            A meta diária é apenas um <strong>indicador de referência</strong>, nunca um
            limite. Ao atingi-la, o agente <strong>continua trabalhando</strong> e
            registrando novas oportunidades.
          </p>
        </CardContent>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Coluna esquerda: tarefas */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Tarefas em execução</CardTitle>
              <Badge variant="success">{runningTasks.length} ativas</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {runningTasks.length > 0 ? (
                runningTasks.map((task) => <RunningTaskItem key={task.id} task={task} />)
              ) : (
                <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  Nenhuma tarefa em execução. O agente está procurando novas oportunidades.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 text-warning-foreground" />
                <CardTitle>Pendentes — precisam de intervenção</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={
                  <Link href="/pendentes">
                    Ver todas
                    <ArrowRight />
                  </Link>
                }
              />
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingTasks.length > 0 ? (
                pendingTasks
                  .slice(0, 2)
                  .map((task) => <PendingItem key={task.id} task={task} />)
              ) : (
                <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  Nenhuma pendência no momento.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna direita: histórico */}
        <div>
          <Card className="lg:sticky lg:top-20">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Histórico de atividades</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={
                  <Link href="/historico">
                    Tudo
                    <ArrowRight />
                  </Link>
                }
              />
            </CardHeader>
            <CardContent>
              <ActivityFeed limit={8} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
