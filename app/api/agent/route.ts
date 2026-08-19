import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/*
 * CÉREBRO DO GERENTE DE RENDA
 *
 * Esta API coordena a operação do agente.
 *
 * IMPORTANTE:
 * - Oportunidade não é dinheiro recebido.
 * - O saldo real continua em /api/earnings.
 * - As metas são apenas indicadores.
 * - O agente não deve parar ao atingir uma meta.
 */

export async function GET() {
  try {
    const result = await sql`
      SELECT
        COUNT(*)::int AS total_opportunities,
        COUNT(*) FILTER (
          WHERE status = 'new'
        )::int AS new_opportunities,
        COALESCE(
          SUM(estimated_value),
          0
        ) AS estimated_total
      FROM opportunities
    `

    const stats = result[0]

    return NextResponse.json({
      success: true,

      agent: {
        status: 'working',
        active: true,
        canContinue: true,
        message:
          'O agente continua trabalhando e procurando novas oportunidades.',
      },

      opportunities: {
        total: Number(
          stats?.total_opportunities ?? 0,
        ),
        new: Number(
          stats?.new_opportunities ?? 0,
        ),
        estimatedValue: Number(
          stats?.estimated_total ?? 0,
        ),
      },

      rules: {
        goalsAreIndicators: true,
        stopWhenGoalReached: false,
        stopOnlyWhenManuallyRequested: true,
      },
    })
  } catch (error) {
    console.error(
      'Erro ao consultar o agente:',
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
