'use client'

import {
  Search,
  Play,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { useAgent } from '@/components/agent-provider'
import { usd, timeOfDay } from '@/lib/format'
import type { ActivityEvent, ActivityKind } from '@/lib/types'
import { cn } from '@/lib/utils'

const kindMeta: Record<ActivityKind, { icon: LucideIcon; className: string }> = {
  discovery: { icon: Search, className: 'bg-primary/10 text-primary' },
  start: { icon: Play, className: 'bg-primary/10 text-primary' },
  progress: { icon: TrendingUp, className: 'bg-muted text-muted-foreground' },
  earning: { icon: TrendingUp, className: 'bg-success/12 text-success' },
  pending: { icon: AlertCircle, className: 'bg-warning/15 text-warning-foreground' },
  resolved: { icon: CheckCircle2, className: 'bg-success/12 text-success' },
  system: { icon: Settings2, className: 'bg-muted text-muted-foreground' },
}

export function ActivityFeed({
  limit,
  items: itemsProp,
}: {
  limit?: number
  items?: ActivityEvent[]
}) {
  const { activity } = useAgent()
  const source = itemsProp ?? activity
  const items = limit ? source.slice(0, limit) : source

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum evento para exibir.
      </p>
    )
  }

  return (
    <ol className="relative space-y-4">
      {items.map((event, i) => {
        const meta = kindMeta[event.kind]
        const Icon = meta.icon
        const isLast = i === items.length - 1
        return (
          <li key={event.id} className="relative flex gap-3">
            {!isLast && (
              <span className="absolute left-4 top-9 h-[calc(100%-4px)] w-px bg-border" aria-hidden />
            )}
            <div className={cn('z-10 flex size-8 shrink-0 items-center justify-center rounded-full', meta.className)}>
              <Icon className="size-4" />
            </div>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1">
              <p className="text-sm text-pretty">{event.message}</p>
              <div className="flex shrink-0 items-center gap-2">
                {typeof event.amount === 'number' && (
                  <span className="font-mono text-sm font-semibold tabular-nums text-success">
                    +{usd(event.amount)}
                  </span>
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  {timeOfDay(event.at)}
                </span>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
