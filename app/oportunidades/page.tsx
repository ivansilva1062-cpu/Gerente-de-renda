'use client'

import { RefreshCw } from 'lucide-react'

import { OpportunityItem } from '@/components/opportunity-item'
import { useAgent } from '@/components/agent-provider'

const CATEGORY_PRIORITY: Record<string, number> = {
  testing: 6,
  surveys: 5,
  microtasks: 4,
  freelance: 3,
  content: 2,
  affiliate: 1,
}

const LOW_VALUE_PHRASES = [
  'how to',
  'how do',
  'what is',
  'what are',
  'best ',
  'top ',
  'ultimate guide',
  'guide',
  'explained',
  'tips',
  'commission structure',
  'resources',
  'blog',
  'article',
  'news',
]

const ACTION_PHRASES = [
  'apply',
  'apply now',
  'sign up',
  'signup',
  'register',
  'join',
  'join now',
  'become',
  'paid',
  'get paid',
  'earn',
  'earning',
  'tester',
  'testing',
  'research study',
  'paid study',
  'paid survey',
  'microtask',
  'freelance job',
  'remote job',
]

function opportunityScore(opportunity: {
  category: string
  confidence: number
  title: string
}) {
  const categoryScore =
    (CATEGORY_PRIORITY[
      opportunity.category
    ] ?? 0) * 100

  const confidenceScore =
    Number(
      opportunity.confidence ?? 0,
    )

  const title =
    opportunity.title.toLowerCase()

  const contentPenalty =
    LOW_VALUE_PHRASES.some(
      (phrase) =>
        title.includes(
          phrase,
        ),
    )
      ? -150
      : 0

  const actionBonus =
    ACTION_PHRASES.some(
      (phrase) =>
        title.includes(
          phrase,
        ),
    )
      ? 50
      : 0

  return (
    categoryScore +
    confidenceScore +
    actionBonus +
    contentPenalty
  )
}

export default function OportunidadesPage() {
  const {
    opportunities,
    refreshOpportunities,
  } = useAgent()

  /*
   * Ordena sem alterar os dados originais.
   *
   * O radar continua encontrando as oportunidades.
   * Aqui apenas decidimos quais aparecem primeiro.
   */
  const prioritized =
    [...opportunities]
      .sort(
        (a, b) =>
          opportunityScore(b) -
          opportunityScore(a),
      )
      .slice(0, 50)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* CABEÇALHO */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Oportunidades
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              O radar prioriza oportunidades com ação real,
              como testes pagos, pesquisas, microtarefas
              e trabalhos freelance.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void refreshOpportunities()
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            <RefreshCw className="size-4" />

            Atualizar
          </button>
        </div>

        {/* RESUMO */}
        <div className="mb-6 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Oportunidades encontradas
              </p>

              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">
                {opportunities.length}
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                Fila priorizada
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Mostrando as{' '}
                {prioritized.length}{' '}
                mais acionáveis.
              </p>
            </div>
          </div>
        </div>

        {/* LISTA */}
        {prioritized.length > 0 ? (
          <section className="grid gap-4">
            {prioritized.map(
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
            )}
          </section>
        ) : (
          <section className="rounded-xl border border-border bg-card p-8 text-center">
            <h2 className="text-lg font-medium">
              Nenhuma oportunidade encontrada
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              Toque em Atualizar para
              consultar novamente as
              oportunidades disponíveis.
            </p>

            <button
              type="button"
              onClick={() =>
                void refreshOpportunities()
              }
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <RefreshCw className="size-4" />

              Procurar oportunidades
            </button>
          </section>
        )}

      </div>
    </main>
  )
}
