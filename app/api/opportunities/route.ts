import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/*
 * API DE OPORTUNIDADES
 *
 * Esta API NÃO considera oportunidade como dinheiro recebido.
 * O valor é apenas uma estimativa.
 *
 * O saldo financeiro continua sendo controlado
 * exclusivamente pela API /api/earnings.
 */

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

    const rows = await sql`
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

    const opportunities = rows.map((row) => ({
      id: row.id,
      title: row.title,
      source: row.source,
      category: row.category,
      estimatedValue: Number(row.estimated_value ?? 0),
      confidence: Number(row.confidence ?? 0),
      status: row.status,
      discoveredAt: row.discovered_at,
      createdAt: row.created_at,
    }))

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
        error: 'Erro ao consultar oportunidades',
      },
      {
        status: 500,
      },
    )
  }
}

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
      Number(estimatedValue ?? 0)

    const confidenceValue =
      Number(confidence ?? 0)

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

    const result = await sql`
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
        ${Number(value.toFixed(2))},
        ${confidenceValue},
        'new'
      )
      ON CONFLICT (id) DO NOTHING
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
      inserted: result.length > 0,
      opportunity:
        result.length > 0
          ? {
              id: result[0].id,
              title: result[0].title,
              source: result[0].source,
              category:
                result[0].category,
              estimatedValue:
                Number(
                  result[0]
                    .estimated_value ??
                    0,
                ),
              confidence:
                Number(
                  result[0]
                    .confidence ??
                    0,
                ),
              status:
                result[0].status,
              discoveredAt:
                result[0]
                  .discovered_at,
              createdAt:
                result[0].created_at,
            }
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
