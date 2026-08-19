'use client'

import { Pause, Play, Loader2, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAgent } from '@/components/agent-provider'
import type { AgentStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const statusMeta: Record<
  AgentStatus,
  { label: string; variant: 'success' | 'warning' | 'neutral'; dot: string }
> = {
  working: { label: 'Trabalhando', variant: 'success', dot: 'bg-success' },
  waiting: { label: 'Aguardando', variant: 'warning', dot: 'bg-warning' },
  paused: { label: 'Pausado', variant: 'neutral', dot: 'bg-muted-foreground' },
}

export function AgentStatusBadge({ className }: { className?: string }) {
  const { status } = useAgent()
  const meta = statusMeta[status]
  return (
    <Badge variant={meta.variant} className={cn('gap-1.5 py-1', className)}>
      <span className="relative flex size-2">
        {status === 'working' && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
        )}
        <span className={cn('relative inline-flex size-2 rounded-full', meta.dot)} />
      </span>
      {meta.label}
    </Badge>
  )
}

export function AgentControls({ compact = false }: { compact?: boolean }) {
  const { status, stop, resume } = useAgent()
  const isPaused = status === 'paused'

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isPaused ? 'default' : 'outline'}
        size={compact ? 'sm' : 'lg'}
        onClick={resume}
        disabled={!isPaused}
      >
        <Play />
        Continuar trabalhando
      </Button>
      <Button
        variant="destructive"
        size={compact ? 'sm' : 'lg'}
        onClick={stop}
        disabled={isPaused}
      >
        <Pause />
        Parar atividades
      </Button>
    </div>
  )
}

export function LiveStatusLine() {
  const { status, runningTasks } = useAgent()
  if (status === 'paused') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Pause className="size-3.5" />
        Atividades pausadas — nenhuma nova tarefa será iniciada
      </span>
    )
  }
  if (status === 'waiting') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="size-3.5" />
        Procurando novas oportunidades…
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin text-success" />
      Executando {runningTasks.length}{' '}
      {runningTasks.length === 1 ? 'tarefa' : 'tarefas'} em paralelo
    </span>
  )
}
