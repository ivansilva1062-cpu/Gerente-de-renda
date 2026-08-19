import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/*
 * API DE OPORTUNIDADES
 *
 * Esta API:
 * - cria a tabela automaticamente
 * - cadastra fontes reais de renda como oportunidades
 * - não inventa dinheiro recebido
 * - não altera o saldo financeiro
 *
 * O saldo continua sendo controlado somente por:
 * /api/earnings
 */

type OpportunityRow = {
  id: string
  title: string
  source: string
  category: string
  estimated_value: number | string
  confidence: number | string
  status: string
  discovered_at: string
  created_at: string
}

/*
 * FONTES INICIAIS
 *
 * O valor é 0 porque ainda não existe
 * uma tarefa/pagamento confirmado.
 *
 * Isso serve para o sistema começar
 * a trabalhar com fontes reais sem
 * fabricar ganhos.
 */
const seedOpportunities = [
  {
    id: 'source-prolific',
    title: 'Prolific — estudos pagos',
    source: 'Prolific',
    category: 'surveys',
    estimatedValue: 0,
    confidence: 95,
  },
  {
    id: 'source-usertesting',
    title: 'UserTesting — testes de sites e aplicativos',
    source: 'UserTesting',
    category: 'testing',
    estimatedValue: 0,
    confidence: 95,
  },
  {
    id: 'source-clickworker',
    title: 'Clickworker — microtarefas',
    source: 'Clickworker',
    category: 'microtasks',
    estimatedValue: 0,
    confidence: 95,
  },
  {
    id: 'source-fiverr',
    title: 'Fiverr — vender serviços',
    source: 'Fiverr',
    category: 'freelance',
    estimatedValue: 0,
    confidence: 95,
  },
]

/*
 * GARANTE QUE A TABELA EXISTE
 */
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
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

/*
 * CADASTRA AS FONTES INICIAIS
 *
 * ON CONFLICT impede duplicação.
 */
async function seedSources() {
  for (const opportunity of seedOpportunities) {
    await sql`
      INSERT INTO opportunities (
        id,
        title,
        source,
        category,
        estimated_value,
        confidence,
        status
      )
      VALUES (
        ${opportunity.id},
        ${opportunity.title},
        ${opportunity.source},
        ${opportunity.category},
        ${opportunity.estimatedValue},
        ${opportunity.confidence},
        'new'
      )
      ON CONFLICT (id) DO NOTHING
    `
  }
}

/*
 * CONVERTE UMA LINHA DO BANCO
 * PARA O FORMATO USADO PELO FRONT-END.
 */
function normalizeOpportunity(
  row: OpportunityRow,
) {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    category: row.category,
    estimatedValue: Number(
      row.estimated_value ?? 0,
    ),
    confidence: Number(
      row.confidence ?? 0,
    ),
    status: row.status,
    discoveredAt: row.discovered_at,
    createdAt: row.created_at,
  }
}

/*
 * GET
 *
 * Consulta as oportunidades.
 */
export async function GET() {
  try {
    await ensureTable()
    await seedSources()

    const rows =
      await sql<OpportunityRow[]>`
        SELECT
          id,
          title,
          source,
          category,
          estimated_value,
          confidence,
          status,
          discovered_at,
          created_at
        FROM opportunities
        ORDER BY discovered_at DESC
        LIMIT 100
      `

    const opportunities =
      rows.map(
        normalizeOpportunity,
      )

    return NextResponse.json({
      success: true,
      opportunities,
      total:
        opportunities.length,
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
 * Permite registrar uma nova oportunidade
 * no banco.
 *
 * IMPORTANTE:
 * registrar uma oportunidade NÃO significa
 * que o dinheiro foi recebido.
 */
export async function POST(
  request: Request,
) {
  try {
    await ensureTable()

    const body =
      await request.json()

    const {
      id,
      title,
      source,
      category,
      estimatedValue,
      confidence,
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

    const result =
      await sql<OpportunityRow[]>`
        INSERT INTO opportunities (
          id,
          title,
          source,
          category,
          estimated_value,
          confidence,
          status
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
          'new'
        )
        ON CONFLICT (id)
        DO NOTHING
        RETURNING
          id,
          title,
          source,
          category,
          estimated_value,
          confidence,
          status,
          discovered_at,
          created_at
      `

    return NextResponse.json({
      success: true,
      inserted:
        result.length > 0,
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
