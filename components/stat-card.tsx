import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent = 'default',
  className,
}: {
  label: string
  value: string
  icon: LucideIcon
  hint?: React.ReactNode
  accent?: 'default' | 'success' | 'warning'
  className?: string
}) {
  const accentClasses = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/15 text-warning-foreground',
  }[accent]

  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
            {value}
          </p>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={cn('flex size-10 items-center justify-center rounded-lg', accentClasses)}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  )
}
