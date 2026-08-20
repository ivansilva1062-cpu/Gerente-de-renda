import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/*
 * RADAR DE OPORTUNIDADES
 *
 * Este endpoint mantém um catálogo de fontes reais
 * onde o usuário pode encontrar oportunidades de renda.
 *
 * IMPORTANTE:
 * - Não inventa dinheiro.
 * - Não transforma oportunidade em ganho.
 * - Não usa senhas, CPF, cartão ou 2FA.
 * - Não executa ações financeiras automaticamente.
 * - O ganho só entra em /api/earnings após confirmação real.
 */

const SOURCES = [
  {
    id: 'source-prolific',
    title: 'Prolific — estudos pagos',
    source: 'Prolific',
    category: 'surveys',
    confidence: 95,
    url: 'https://www.prolific.com/participants-join-us',
    requiresSignup: true,
    requiresUserAction: true,
  },

  {
    id: 'source-usertesting',
    title: 'UserTesting — testes de sites e aplicativos',
    source: 'UserTesting',
    category: 'testing',
    confidence: 95,
    url: 'https://www.usertesting.com/get-paid-to-test',
    requiresSignup: true,
    requiresUserAction: true,
  },

  {
    id: 'source-clickworker',
    title: 'Clickworker — microtarefas',
    source: 'Clickworker',
    category: 'microtasks',
    confidence: 90,
    url: 'https://www.clickworker.com/clickworker/',
    requiresSignup: true,
    requiresUserAction: true,
  },

  {
    id: 'source-fiverr',
    title: 'Fiverr — vender serviços',
    source: 'Fiverr',
    category: 'freelance',
    confidence: 90,
    url: 'https://www.fiverr.com/',
    requiresSignup: true,
    requiresUserAction: true,
  },
]

export async function GET() {
  try {
    /*
     * Cria a tabela caso ainda não exista.
     */
    await sql`
      CREATE TABLE IF NOT EXISTS opportunities (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        category TEXT NOT NULL,
        estimated_value NUMERIC(12,2) NOT NULL DEFAULT 0,
        confidence INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new',
        url TEXT,
        requires_signup BOOLEAN NOT NULL DEFAULT TRUE,
        requires_user_action BOOLEAN NOT NULL DEFAULT TRUE,
        discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `

    let discovered = 0

    /*
     * Registra as fontes conhecidas.
     *
     * ON CONFLICT evita duplicação.
     */
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
          url,
          requires_signup,
          requires_user_action,
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
          ${opportunity.url},
          ${opportunity.requiresSignup},
          ${opportunity.requiresUserAction},
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          source = EXCLUDED.source,
          category = EXCLUDED.category,
          confidence = EXCLUDED.confidence,
          url = EXCLUDED.url,
          requires_signup = EXCLUDED.requires_signup,
          requires_user_action = EXCLUDED.requires_user_action
        RETURNING id
      `

      if (result.length > 0) {
        discovered += 1
      }
    }

    /*
     * Busca as oportunidades cadastradas.
     */
    const rows = await sql`
      SELECT
        id,
        title,
        source,
        category,
        estimated_value,
        confidence,
        status,
        url,
        requires_signup,
        requires_user_action,
        discovered_at,
        created_at
      FROM opportunities
      ORDER BY discovered_at DESC
      LIMIT 100
    `

    const opportunities = rows.map((row) => ({
      id: row.id,
      title: row.title,
      source: row.source,
      category: row.category,

      /*
       * Zero significa que ainda não existe
       * pagamento confirmado para esta oportunidade.
       */
      estimatedValue: Number(
        row.estimated_value ?? 0,
      ),

      confidence: Number(
        row.confidence ?? 0,
      ),

      status: row.status,

      url: row.url ?? null,

      requiresSignup:
        Boolean(
          row.requires_signup,
        ),

      requiresUserAction:
        Boolean(
          row.requires_user_action,
        ),

      discoveredAt:
        row.discovered_at,

      createdAt:
        row.created_at,
    }))

    return NextResponse.json({
      success: true,

      discovered,

      checked:
        SOURCES.length,

      total:
        opportunities.length,

      opportunities,

      message:
        'Radar de oportunidades atualizado com fontes reais.',
    })
  } catch (error) {
    console.error(
      'Erro no radar de oportunidades:',
      error,
    )

    return NextResponse.json(
      {
        success: false,
        error:
          'Erro ao atualizar radar de oportunidades',
        opportunities: [],
      },
      {
        status: 500,
      },
    )
  }
}
