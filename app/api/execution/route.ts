import { NextResponse } from 'next/server'
import { chromium } from 'playwright-core'
import Browserbase from '@browserbasehq/sdk'

import { sql } from '@/lib/db'
import { assessOpportunity, type OpportunityInput } from '@/lib/manager-modules'
import { decideManagerAction } from '@/lib/manager-decision'
import {
  createExecution,
  isSensitiveAction,
  transitionExecution,
  type ExecutionRecord,
} from '@/lib/execution-engine'
import { persistExecution } from '@/lib/execution-store'
import { requestHasActiveSession } from '@/lib/auth-server'

type OpportunityRow = OpportunityInput & { id: string }

async function getOpportunity(opportunityId: string) {
  const rows = await sql`
    SELECT id, title, url, description, source, category, confidence, estimated_value
    FROM opportunities
    WHERE id = ${opportunityId}
    LIMIT 1
  `
  const row = rows[0] as Record<string, unknown> | undefined
  if (!row) return null

  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    url: String(row.url ?? ''),
    description: String(row.description ?? ''),
    source: String(row.source ?? ''),
    category: String(row.category ?? ''),
    confidence: Number(row.confidence ?? 0),
    estimatedValue: Number(row.estimated_value ?? 0),
  } satisfies OpportunityRow
}

async function executeSafePage(execution: ExecutionRecord) {
  const apiKey = process.env.BROWSERBASE_API_KEY
  if (!apiKey) {
    return transitionExecution(execution, 'failed', {
      error: 'BROWSERBASE_API_KEY não configurada; nenhuma ação externa foi executada.',
    })
  }

  const url = execution.opportunity.url
  if (!url || !/^https?:\/\//i.test(url)) {
    return transitionExecution(execution, 'failed', {
      error: 'A oportunidade não possui uma URL HTTP(S) válida.',
    })
  }

  const browserbase = new Browserbase({ apiKey })
  const session = await browserbase.sessions.create()
  const browser = await chromium.connectOverCDP(session.connectUrl)

  try {
    const context = browser.contexts()[0]
    if (!context) throw new Error('Browserbase não retornou um contexto de navegador.')

    const page = context.pages()[0] ?? await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    const pageText = (await page.locator('body').innerText({ timeout: 10_000 })).slice(0, 12_000)

    if (isSensitiveAction(pageText)) {
      return transitionExecution(execution, 'waiting_human', {
        intervention: {
          required: true,
          reason: 'A página oficial apresentou uma etapa de login, identidade, credencial, pagamento ou outra ação sensível.',
          action: 'A pessoa responsável deve executar ou autorizar essa etapa na fonte oficial. O agente parou antes de interagir com ela.',
          url: page.url(),
        },
      })
    }

    return transitionExecution(execution, 'completed', {
      evidence: `Página oficial acessada e preparada sem autenticação ou envio de dados: ${await page.title()}`,
    })
  } catch (error) {
    return transitionExecution(execution, 'failed', {
      error: error instanceof Error ? error.message : 'Falha desconhecida ao executar ação segura.',
    })
  } finally {
    await browser.close()
  }
}

export async function POST(request: Request) {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }
  try {
    const body = (await request.json()) as { opportunityId?: string } & Partial<OpportunityInput>
    const opportunity = body.opportunityId
      ? await getOpportunity(body.opportunityId)
      : {
          id: `inline-${Date.now()}`,
          title: String(body.title ?? ''),
          url: String(body.url ?? ''),
          description: body.description,
          source: body.source,
          category: body.category,
          confidence: Number(body.confidence ?? 0),
          estimatedValue: Number(body.estimatedValue ?? 0),
          actionRequired: body.actionRequired,
        }

    if (!opportunity) {
      return NextResponse.json({ success: false, error: 'Oportunidade não encontrada.' }, { status: 404 })
    }

    const assessment = assessOpportunity(opportunity)
    const decision = decideManagerAction(assessment.modules, {
      score: assessment.score,
      priority: assessment.priority,
    })
    let execution = createExecution({
      id: `execution-${opportunity.id}`,
      opportunity,
      modules: assessment.modules,
      decision,
    })

    await persistExecution(execution)
    if (execution.state === 'queued') {
      execution = transitionExecution(execution, 'running')
      await persistExecution(execution)
      execution = await executeSafePage(execution)
      await persistExecution(execution)
    }

    return NextResponse.json({
      success: execution.state !== 'failed',
      execution,
      financial: {
        estimatedValue: Number(opportunity.estimatedValue ?? 0),
        moneyConfirmed: false,
        paymentRegistered: false,
        confirmationRoute: '/api/earnings',
      },
    }, { status: execution.state === 'failed' ? 500 : 200 })
  } catch (error) {
    console.error('Erro no motor de execução:', error)
    return NextResponse.json({ success: false, error: 'Não foi possível executar a oportunidade.' }, { status: 500 })
  }
}
