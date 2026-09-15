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

async function latestCandidate() {
  try {
    const result = await sql`
      SELECT
        title,
        url,
        description,
        source,
        estimated_value
      FROM opportunities
      WHERE title IS NOT NULL
        AND url IS NOT NULL
      ORDER BY manager_blocked ASC, manager_score DESC, confidence DESC, estimated_value DESC, created_at DESC NULLS LAST
      LIMIT 20
    `

    return result
      .map((row) => ({
        title: String(row.title ?? ''),
        url: String(row.url ?? ''),
        description: String(row.description ?? ''),
        source: String(row.source ?? ''),
        estimatedValue: Number(row.estimated_value ?? 0),
      }))
      .map((candidate) => ({ candidate, assessment: assessOpportunity(candidate) }))
      .sort((left, right) => right.assessment.score - left.assessment.score)
      .at(0)?.candidate ?? null
  } catch (error) {
    console.error('Erro ao consultar candidata do gerente:', error)
    return null
  }
}

function orchestrate(candidate: OpportunityInput | null) {
  if (!candidate) {
    return {
      candidate: null,
      modules: [],
      assessment: null,
      decision: null,
      pipeline,
      message: 'Não há candidata real disponível no momento; o Radar deve continuar pesquisando.',
    }
  }

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