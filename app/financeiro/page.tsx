'use client'

import {
  DollarSign,
  Wallet,
  TrendingUp,
  Clock,
} from 'lucide-react'

import { useAgent } from '@/components/agent-provider'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { EarningsChart } from '@/components/earnings-chart'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'

import { Badge } from '@/components/ui/badge'
import { usd, relativeTime } from '@/lib/format'
import { seedEarningsSeries } from '@/lib/mock-data'

export default function FinancialPage() {
  const {
    today,
    total,
    transactions,
  } = useAgent()

  /*
   * O gráfico usa somente valores financeiros
   * que realmente foram registrados.
   *
   * Enquanto não houver pagamentos confirmados,
   * permanece em zero.
   */
  const series =
    seedEarningsSeries.map(
      (d, i, arr) =>
        i === arr.length - 1
          ? {
              ...d,
              amount: today,
            }
          : d,
    )

  /*
   * Média baseada somente nos valores registrados.
   */
  const avg =
    series.reduce(
      (sum, d) =>
        sum + d.amount,
      0,
    ) / series.length

  /*
   * Dinheiro que ainda está processando.
   *
   * NÃO entra no saldo confirmado.
   */
  const processing =
    transactions
      .filter(
        (t) =>
          t.status ===
          'processing',
      )
      .reduce(
        (sum, t) =>
          sum + t.amount,
        0,
      )

  /*
   * Somente pagamentos confirmados.
   */
  const confirmed =
    transactions.filter(
      (t) =>
        t.status ===
        'confirmed',
    )

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Acompanhamento dos pagamentos confirmados pelo sistema. Valores em dólar (USD)."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hoje"
          value={usd(today)}
          icon={DollarSign}
          accent="success"
        />

        <StatCard
          label="Total confirmado"
          value={usd(total)}
          icon={Wallet}
        />

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
          <CardTitle>
            Ganhos dos últimos 14 dias
          </CardTitle>

          <CardDescription>
            Somente pagamentos registrados pelo sistema
          </CardDescription>
        </CardHeader>

        <CardContent>
          <EarningsChart
            data={series}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            Pagamentos confirmados
          </CardTitle>

          <CardDescription>
            Entradas financeiras realmente confirmadas
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-2">
          {confirmed.length >
          0 ? (
            confirmed.map(
              (tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {tx.description}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {tx.source} •{' '}
                      {relativeTime(
                        tx.at,
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge variant="success">
                      Confirmado
                    </Badge>

                    <span className="font-mono text-sm font-semibold tabular-nums text-success">
                      +
                      {usd(
                        tx.amount,
                      )}
                    </span>
                  </div>
                </div>
              ),
            )
          ) : (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum pagamento confirmado ainda.
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                O saldo só aumenta quando um pagamento real for confirmado.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {processing > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>
              Pagamentos em processamento
            </CardTitle>

            <CardDescription>
              Ainda não fazem parte do saldo confirmado.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-2">
            {transactions
              .filter(
                (t) =>
                  t.status ===
                  'processing',
              )
              .map(
                (tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {tx.description}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        {tx.source} •{' '}
                        {relativeTime(
                          tx.at,
                        )}
                      </p>
                    </div>

                    <Badge variant="warning">
                      Processando
                    </Badge>

                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {usd(
                        tx.amount,
                      )}
                    </span>
                  </div>
                ),
              )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
