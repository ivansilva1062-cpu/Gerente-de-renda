import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS earnings (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        source TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `

    const rows = await sql`
      SELECT
        id,
        description,
        source,
        amount,
        created_at
      FROM earnings
      ORDER BY created_at DESC
      LIMIT 100
    `

    const total = await sql`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM earnings
    `

    return NextResponse.json({
      earnings: rows,
      total: Number(total[0]?.total ?? 0),
    })
  } catch (error) {
    console.error('Erro ao consultar ganhos:', error)

    return NextResponse.json(
      { error: 'Erro ao consultar ganhos' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      id,
      description,
      source,
      amount,
    } = body

    if (
      !id ||
      !description ||
      !source ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0
    ) {
      return NextResponse.json(
        { error: 'Dados de pagamento inválidos' },
        { status: 400 },
      )
    }

    const value = Number(Number(amount).toFixed(2))

    await sql`
      CREATE TABLE IF NOT EXISTS earnings (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        source TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `

    const result = await sql`
      INSERT INTO earnings (
        id,
        description,
        source,
        amount
      )
      VALUES (
        ${id},
        ${description},
        ${source},
        ${value}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING
        id,
        description,
        source,
        amount,
        created_at
    `

    return NextResponse.json({
      success: true,
      inserted: result.length > 0,
      earning: result[0] ?? null,
    })
  } catch (error) {
    console.error('Erro ao registrar ganho:', error)

    return NextResponse.json(
      { error: 'Erro ao registrar ganho' },
      { status: 500 },
    )
  }
}
