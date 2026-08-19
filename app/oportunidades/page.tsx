'use client'

import { useState } from 'react'
import { useAgent } from '@/components/agent-provider'
import { PageHeader } from '@/components/page-header'
import { OpportunityItem } from '@/components/opportunity-item'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { categoryLabel } from '@/lib/labels'
import { usd } from '@/lib/format'
import type { OpportunityCategory } from '@/lib/types'
import { cn } from '@/lib/utils'

type Filter = 'all' | OpportunityCategory

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'microtasks', label: categoryLabel.microtasks },
  { key: 'freelance', label: categoryLabel.freelance },
  { key: 'surveys', label: categoryLabel.surveys },
  { key: 'content', label: categoryLabel.content },
  { key: 'affiliate', label: categoryLabel.affiliate },
  { key: 'testing', label: categoryLabel.testing },
]

export default function OpportunitiesPage() {
  const { opportunities } = useAgent()
  const [filter, setFilter] = useState<Filter>('all')

  const filtered =
    filter === 'all'
      ? opportunities
      : opportunities.filter((o) => o.category === filter)

  const potential = filtered.reduce((sum, o) => sum + o.estimatedValue, 0)

  return (
    <div>
      <PageHeader
        title="Oportunidades"
        description="Oportunidades legítimas de renda em dólar descobertas pelo agente. O agente busca novas fontes continuamente."
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-muted-foreground">Potencial estimado (filtro atual)</p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-success">
              {usd(potential)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Oportunidades listadas</p>
            <p className="font-mono text-2xl font-semibold tabular-nums">{filtered.length}</p>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
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

      <div className="space-y-3">
        {filtered.length > 0 ? (
          filtered.map((o) => <OpportunityItem key={o.id} opportunity={o} />)
        ) : (
          <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            Nenhuma oportunidade nesta categoria por enquanto.
          </p>
        )}
      </div>
    </div>
  )
}
