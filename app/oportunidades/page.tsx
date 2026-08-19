'use client'

import { useState } from 'react'

import { RefreshCw, Search } from 'lucide-react'

import { useAgent } from '@/components/agent-provider'
import { PageHeader } from '@/components/page-header'
import { OpportunityItem } from '@/components/opportunity-item'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { categoryLabel } from '@/lib/labels'
import { usd } from '@/lib/format'

import type { OpportunityCategory } from '@/lib/types'

type Filter = 'all' | OpportunityCategory

const filters: {
  key: Filter
  label: string
}[] = [
  {
    key: 'all',
    label: 'Todas',
  },
  {
    key: 'microtasks',
    label: categoryLabel.microtasks,
  },
  {
    key: 'freelance',
    label: categoryLabel.freelance,
  },
  {
    key: 'surveys',
    label: categoryLabel.surveys,
  },
  {
    key: 'content',
    label: categoryLabel.content,
  },
  {
    key: 'affiliate',
    label: categoryLabel.affiliate,
  },
  {
    key: 'testing',
    label: categoryLabel.testing,
  },
]

export default function OpportunitiesPage() {
  const {
    opportunities,
    refreshOpportunities,
    status,
  } = useAgent()

  const [
    filter,
    setFilter,
  ] = useState<Filter>('all')

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const filtered =
    filter === 'all'
      ? opportunities
      : opportunities.filter(
          (o) =>
            o.category ===
            filter,
        )

  const potential =
    filtered.reduce(
      (sum, opportunity) =>
        sum +
        Number(
          opportunity.estimatedValue ??
            0,
        ),
      0,
    )

  async function handleRefresh() {
    if (refreshing) {
      return
    }

    setRefreshing(true)

    try {
      await refreshOpportunities()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Oportunidades"
        description="Oportunidades encontradas pelo sistema. Os valores exibidos são estimativas e não representam dinheiro recebido."
      />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Potencial estimado
            </p>

            <p className="font-mono text-2xl font-semibold tabular-nums text-success">
              {usd(potential)}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Estimativa das oportunidades
              atualmente filtradas.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">
                Oportunidades
              </p>

              <p className="font-mono text-2xl font-semibold tabular-nums">
                {filtered.length}
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={
                handleRefresh
              }
              disabled={
                refreshing ||
                status !==
                  'working'
              }
            >
              <RefreshCw
                className={
                  refreshing
                    ? 'animate-spin'
                    : ''
                }
              />

              {refreshing
                ? 'Atualizando'
                : 'Atualizar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map(
          (item) => (
            <Button
              key={
                item.key
              }
              size="sm"
              variant={
                filter ===
                item.key
                  ? 'default'
                  : 'outline'
              }
              onClick={() =>
                setFilter(
                  item.key,
                )
              }
            >
              {item.label}
            </Button>
          ),
        )}
      </div>

      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Search className="size-4" />

        <span>
          O sistema consulta as
          oportunidades armazenadas
          no banco de dados.
        </span>
      </div>

      <div className="space-y-3">
        {filtered.length >
        0 ? (
          filtered.map(
            (opportunity) => (
              <OpportunityItem
                key={
                  opportunity.id
                }
                opportunity={
                  opportunity
                }
              />
            ),
          )
        ) : (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm font-medium">
              Nenhuma oportunidade
              disponível.
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Quando uma oportunidade
              válida for registrada
              no banco, ela aparecerá
              aqui.
            </p>

            <Button
              className="mt-4"
              size="sm"
              variant="outline"
              onClick={
                handleRefresh
              }
              disabled={
                refreshing ||
                status !==
                  'working'
              }
            >
              <RefreshCw
                className={
                  refreshing
                    ? 'animate-spin'
                    : ''
                }
              />

              Verificar novamente
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
