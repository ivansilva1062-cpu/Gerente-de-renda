'use client'

import { ExternalLink, Sparkles, CheckCircle2 } from 'lucide-react'

import { useAgent } from '@/components/agent-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usd } from '@/lib/format'
import { assessOpportunity } from '@/lib/manager-modules'
import type { ModuleResult } from '@/lib/manager-modules'
import type { Opportunity, Task } from '@/lib/types'

function evaluatorOf(modules?: ModuleResult[]) {
  return modules?.find((module) => module.module === 'avaliador')?.evaluation
}

/*
 * A "menor intervenção" prioriza remuneração verificável primeiro,
 * depois o menor esforço restante até o usuário poder agir.
 */
function rankPendingTask(task: Task) {
  const evaluation = evaluatorOf(task.managerModules)
  const verified = evaluation?.remuneration === 'verifiable' ? 1 : 0
  const lowEffort = evaluation?.effort === 'low' ? 1 : 0
  return verified * 100 + lowEffort * 10 + Number(task.estimatedValue ?? 0)
}

function rankOpportunity(opportunity: Opportunity) {
  const assessment = assessOpportunity({
    title: opportunity.title,
    url: opportunity.url ?? '',
    description: `${opportunity.source} ${opportunity.category}`,
    estimatedValue: opportunity.estimatedValue,
    category: opportunity.category,
    confidence: opportunity.confidence,
  })
  const evaluation = assessment.modules.find((module) => module.module === 'avaliador')?.evaluation
  const verified = evaluation?.remuneration === 'verifiable' ? 1 : 0
  return verified * 100 + assessment.comparison.rankingScore
}

export function NextActionCard() {
  const { pendingTasks, opportunities } = useAgent()

  const bestPending = [...pendingTasks]
    .filter((task) => task.actionUrl)
    .sort((a, b) => rankPendingTask(b) - rankPendingTask(a))
    .at(0)

  const bestOpportunity = bestPending
    ? null
    : [...opportunities]
        .filter((opportunity) => (opportunity.status === 'new' || opportunity.status === 'queued') && opportunity.url)
        .sort((a, b) => rankOpportunity(b) - rankOpportunity(a))
        .at(0)

  if (!bestPending && !bestOpportunity) {
    return (
      <Card className="mt-6 border-success/30 bg-success/[0.05]">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" />
          Nenhuma ação sua é necessária agora. O agente continua procurando e preparando novas oportunidades.
        </CardContent>
      </Card>
    )
  }

  const title = bestPending?.title ?? bestOpportunity?.title ?? ''
  const source = bestPending?.source ?? bestOpportunity?.source ?? ''
  const value = bestPending?.estimatedValue ?? bestOpportunity?.estimatedValue ?? 0
  const url = bestPending?.actionUrl ?? bestOpportunity?.url ?? undefined
  const reason = bestPending
    ? bestPending.pendingReason ?? 'Esta oportunidade precisa de uma ação sua para continuar.'
    : 'O agente vai preparar esta oportunidade automaticamente a seguir.'
  const evaluation = bestPending
    ? evaluatorOf(bestPending.managerModules)
    : bestOpportunity
      ? assessOpportunity({
          title: bestOpportunity.title,
          url: bestOpportunity.url ?? '',
          description: `${bestOpportunity.source} ${bestOpportunity.category}`,
          estimatedValue: bestOpportunity.estimatedValue,
          category: bestOpportunity.category,
          confidence: bestOpportunity.confidence,
        }).modules.find((module) => module.module === 'avaliador')?.evaluation
      : undefined

  return (
    <Card className="mt-6 overflow-hidden border-primary/30 bg-primary/[0.05]">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b border-primary/15">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <CardTitle>Próxima ação para ganhar</CardTitle>
        </div>
        {evaluation?.remuneration === 'verifiable' ? (
          <Badge variant="success">Remuneração verificável</Badge>
        ) : (
          <Badge variant="warning">Remuneração indicativa</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{source}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-semibold tabular-nums text-success">{usd(value)}</p>
            <p className="text-[11px] text-muted-foreground">estimado, não confirmado</p>
          </div>
        </div>

        <div className="rounded-md bg-background/60 p-3">
          <p className="text-xs font-medium text-muted-foreground">Faça isso agora</p>
          <p className="mt-1 text-sm text-pretty">{reason}</p>
        </div>

        {url ? (
          <Button
            size="sm"
            nativeButton={false}
            render={
              <a href={url} target="_blank" rel="noopener noreferrer">
                Abrir oportunidade
                <ExternalLink />
              </a>
            }
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
