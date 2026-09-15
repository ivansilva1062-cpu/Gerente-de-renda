import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import {
  assessOpportunity,
  runManagerModules,
  type OpportunityInput,
} from '@/lib/manager-modules'
import { decideManagerAction } from '@/lib/manager-decision'

const pipeline = [
  'radar',
  'avaliador',
  'risco',
  'financeiro',
  'publicador',
  'vendedor',
  'entrega',
] as const

const fallbackCandidate: OpportunityInput = {
  title: 'Avaliacao de oportunidade',
  url: 'https://example.com',
  description: 'Trabalho remunerado com envio de tarefa e confirmação de pagamento.',
  estimatedValue: 120,
}

async function latestCandidate() {
  try {
    const result = await sql`
      SELECT
        title,
        url,
        description,
        estimated_value
      FROM opportunities
      WHERE title IS NOT NULL
        AND url IS NOT NULL
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1
    `

    const row = result[0]

    return row
      ? {
          title: String(row.title ?? fallbackCandidate.title),
          url: String(row.url ?? fallbackCandidate.url),
          description: String(row.description ?? ''),
          estimatedValue: Number(row.estimated_value ?? 0),
        }
      : fallbackCandidate
  } catch (error) {
    console.error('Erro ao consultar candidata do gerente:', error)
    return fallbackCandidate
  }
}

function orchestrate(candidate: OpportunityInput) {
  const modules = runManagerModules(candidate)
  const assessment = assessOpportunity(candidate)
  const decision = decideManagerAction(modules, {
    score: assessment.score,
    priority: assessment.priority,
  })

  return {
    candidate,
    modules,
    assessment,
    decision,
    pipeline,
    rules: {
      estimatedValuesAreNotEarnings: true,
      onlyConfirmedEarningsAffectBalance: true,
      sensitiveActionsRequireHuman: true,
      pendingTasksBlockAgent: false,
    },
  }
}

export async function GET() {
  const candidate = await latestCandidate()

  return NextResponse.json({
    success: true,
    manager: orchestrate(candidate),
  })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<OpportunityInput>
    const candidate: OpportunityInput = {
      title: String(body.title ?? ''),
      url: String(body.url ?? ''),
      description: body.description,
      estimatedValue: Number(body.estimatedValue ?? 0),
      category: body.category,
      confidence: Number(body.confidence ?? 0),
    }

    return NextResponse.json({
      success: true,
      manager: orchestrate(candidate),
    })
  } catch (error) {
    console.error('Erro ao orquestrar candidata:', error)

    return NextResponse.json(
      { success: false, error: 'Não foi possível analisar a oportunidade.' },
      { status: 400 },
    )
  }
}