import { Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { usd, relativeTime } from '@/lib/format'
import type { Task } from '@/lib/types'

export function RunningTaskItem({ task }: { task: Task }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-medium">{task.title}</p>
          <p className="text-xs text-muted-foreground">
            {task.source} • iniciada {relativeTime(task.startedAt)}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-sm font-semibold tabular-nums text-success">
          {usd(task.estimatedValue)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={task.progress} indicatorClassName="bg-success" />
        <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {Math.round(task.progress)}%
        </span>
      </div>
    </div>
  )
}
