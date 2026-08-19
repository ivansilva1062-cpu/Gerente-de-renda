'use client'

import { useState } from 'react'
import { useAgent } from '@/components/agent-provider'
import { PageHeader } from '@/components/page-header'
import { ActivityFeed } from '@/components/activity-feed'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { activityLabel } from '@/lib/labels'
import type { ActivityKind } from '@/lib/types'

type Filter = 'all' | ActivityKind

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tudo' },
  { key: 'earning', label: activityLabel.earning },
  { key: 'discovery', label: activityLabel.discovery },
  { key: 'start', label: activityLabel.start },
  { key: 'pending', label: activityLabel.pending },
  { key: 'resolved', label: activityLabel.resolved },
  { key: 'system', label: activityLabel.system },
]

export default function HistoryPage() {
  const { activity } = useAgent()
  const [filter, setFilter] = useState<Filter>('all')

  const filtered =
    filter === 'all' ? activity : activity.filter((a) => a.kind === filter)
  const earned = activity
    .filter((a) => typeof a.amount === 'number')
    .reduce((s, a) => s + (a.amount ?? 0), 0)

  return (
    <div>
      <PageHeader
        title="Histórico"
        description="Registro completo das atividades do agente: descobertas, execuções, ganhos e pendências."
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-muted-foreground">Eventos registrados</p>
            <p className="font-mono text-2xl font-semibold tabular-nums">{activity.length}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Ganhos no histórico</p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-success">
              +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(earned)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'default' : 'outline'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-5">
          <ActivityFeed items={filtered} />
        </CardContent>
      </Card>
    </div>
  )
}
