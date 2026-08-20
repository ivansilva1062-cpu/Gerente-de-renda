'use client'

import {
  Play,
  Check,
  Loader2,
  ExternalLink,
  UserRound,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAgent } from '@/components/agent-provider'
import { categoryLabel } from '@/lib/labels'
import { usd, relativeTime } from '@/lib/format'
import type { Opportunity } from '@/lib/types'

export function OpportunityItem({
  opportunity,
}: {
  opportunity: Opportunity
}) {
  const { startOpportunity } = useAgent()

  const o = opportunity

  const startable =
    o.status === 'new' ||
    o.status === 'queued'

  function handleStart() {
    if (!startable) {
      return
    }

    /*
     * IMPORTANTE:
     *
     * Iniciar uma oportunidade NÃO significa
     * que recebemos dinheiro.
     *
     * Apenas cria a tarefa e inicia o fluxo.
     */
    startOpportunity(o.id)

    /*
     * Abre somente a página oficial
     * encontrada pelo radar.
     *
     * Nenhuma senha, Pix, cartão, CPF
     * ou código de autenticação é enviado
     * automaticamente daqui.
     */
    if (o.url) {
      window.open(
        o.url,
        '_blank',
        'noopener,noreferrer',
      )
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">

      {/* INFORMAÇÕES */}
      <div className="min-w-0 flex-1 space-y-1.5">

        <div className="flex flex-wrap items-center gap-2">

          <p className="truncate font-medium">
            {o.title}
          </p>

          <Badge variant="neutral">
            {categoryLabel[o.category]}
          </Badge>

          {o.requiresSignup && (
            <Badge variant="outline">
              <UserRound className="mr-1 size-3" />
              Cadastro
            </Badge>
          )}

        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">

          <span>
            {o.source}
          </span>

          <span className="text-border">
            •
          </span>

          <span>
            Confiança {o.confidence}%
          </span>

          <span className="text-border">
            •
          </span>

          <span>
            {relativeTime(
              o.discoveredAt,
            )}
          </span>

        </div>

      </div>

      {/* VALOR + AÇÃO */}
      <div className="flex flex-col items-end gap-2">

        <span className="font-mono text-sm font-semibold tabular-nums text-success">
          {usd(o.estimatedValue)}
        </span>

        {/* EM EXECUÇÃO */}
        {o.status === 'running' && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Em execução
          </span>
        )}

        {/* CONCLUÍDA */}
        {o.status === 'done' && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check className="size-3" />
            Concluída
          </span>
        )}

        {/* PENDENTE */}
        {o.status === 'pending' && (
          <Badge variant="warning">
            Pendente
          </Badge>
        )}

        {/* NOVA / NA FILA */}
        {startable && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleStart}
            disabled={!startable}
          >
            <Play />
            Iniciar
          </Button>
        )}

      </div>

    </div>
  )
}
