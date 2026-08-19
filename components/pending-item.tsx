'use client'

import { ExternalLink, Check, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAgent } from '@/components/agent-provider'
import { usd, relativeTime } from '@/lib/format'
import type { Task } from '@/lib/types'

export function PendingItem({ task }: { task: Task }) {
  const { resolvePending } = useAgent()

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/[0.06] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-warning-foreground" />
            <p className="font-medium">{task.title}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {task.source} • marcada {relativeTime(task.startedAt)}
          </p>
        </div>
        <Badge variant="warning">Requer intervenção humana</Badge>
      </div>

      <div className="mt-3 grid gap-3 rounded-md bg-background/60 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Motivo</p>
          <p className="text-sm text-pretty">{task.pendingReason}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-medium text-muted-foreground">Valor estimado</p>
          <p className="font-mono text-lg font-semibold tabular-nums text-success">
            {usd(task.estimatedValue)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {task.actionUrl && (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <a href={task.actionUrl} target="_blank" rel="noopener noreferrer">
                Abrir tarefa
                <ExternalLink />
              </a>
            }
          />
        )}
        <Button size="sm" onClick={() => resolvePending(task.id)}>
          <Check />
          Marcar como resolvida
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          O agente continua trabalhando nas demais tarefas
        </span>
      </div>
    </div>
  )
}
