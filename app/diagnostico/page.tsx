'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Activity } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usd } from '@/lib/format'

type ExecutionHistoryRow = {
  execution_id: string
  opportunity_id: string | null
  title: string | null
  source: string | null
  state: string
  action: string
  action_type: string | null
  attempt: number
  evidence: string | null
  error: string | null
  intervention: { reason?: string } | null
  started_at: string
  finished_at: string
}

type Metrics = {
  discovered: number
  executed: number
  actionsCompleted: number
  waitingUser: number
  failures: number
  confirmedEarnings: number
  confirmedValue: number
  conversionRate: number
}

const stateVariant: Record<string, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  completed: 'success',
  running: 'neutral',
  queued: 'neutral',
  waiting_human: 'warning',
  waiting_external: 'warning',
  blocked: 'destructive',
  failed: 'destructive',
}

export default function DiagnosticoPage() {
  const [history, setHistory] = useState<ExecutionHistoryRow[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [historyResponse, metricsResponse] = await Promise.all([
        fetch('/api/execution', { cache: 'no-store' }),
        fetch('/api/metrics', { cache: 'no-store' }),
      ])

      if (historyResponse.ok) {
        const data = await historyResponse.json() as { history?: ExecutionHistoryRow[] }
        setHistory(Array.isArray(data.history) ? data.history : [])
      }

      if (metricsResponse.ok) {
        const data = await metricsResponse.json() as { metrics?: Metrics }
        setMetrics(data.metrics ?? null)
      }
    } catch (error) {
      console.error('Erro ao carregar diagnóstico:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    /*
     * Apenas leitura periódica do estado real do banco — o Worker
     * continua funcionando via Cron mesmo sem esta aba aberta.
     */
    const interval = setInterval(() => void refresh(), 15_000)
    return () => clearInterval(interval)
  }, [refresh])

  return (
    <div>
      <PageHeader
        title="Diagnóstico"
        description="Estado real do Worker persistido no banco: o que foi executado, o que falhou, o que aguarda você e o que está confirmado."
        actions={
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            Atualizar
          </Button>
        }
      />

      {metrics && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Descobertas</p><p className="font-mono text-xl font-semibold">{metrics.discovered}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Executadas</p><p className="font-mono text-xl font-semibold">{metrics.executed}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ações concluídas</p><p className="font-mono text-xl font-semibold">{metrics.actionsCompleted}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Aguardando você</p><p className="font-mono text-xl font-semibold">{metrics.waitingUser}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Falhas</p><p className="font-mono text-xl font-semibold">{metrics.failures}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ganhos confirmados</p><p className="font-mono text-xl font-semibold text-success">{metrics.confirmedEarnings}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taxa de conversão</p><p className="font-mono text-xl font-semibold">{(metrics.conversionRate * 100).toFixed(1)}%</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Valor confirmado</p><p className="font-mono text-xl font-semibold text-success">{usd(metrics.confirmedValue)}</p></CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Activity className="size-4" />
          <CardTitle>Execuções recentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Nenhuma execução registrada ainda.
            </p>
          ) : (
            history.map((row) => (
              <div key={row.execution_id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{row.title ?? row.opportunity_id ?? row.execution_id}</p>
                  <Badge variant={stateVariant[row.state] ?? 'neutral'}>{row.state}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.source ?? '—'} • ação: {row.action} {row.action_type ? `(${row.action_type})` : ''} • tentativa {row.attempt}
                </p>
                {row.evidence && <p className="mt-1 text-xs text-muted-foreground">{row.evidence}</p>}
                {row.error && <p className="mt-1 text-xs text-destructive">{row.error}</p>}
                {row.intervention?.reason && <p className="mt-1 text-xs text-warning-foreground">{row.intervention.reason}</p>}
                <p className="mt-1 text-[0.7rem] text-muted-foreground">
                  início {new Date(row.started_at).toLocaleString('pt-BR')} • atualizado {new Date(row.finished_at).toLocaleString('pt-BR')}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
