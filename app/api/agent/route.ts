import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import {
  assessOpportunity,
  rankOpportunities,
  runManagerModules,
  type OpportunityInput,
} from '@/lib/manager-modules'
import { decideManagerAction } from '@/lib/manager-decision'
import { requestHasActiveSession } from '@/lib/auth-server'

/*
 * CÉREBRO DO GERENTE DE RENDA
 *
 * Esta API representa o estado central do agente.
 *
 * REGRAS:
 * - Metas são apenas indicadores.
 * - Atingir uma meta NÃO para o agente.
 * - O agente só deve parar quando Ivan solicitar.
 * - Oportunidade não é dinheiro recebido.
 * - O saldo só pode ser alterado por ganho confirmado.
 * - Pendências humanas não bloqueiam as demais atividades.
 */

export async function GET() {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }
  try {
    /*
     * O agente sempre pode continuar trabalhando.
     *
     * A pausa real é controlada pelo estado do aplicativo,
     * não por atingir uma meta financeira.
     */
    const agent = {
      status: 'working',
      active: true,
      canContinue: true,

      rules: {
        goalsAreIndicators: true,
        stopWhenGoalReached: false,
        stopOnlyWhenManuallyRequested: true,
        pendingTasksBlockAgent: false,
        estimatedValuesAreMoney: false,
        onlyConfirmedEarningsAffectBalance: true,
      },

      message:
        'O Gerente de Renda continua procurando e processando oportunidades. Metas são apenas indicadores.',
    }

    /*
     * CONSULTA OPORTUNIDADES EXISTENTES
     */
    let opportunities = {
      total: 0,
      new: 0,
      running: 0,
      estimatedValue: 0,
    }

    let managerCandidate: OpportunityInput | null = null

    try {
      const result = await sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE status = 'new'
          )::int AS new,
          COUNT(*) FILTER (
            WHERE status = 'running'
          )::int AS running,
          COALESCE(
            SUM(estimated_value),
            0
          ) AS estimated_value
        FROM opportunities
      `

      const row = result[0]

      opportunities = {
        total: Number(row?.total ?? 0),
        new: Number(row?.new ?? 0),
        running: Number(row?.running ?? 0),
        estimatedValue: Number(
          row?.estimated_value ?? 0,
        ),
      }

      const opportunityRow = await sql`
        SELECT
          title,
          url,
          description,
          source,
          category,
          confidence,
          estimated_value
        FROM opportunities
        WHERE title IS NOT NULL
          AND url IS NOT NULL
        ORDER BY manager_blocked ASC, manager_score DESC, confidence DESC, estimated_value DESC, created_at DESC NULLS LAST
        LIMIT 20
      `

        const opportunityRows = opportunityRow as Array<Record<string, unknown>>
        const latestOpportunity = rankOpportunities(opportunityRows.map((row) => ({
          title: String(row.title ?? ''),
          url: String(row.url ?? ''),
          description: String(row.description ?? ''),
          source: String(row.source ?? ''),
          category: String(row.category ?? ''),
          confidence: Number(row.confidence ?? 0),
          estimatedValue: Number(row.estimated_value ?? 0),
        })))
        .at(0)?.input

      if (latestOpportunity) {
        managerCandidate = latestOpportunity
      }
    } catch (error) {
      /*
       * Se a tabela ainda não existir,
       * o agente continua funcionando.
       */
      console.error(
        'Erro ao consultar oportunidades:',
        error,
      )
    }

    /*
     * CONSULTA GANHOS CONFIRMADOS
     */
    let earnings = {
      total: 0,
      today: 0,
    }

    try {
      const result = await sql`
        SELECT
          COALESCE(
            SUM(amount),
            0
          ) AS total,

          COALESCE(
            SUM(
              CASE
                WHEN created_at >= CURRENT_DATE
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS today

        FROM earnings
      `

      const row = result[0]

      earnings = {
        total: Number(row?.total ?? 0),
        today: Number(row?.today ?? 0),
      }
    } catch (error) {
      /*
       * O saldo continua sendo zero
       * caso a tabela ainda não esteja disponível.
       */
      console.error(
        'Erro ao consultar ganhos:',
        error,
      )
    }

    const managerModules = managerCandidate ? runManagerModules(managerCandidate) : []
    const assessment = managerCandidate ? assessOpportunity(managerCandidate) : null
    const managerDecision = assessment
      ? decideManagerAction(managerModules, {
          score: assessment.score,
          priority: assessment.priority,
        })
      : null

    const pipeline = [
      'radar',
      'avaliador',
      'risco',
      'financeiro',
      'publicador',
      'vendedor',
      'entrega',
    ]

    const blockedModules =
      managerModules.filter(
        (module) =>
          !module.approved,
      )

    return NextResponse.json({
      success: true,

      agent,

      managerModules,

      managerOrchestration: {
        enabled: true,
        pipeline,
        approved:
          blockedModules.length === 0,
        blockedBy: blockedModules.map(
          (module) =>
            module.module,
        ),
        candidate: managerCandidate,
        rulesPreserved: true,
        assessment,
        decision: managerDecision,
        message: managerCandidate
          ? 'Candidata real priorizada pelo score combinado dos módulos.'
          : 'Não há candidata real disponível no momento; o Radar deve continuar pesquisando.',
      },

      opportunities,

      earnings,

      /*
       * IMPORTANTE:
       *
       * Este valor NÃO representa dinheiro.
       * É somente uma referência para o agente.
       */
      dailyGoal: 120,

      financialRules: {
        estimatedOpportunityValueIsNotBalance: true,
        taskCompletionIsNotAutomaticallyPayment: true,
        paymentMustBeConfirmed: true,
      },

      nextAction:
        'Continuar procurando oportunidades e processando tarefas disponíveis.',
    })
  } catch (error) {
    console.error(
      'Erro no cérebro do agente:',
      error,
    )

    return NextResponse.json(
      {
        success: false,
        error: 'Erro ao consultar o agente',
      },
      {
        status: 500,
      },
    )
  }
}
