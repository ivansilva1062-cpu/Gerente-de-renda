import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/*
 * API DE OPORTUNIDADES
 *
 * IMPORTANTE:
 * - Oportunidade não é dinheiro recebido.
 * - estimatedValue é apenas estimativa.
 * - O saldo real é controlado por /api/earnings.
 * - A URL serve para encaminhar o usuário à fonte.
 * - O sistema não usa senha, CPF, cartão ou 2FA.
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
    title:
      'UserTesting — testes de sites e aplicativos',
    source: 'UserTesting',
    category: 'testing',
    confidence: 95,
    url:
      'https://www.usertesting.com/get-paid-to-test',
    requiresSignup: true,
    requiresUserAction: true,
  },
  {
    id: 'source-clickworker',
    title: 'Clickworker — microtarefas',
    source: 'Clickworker',
    category: 'microtasks',
    confidence: 90,
    url:
      'https://www.clickworker.com/clickworker/',
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

async function ensureTable() {
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

  /*
   * Compatibilidade com bancos criados
   * pela versão anterior.
   */
  await sql`
    ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS url TEXT
  `

  await sql`
    ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS requires_signup BOOLEAN NOT NULL DEFAULT TRUE
  `

  await sql`
    ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS requires_user_action BOOLEAN NOT NULL DEFAULT TRUE
  `
}

async function seedSources() {
  for (const opportunity of SOURCES) {
    await sql`
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
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        source = EXCLUDED.source,
        category = EXCLUDED.category,
        confidence = EXCLUDED.confidence,
        url = EXCLUDED.url,
        requires_signup = EXCLUDED.requires_signup,
        requires_user_action = EXCLUDED.requires_user_action
    `
  }
}

function normalizeOpportunity(row: any) {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    category: row.category,

    /*
     * Nunca confundir estimativa
     * com dinheiro recebido.
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
      Boolean(row.requires_signup),

    requiresUserAction:
      Boolean(row.requires_user_action),

    discoveredAt:
      row.discovered_at,

    createdAt:
      row.created_at,
  }
}

/*
 * GET
 *
 * Carrega as oportunidades disponíveis
 * para o painel.
 */
export async function GET() {
  try {
    await ensureTable()
    await seedSources()

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

    const opportunities =
      rows.map(normalizeOpportunity)

    return NextResponse.json({
      success: true,
      opportunities,
      total: opportunities.length,
    })
  } catch (error) {
    console.error(
      'Erro ao consultar oportunidades:',
      error,
    )

    return NextResponse.json(
      {
        success: false,
        error:
          'Erro ao consultar oportunidades',
        opportunities: [],
      },
      {
        status: 500,
      },
    )
  }
}

/*
 * POST
 *
 * Permite cadastrar uma nova oportunidade
 * sem transformar isso em ganho financeiro.
 */
export async function POST(
  request: Request,
) {
  try {
    const body =
      await request.json()

    const {
      id,
      title,
      source,
      category,
      estimatedValue,
      confidence,
      url,
      requiresSignup,
      requiresUserAction,
    } = body

    if (
      !id ||
      !title ||
      !source ||
      !category
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Dados da oportunidade incompletos',
        },
        {
          status: 400,
        },
      )
    }

    const value =
      Number(
        estimatedValue ?? 0,
      )

    const confidenceValue =
      Number(
        confidence ?? 0,
      )

    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Valor estimado inválido',
        },
        {
          status: 400,
        },
      )
    }

    if (
      !Number.isInteger(
        confidenceValue,
      ) ||
      confidenceValue < 0 ||
      confidenceValue > 100
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Confiança deve estar entre 0 e 100',
        },
        {
          status: 400,
        },
      )
    }

    await ensureTable()

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
        requires_user_action
      )
      VALUES (
        ${id},
        ${title},
        ${source},
        ${category},
        ${Number(
          value.toFixed(2),
        )},
        ${confidenceValue},
        'new',
        ${url ?? null},
        ${Boolean(
          requiresSignup ?? true,
        )},
        ${Boolean(
          requiresUserAction ?? true,
        )}
      )
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        source = EXCLUDED.source,
        category = EXCLUDED.category,
        estimated_value =
          EXCLUDED.estimated_value,
        confidence =
          EXCLUDED.confidence,
        url = EXCLUDED.url,
        requires_signup =
          EXCLUDED.requires_signup,
        requires_user_action =
          EXCLUDED.requires_user_action
      RETURNING
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
    `

    return NextResponse.json({
      success: true,
      inserted: true,
      opportunity:
        result.length > 0
          ? normalizeOpportunity(
              result[0],
            )
          : null,
    })
  } catch (error) {
    console.error(
      'Erro ao registrar oportunidade:',
      error,
    )

    return NextResponse.json(
      {
        success: false,
        error:
          'Erro ao registrar oportunidade',
      },
      {
        status: 500,
      },
    )
  }
}
