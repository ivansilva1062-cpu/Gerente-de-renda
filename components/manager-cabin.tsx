'use client'

import { useEffect, useState } from 'react'
import { Activity, ShieldCheck, UserRound } from 'lucide-react'
import type { ManagerModuleName, ModuleResult } from '@/lib/manager-modules'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type ManagerResponse = {
  manager: {
    candidate: { title: string }
    modules: ModuleResult[]
    assessment: {
      score: number
      priority: string
      summary: string
    }
    decision: {
      decision: string
      nextAction: string
      requiresHumanAction: boolean
    }
    execution: {
      state: 'queued' | 'running' | 'waiting_human' | 'completed' | 'blocked' | 'failed'
      error?: string
      intervention?: { reason: string; action: string }
    } | null
    nextAction: string | null
    rules: {
      estimatedValuesAreNotEarnings: boolean
      onlyConfirmedEarningsAffectBalance: boolean
      sensitiveActionsRequireHuman: boolean
      pendingTasksBlockAgent: boolean
    }
  }
}

const moduleLabels: Record<ManagerModuleName, string> = {
  radar: 'Radar',
  avaliador: 'Avaliador',
  risco: 'Risco',
  financeiro: 'Financeiro',
  publicador: 'Publicador',
  vendedor: 'Vendedor',
  entrega: 'Entrega',
}

const decisionLabels: Record<string, string> = {
  block: 'Bloqueado',
  human_review: 'Revisão humana',
  prepare: 'Preparar',
  monitor: 'Monitorar',
}

export function ManagerCabin() {
  const [data, setData] = useState<ManagerResponse['manager'] | null>(null)

  useEffect(() => {
    let active = true

    fetch('/api/manager', { cache: 'no-store' })
      .then((response) => response.json())
      .then((response: ManagerResponse) => {
        if (active && response.manager) setData(response.manager)
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  if (!data) {
    return (
      <Card className="mt-6">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Activity className="size-4 animate-pulse" />
          Consultando a orquestração do Gerente...
        </CardContent>
      </Card>
    )
  }

  const evaluation = data.modules.find(
    (module) => module.module === 'avaliador',
  )?.evaluation

  return (
    <Card className="mt-6 overflow-hidden border-primary/20">
      <CardHeader className="border-b border-border/70 bg-primary/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Cabine do Gerente</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.candidate.title}
            </p>
          </div>
          <Badge variant={data.decision.decision === 'block' ? 'destructive' : 'success'}>
            {decisionLabels[data.decision.decision] ?? data.decision.decision}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex size-20 flex-col items-center justify-center rounded-full border-4 border-primary/20 bg-primary/5">
            <strong className="text-2xl tabular-nums">{data.assessment.score}</strong>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">score</span>
          </div>
          <div>
            <p className="font-medium">{data.assessment.summary}</p>
            <p className="mt-1 text-sm text-muted-foreground">Próximo passo: {data.decision.nextAction}</p>
          </div>
        </div>

        {data.execution ? (
          <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Estado da execução</p>
              <Badge variant={data.execution.state === 'blocked' || data.execution.state === 'failed' ? 'destructive' : data.execution.state === 'waiting_human' ? 'warning' : 'success'}>
                {data.execution.state}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Próximo passo: {data.nextAction ?? 'Aguardando atualização do Worker.'}
            </p>
            {data.execution.intervention?.reason ? (
              <p className="mt-2 text-xs text-warning-foreground">Motivo: {data.execution.intervention.reason}</p>
            ) : null}
            {data.execution.error ? (
              <p className="mt-2 text-xs text-destructive">Motivo: {data.execution.error}</p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-4">
          {data.modules.map((module) => (
            <div key={module.module} className="rounded-lg border border-border/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{moduleLabels[module.module]}</span>
                <span className={module.approved ? 'text-success' : 'text-warning-foreground'}>
                  {module.approved ? 'OK' : 'Revisar'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{module.reason}</p>
            </div>
          ))}
        </div>

        {evaluation ? (
          <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Leitura profunda do Avaliador</p>
              <span className="font-mono text-sm tabular-nums">{evaluation.score}/100</span>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3 lg:grid-cols-6">
              <span>Remuneração: <strong className="text-foreground">{evaluation.remuneration}</strong></span>
              <span>Ação: <strong className="text-foreground">{evaluation.action}</strong></span>
              <span>Acesso: <strong className="text-foreground">{evaluation.accessibility}</strong></span>
              <span>Esforço: <strong className="text-foreground">{evaluation.effort}</strong></span>
              <span>Retorno: <strong className="text-foreground">{evaluation.returnLevel}</strong></span>
              <span>Fonte: <strong className="text-foreground">{evaluation.sourceQuality}</strong></span>
            </div>
            {evaluation.riskSignals.length > 0 ? (
              <p className="mt-3 text-xs text-warning-foreground">
                Sinais para revisão: {evaluation.riskSignals.join(', ')}.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-success" /> Estimativa não é ganho</span>
          <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-success" /> Só `/api/earnings` confirma</span>
          <span className="flex items-center gap-2"><UserRound className="size-4 text-warning-foreground" /> Ação sensível exige humano</span>
        </div>
      </CardContent>
    </Card>
  )
}