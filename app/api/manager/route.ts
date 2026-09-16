import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { executionNextStep, planManagerExecution, type ManagerExecutionInput } from '@/lib/manager-execution'
import type { OpportunityInput } from '@/lib/manager-modules'

const pipeline = [
  'radar',
  'avaliador',
  'risco',
  'financeiro',
  'publicador',
  'vendedor',
  'entrega',
] as const

async function latestCandidate() {
  try {
    const result = await sql`
      SELECT
          id,
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
          id: String(row.id ?? ''),
          title: String(row.title ?? ''),
          url: String(row.url ?? ''),
          description: String(row.description ?? ''),
          estimatedValue: Number(row.estimated_value ?? 0),
        }
      : null
  } catch (error) {
    console.error('Erro ao consultar candidata do gerente:', error)
    return null
  }
}

function orchestrate(candidate: ManagerExecutionInput | null) {
  if (!candidate) {
    return {
      candidate: null,
      modules: [],
      assessment: null,
      decision: null,
      execution: null,
      nextAction: 'O Radar deve continuar procurando oportunidades reais.',
      pipeline,
      rules: {
        estimatedValuesAreNotEarnings: true,
        onlyConfirmedEarningsAffectBalance: true,
        sensitiveActionsRequireHuman: true,
        pendingTasksBlockAgent: false,
      },
    }
  }

  const plan = planManagerExecution(candidate)

  return {
    candidate,
    modules: plan.modules,
    assessment: plan.assessment,
    decision: plan.decision,
    execution: plan.execution,
    nextAction: executionNextStep(plan.execution),
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
    const candidate: ManagerExecutionInput = {
      id: `inline-${Date.now()}`,
      title: String(body.title ?? ''),
      url: String(body.url ?? ''),
      description: body.description,
      source: body.source,
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