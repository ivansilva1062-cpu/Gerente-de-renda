'use client'

import { CheckCircle2 } from 'lucide-react'
import { useAgent } from '@/components/agent-provider'
import { PageHeader } from '@/components/page-header'
import { PendingItem } from '@/components/pending-item'
import { Card, CardContent } from '@/components/ui/card'
import { usd } from '@/lib/format'

export default function PendingPage() {
  const { pendingTasks } = useAgent()
  const totalPending = pendingTasks.reduce((sum, t) => sum + t.estimatedValue, 0)

  return (
    <div>
      <PageHeader
        title="Pendentes"
        description="Tarefas que dependem de uma ação humana para prosseguir. Resolva quando puder — o agente nunca para o restante das atividades por causa delas."
      />

      <Card className="mb-6 border-warning/30 bg-warning/[0.06]">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-muted-foreground">Pendências abertas</p>
            <p className="font-mono text-2xl font-semibold tabular-nums">
              {pendingTasks.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Valor estimado retido</p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-success">
              {usd(totalPending)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {pendingTasks.length > 0 ? (
          pendingTasks.map((task) => <PendingItem key={task.id} task={task} />)
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-success/12 text-success">
              <CheckCircle2 className="size-6" />
            </div>
            <div>
              <p className="font-medium">Nenhuma pendência</p>
              <p className="text-sm text-muted-foreground">
                Todas as tarefas estão fluindo automaticamente.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
