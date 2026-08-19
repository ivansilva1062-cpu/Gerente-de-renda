import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/*
 * DESCOBERTA DE OPORTUNIDADES
 *
 * Esta API registra fontes de oportunidades no sistema.
 *
 * IMPORTANTE:
 * - Não registra dinheiro recebido.
 * - Não altera o saldo financeiro.
 * - Não executa ações em nome do usuário.
 * - Oportunidades continuam sendo apenas oportunidades
 *   até existir uma renda realmente confirmada.
 */

const SOURCES = [
  {
    id: 'source-prolific',
    title: 'Prolific — estudos pagos',
    source: 'Prolific',
    category: 'surveys',
    confidence: 95,
  },
  {
    id: 'source-usertesting',
    title: 'UserTesting — testes de sites e aplicativos',
    source: 'UserTesting',
    category: 'testing',
    confidence: 95,
  },
  {
    id: 'source-clickworker',
    title: 'Clickworker — microtarefas',
    source: 'Clickworker',
    category: 'microtasks',
    confidence: 95,
  },
  {
    id: 'source-fiverr',
    title: 'Fiverr — vender serviços',
    source: 'Fiverr',
    category: 'freelance',
    confidence: 90,
  },
]

export async function GET() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS opportunities (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        category TEXT NOT NULL,
        estimated_value NUMERIC(12,2) NOT NULL DEFAULT 0,
        confidence INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new',
        discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `

    let discovered = 0

    for (const opportunity of SOURCES) {
      const result = await sql`
        INSERT INTO opportunities (
          id,
          title,
          source,
          category,
          estimated_value,
          confidence,
          status,
          discovered_at
        )
        VALUES (
          ${opportunity.id},
          ${opportunity.title},
          ${opportunity.source},
          ${opportunity.category},
          0,
          ${opportunity.confidence},
          'new',
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `

      if (result.length > 0) {
        discovered += 1
      }
    }

    return NextResponse.json({
      success: true,
      discovered,
      checked: SOURCES.length,
      message:
        'Fontes de oportunidades verificadas com sucesso.',
    })
  } catch (error) {
    console.error(
      'Erro ao descobrir oportunidades:',
      error,
    )

    return NextResponse.json(
      {
        success: false,
        error:
          'Erro ao descobrir oportunidades',
      },
      {
        status: 500,
      },
    )
  }
}
