'use client'

import {
  DollarSign,
  Wallet,
  TrendingUp,
  Clock,
} from 'lucide-react'

import { useEffect, useMemo, useState } from 'react'

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

type DatabaseEarning = {
  id: string
  description: string
  source: string
  amount: number | string
  created_at: string
}

export default function FinancialPage() {
  const {
    transactions,
  } = useAgent()

  /*
   * PAGAMENTOS VINDOS DO BANCO
   *
   * A página consulta a API sempre que é aberta.
   */
  const [databaseEarnings, setDatabaseEarnings] =
    useState<DatabaseEarning[]>([])

  const [databaseTotal, setDatabaseTotal] =
    useState(0)

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState<string | null>(null)

  /*
   * BUSCAR DADOS DO BANCO
   */
  useEffect(() => {
    let active = true

    async function loadEarnings() {
      try {
        setLoading(true)
        setError(null)

        const response =
          await fetch('/api/earnings', {
            method: 'GET',
            cache: 'no-store',
          })

        if (!response.ok) {
          throw new Error(
            'Não foi possível consultar os ganhos.',
          )
        }

        const data =
          await response.json()

        if (!active) {
          return
        }

        const earnings =
          Array.isArray(data.earnings)
            ? data.earnings
            : []

        setDatabaseEarnings(
          earnings,
        )

        setDatabaseTotal(
          Number(data.total ?? 0),
        )
      } catch (err) {
        console.error(
          'Erro ao carregar financeiro:',
          err,
        )

        if (active) {
          setError(
            'Não foi possível carregar os dados financeiros do banco.',
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadEarnings()

    return () => {
      active = false
    }
  }, [])

  /*
   * PAGAMENTOS CONFIRMADOS
   *
   * O banco é a fonte principal.
   */
  const confirmed =
    useMemo(
      () =>
        databaseEarnings.map(
          (earning) => ({
            id: earning.id,
            description:
              earning.description,
            source:
              earning.source,
            amount:
              Number(earning.amount),
            at:
              earning.created_at,
            status:
              'confirmed' as const,
          }),
        ),
      [databaseEarnings],
    )

  /*
   * TOTAL CONFIRMADO
   *
   * Vem diretamente do banco.
   */
  const total =
    databaseTotal

  /*
   * VALOR DE HOJE
   *
   * Calculado pelos pagamentos registrados
   * hoje no banco.
   */
  const today =
    useMemo(() => {
      const now =
        new Date()

      const year =
        now.getFullYear()

      const month =
        now.getMonth()

      const day =
        now.getDate()

      return confirmed
        .filter((tx) => {
          const date =
            new Date(tx.at)

          return (
            date.getFullYear() ===
              year &&
            date.getMonth() ===
              month &&
            date.getDate() ===
              day
          )
        })
        .reduce(
          (sum, tx) =>
            sum + tx.amount,
          0,
        )
    }, [confirmed])

  /*
   * MÉDIA DOS ÚLTIMOS 14 DIAS
   */
  const avg =
    useMemo(() => {
      const now =
        new Date()

      const fourteenDaysAgo =
        new Date(now)

      fourteenDaysAgo.setDate(
        now.getDate() - 13,
      )

      const dailyTotals: Record<
        string,
        number
      > = {}

      confirmed.forEach(
        (tx) => {
          const date =
            new Date(tx.at)

          if (
            date <
            fourteenDaysAgo
          ) {
            return
          }

          const key =
            `${date.getFullYear()}-${String(
              date.getMonth() + 1,
            ).padStart(2, '0')}-${String(
              date.getDate(),
            ).padStart(2, '0')}`

          dailyTotals[key] =
            (dailyTotals[key] ?? 0) +
            tx.amount
        },
      )

      const total14 =
        Object.values(
          dailyTotals,
        ).reduce(
          (sum, value) =>
            sum + value,
          0,
        )

      return total14 / 14
    }, [confirmed])

  /*
   * GRÁFICO DOS ÚLTIMOS 14 DIAS
   *
   * Agora o gráfico também usa
   * os pagamentos vindos do banco.
   */
  const series =
    useMemo(() => {
      const result: {
        date: string
        amount: number
      }[] = []

      const now =
        new Date()

      for (
        let i = 13;
        i >= 0;
        i--
      ) {
        const date =
          new Date(now)

        date.setHours(
          0,
          0,
          0,
          0,
        )

        date.setDate(
          now.getDate() - i,
        )

        const year =
          date.getFullYear()

        const month =
          date.getMonth()

        const day =
          date.getDate()

        const amount =
          confirmed
            .filter((tx) => {
              const txDate =
                new Date(tx.at)

              return (
                txDate.getFullYear() ===
                  year &&
                txDate.getMonth() ===
                  month &&
                txDate.getDate() ===
                  day
              )
            })
            .reduce(
              (sum, tx) =>
                sum + tx.amount,
              0,
            )

        result.push({
          date:
            date.toISOString(),
          amount,
        })
      }

      return result
    }, [confirmed])

  /*
   * PAGAMENTOS EM PROCESSAMENTO
   *
   * Esses ainda não entram no banco
   * como ganhos confirmados.
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

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Acompanhamento dos pagamentos confirmados pelo sistema. Valores em dólar (USD)."
      />

      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">
              {error}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hoje"
          value={
            loading
              ? '...'
              : usd(today)
          }
          icon={DollarSign}
          accent="success"
        />

        <StatCard
          label="Total confirmado"
          value={
            loading
              ? '...'
              : usd(total)
          }
          icon={Wallet}
        />

        <StatCard
          label="Média diária (14d)"
          value={
            loading
              ? '...'
              : usd(avg)
          }
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
            Somente pagamentos registrados no banco de dados
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
            Entradas financeiras realmente registradas pelo sistema
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-2">
          {loading ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Consultando banco de dados...
              </p>
            </div>
          ) : confirmed.length >
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
