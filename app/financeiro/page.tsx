'use client'

import { DollarSign, Wallet, TrendingUp, Clock } from 'lucide-react'
import { useAgent } from '@/components/agent-provider'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { EarningsChart } from '@/components/earnings-chart'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usd, relativeTime } from '@/lib/format'
import { seedEarningsSeries } from '@/lib/mock-data'

export default function FinancialPage() {
  const { today, total, transactions } = useAgent()

  const series = seedEarningsSeries.map((d, i, arr) =>
    i === arr.length - 1 ? { ...d, amount: today } : d,
  )
  const avg = series.reduce((s, d) => s + d.amount, 0) / series.length
  const processing = transactions
    .filter((t) => t.status === 'processing')
    .reduce((s, t) => s + t.amount, 0)

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Acompanhamento dos ganhos gerados pelo agente. Valores em dólar (USD). Modo demonstração — sem movimentação real."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Hoje" value={usd(today)} icon={DollarSign} accent="success" />
        <StatCard label="Total acumulado" value={usd(total)} icon={Wallet} />
        <StatCard
          label="Média diária (14d)"
          value={usd(avg)}
          icon={TrendingUp}
        />
        <StatCard
          label="Em processamento"
          value={usd(processing)}
          icon={Clock}
          accent="warning"
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Ganhos dos últimos 14 dias</CardTitle>
          <CardDescription>Valores diários em USD (dados de demonstração)</CardDescription>
        </CardHeader>
        <CardContent>
          <EarningsChart data={series} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Transações recentes</CardTitle>
          <CardDescription>Entradas registradas pelo agente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{tx.description}</p>
                <p className="text-xs text-muted-foreground">
                  {tx.source} • {relativeTime(tx.at)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={tx.status === 'confirmed' ? 'success' : 'warning'}>
                  {tx.status === 'confirmed' ? 'Confirmado' : 'Processando'}
                </Badge>
                <span className="font-mono text-sm font-semibold tabular-nums text-success">
                  +{usd(tx.amount)}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
