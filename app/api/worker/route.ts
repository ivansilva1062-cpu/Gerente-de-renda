import { NextResponse } from 'next/server'
import { chromium } from 'playwright-core'
import Browserbase from '@browserbasehq/sdk'

import { sql } from '@/lib/db'
import { executionNextStep, planManagerExecution } from '@/lib/manager-execution'
import {
  createExecution,
  isSensitiveAction,
  sensitiveActionReason,
  transitionExecution,
} from '@/lib/execution-engine'
import { persistExecution } from '@/lib/execution-store'
import { requestHasActiveSession } from '@/lib/auth-server'
import { isAuthorizedWorkerRequest } from '@/lib/worker-auth'
import { runWorkerCycle } from '@/lib/worker-cycle'

/*
 * ==========================================
 * WORKER DO GERENTE DE RENDA
 * ==========================================
 *
 * O Worker agora possui duas funções:
 *
 * 1. Sem opportunityId:
 *    - aciona o radar normalmente.
 *
 * 2. Com opportunityId:
 *    - busca a oportunidade no banco;
 *    - abre a página oficial usando Browserbase;
 *    - analisa a página;
 *    - identifica se existe ação humana;
 *    - NÃO envia cadastro;
 *    - NÃO informa senha;
 *    - NÃO envia cartão;
 *    - NÃO confirma pagamento;
 *    - NÃO inventa conclusão.
 *
 * O Browserbase serve como navegador remoto.
 *
 * O dinheiro verdadeiro continua exclusivamente
 * em /api/earnings.
 */

type OpportunityRow = {
  id: string
  title: string
  source: string
  category: string
  estimated_value: number | string
  confidence: number | string
  status: string
  url: string | null
  description?: string
  action_required?: string
  requires_signup: boolean
  requires_user_action: boolean
}

function getAuthorizedProfile() {
  const name = process.env.OPERATOR_NAME?.trim()
  const email = process.env.OPERATOR_EMAIL?.trim()
  const phone = process.env.OPERATOR_PHONE?.trim()
  const street = process.env.OPERATOR_ADDRESS_STREET?.trim()
  const number = process.env.OPERATOR_ADDRESS_NUMBER?.trim()
  const city = process.env.OPERATOR_ADDRESS_CITY?.trim()
  const state = process.env.OPERATOR_ADDRESS_STATE?.trim()
  const zip = process.env.OPERATOR_ADDRESS_ZIP?.trim()
  const country = process.env.OPERATOR_ADDRESS_COUNTRY?.trim() || 'BR'

  if (!name && !email && !phone && !street && !city && !zip) {
    return null
  }

  return {
    name,
    email,
    phone,
    street,
    number,
    city,
    state,
    zip,
    country,
  }
}

async function getReusableBrowserSession(browserbase: Browserbase) {
  const sessionId = process.env.BROWSERBASE_SESSION_ID
  if (!sessionId) {
    return browserbase.sessions.create()
  }

  const sessionsApi = (browserbase.sessions as unknown as { retrieve?: (id: string) => Promise<{ connectUrl: string; id: string }> })
  if (typeof sessionsApi.retrieve === 'function') {
    try {
      return await sessionsApi.retrieve(sessionId)
    } catch {
      return browserbase.sessions.create()
    }
  }

  return browserbase.sessions.create()
}

type AuthorizedFormData = Record<string, string | undefined>

async function autoFillAuthorizedForm(page: { evaluate: (fn: (data: AuthorizedFormData) => void, data?: AuthorizedFormData) => Promise<unknown> }, profile: ReturnType<typeof getAuthorizedProfile>) {
  if (!profile) return

  const fillable = {
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    street: profile.street,
    number: profile.number,
    city: profile.city,
    state: profile.state,
    zip: profile.zip,
    country: profile.country,
  }

  await page.evaluate((data) => {
    const fill = (selector: string, value?: string) => {
      if (!value) return false
      const input = document.querySelector(selector) as HTMLInputElement | null
      if (!input) return false
      if (input.value && input.value.trim()) return false
      if (input.type === 'password' || input.type === 'hidden' || input.type === 'file') return false
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }

    const selectors = [
      ['input[name*=name], input[id*=name], input[autocomplete=name], input[autocomplete=given-name], input[autocomplete=family-name]', data.name],
      ['input[type=email], input[name*=email], input[id*=email], input[autocomplete=email]', data.email],
      ['input[type=tel], input[name*=phone], input[id*=phone], input[autocomplete=tel]', data.phone],
      ['input[name*=street], input[id*=street], input[autocomplete=street-address], input[aria-label*=rua], input[aria-label*=endereço]', data.street],
      ['input[name*=number], input[id*=number], input[autocomplete=address-line2]', data.number],
      ['input[name*=city], input[id*=city], input[autocomplete=address-level2]', data.city],
      ['input[name*=state], input[id*=state], input[autocomplete=address-level1]', data.state],
      ['input[name*=zip], input[id*=zip], input[name*=cep], input[id*=cep], input[autocomplete=postal-code]', data.zip],
      ['input[name*=country], input[id*=country], input[autocomplete=country]', data.country],
    ] as const

    for (const [selector, value] of selectors) {
      if (value) fill(selector, value)
    }
  }, fillable)
}

async function ensureManagerColumns() {
  await sql`
    ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS manager_score INTEGER
    NOT NULL DEFAULT 0
  `

  await sql`
    ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS manager_priority TEXT
    NOT NULL DEFAULT 'low'
  `

  await sql`
    ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS manager_blocked BOOLEAN
    NOT NULL DEFAULT FALSE
  `
}

/*
 * ==========================================
 * SINAIS DE AÇÃO HUMANA
 * ==========================================
 */

const HUMAN_ACTION_SIGNALS = [
  'sign in',
  'log in',
  'login',
  'sign up',
  'signup',
  'register',
  'create account',
  'create an account',
  'verify your identity',
  'identity verification',
  'verify your email',
  'upload your id',
  'apply now',
  'submit application',
  'complete your profile',
  'take the test',
  'complete the test',
  'complete the survey',
  'participate in the study',
  'accept the task',
  'claim task',
]

/*
 * ==========================================
 * SINAIS DE PAGAMENTO
 * ==========================================
 */

const PAYMENT_SIGNALS = [
  'paid',
  'payment',
  'pays',
  'reward',
  'rewards',
  'compensation',
  'per task',
  'per study',
  'per test',
  'per survey',
]

/*
 * ==========================================
 * NORMALIZAÇÃO
 * ==========================================
 */

function normalizeText(
  value: string,
) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/*
 * ==========================================
 * VERIFICA URL
 * ==========================================
 */

function isValidUrl(
  value: string,
) {
  try {
    const url =
      new URL(value)

    return (
      url.protocol ===
        'http:' ||
      url.protocol ===
        'https:'
    )
  } catch {
    return false
  }
}

/*
 * ==========================================
 * ANALISA TEXTO DA PÁGINA
 * ==========================================
 */

function findSignals(
  text: string,
  signals: string[],
) {
  const normalized =
    normalizeText(text)

  return signals.filter(
    (signal) =>
      normalized.includes(
        signal,
      ),
  )
}

/*
 * ==========================================
 * RADAR
 * ==========================================
 */

async function runDiscovery(
  request: Request,
) {
  const url =
    new URL(request.url)

  const discoverUrl =
    `${url.origin}/api/discover`

  const response =
    await fetch(
      discoverUrl,
      {
        method: 'GET',
        cache: 'no-store',
        headers: {
          ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') as string } : {}),
          ...(process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {}),
        },
      },
    )

  const data =
    await response.json()

  if (!response.ok) {
    throw new Error(
      'O radar não conseguiu executar.',
    )
  }

  return data
}

async function getCycleCandidates() {
  const rows = await sql`
    SELECT id, title, source, category, description, action_required,
      estimated_value, confidence, status, url, requires_signup, requires_user_action
    FROM opportunities
    WHERE status IN ('new', 'queued')
      AND title IS NOT NULL
      AND url IS NOT NULL
    ORDER BY manager_blocked ASC, manager_score DESC, confidence DESC, estimated_value DESC, created_at DESC NULLS LAST
    LIMIT 12
  `
  return rows as OpportunityRow[]
}

async function getExcludedExecutionIds() {
  try {
    const rows = await sql`
      SELECT opportunity_id
      FROM execution_runs
      WHERE state IN ('queued', 'running', 'waiting_human', 'completed', 'blocked')
        AND opportunity_id IS NOT NULL
    `
    return rows.map((row) => String(row.opportunity_id))
  } catch {
    return []
  }
}

async function runContinuousCycle() {
  await ensureManagerColumns()
  const rows = await getCycleCandidates()
  const excludedIds = await getExcludedExecutionIds()
  const candidates = rows.map((row) => ({
    ...row,
    url: row.url ?? '',
    description: row.description ?? '',
    estimatedValue: Number(row.estimated_value ?? 0),
    confidence: Number(row.confidence ?? 0),
    actionRequired: row.action_required ?? (row.requires_signup ? 'Cadastro necessário' : undefined),
    managerScore: 0,
  }))

  const eligibleCandidates = [] as typeof candidates
  for (const candidate of candidates) {
    const plan = planManagerExecution(candidate)
    if (plan.execution.state === 'blocked') {
      await sql`
        UPDATE opportunities
        SET status = 'pending',
            manager_score = ${plan.assessment.score},
            manager_priority = ${plan.assessment.priority},
            manager_blocked = TRUE
        WHERE id = ${candidate.id}
      `
      continue
    }
    eligibleCandidates.push(candidate)
  }

  return runWorkerCycle(
    eligibleCandidates,
    excludedIds,
    async (candidate) => {
      const result = await inspectOpportunity(candidate)
      return {
        id: candidate.id,
        state: result.state,
        error: result.execution?.error,
      }
    },
    3,
  )
}

/*
 * ==========================================
 * BUSCA OPORTUNIDADE
 * ==========================================
 */

async function getOpportunity(
  opportunityId: string,
) {
  const rows =
    await sql`
      SELECT
        id,
        title,
        source,
        category,
        description,
        action_required,
        estimated_value,
        confidence,
        status,
        url,
        requires_signup,
        requires_user_action
      FROM opportunities
      WHERE id = ${opportunityId}
      LIMIT 1
    `

  return (
    rows[0] as
      | OpportunityRow
      | undefined
  )
}

/*
 * ==========================================
 * BROWSERBASE
 * ==========================================
 */

async function inspectOpportunity(
  opportunity: OpportunityRow,
) {
  const executionOpportunity = {
    title: opportunity.title,
    url: opportunity.url ?? '',
    description: opportunity.description ?? `${opportunity.source} ${opportunity.category}`,
    actionRequired: opportunity.action_required ?? (opportunity.requires_signup ? 'Cadastro necessário' : undefined),
    estimatedValue: Number(opportunity.estimated_value ?? 0),
    confidence: Number(opportunity.confidence ?? 0),
    category: opportunity.category,
    source: opportunity.source,
  }
  const plan = planManagerExecution({ ...executionOpportunity, id: opportunity.id })
  const { assessment, decision: managerDecision } = plan
  let execution = plan.execution

  await persistExecution(execution)

  if (execution.state !== 'queued') {
    await sql`
      UPDATE opportunities
      SET
        status = 'pending',
        manager_score = ${assessment.score},
        manager_priority = ${assessment.priority},
        manager_blocked = ${execution.state === 'blocked'}
      WHERE id = ${opportunity.id}
    `

    return {
      success: execution.state === 'waiting_human',
      state: execution.state,
      reason: assessment.summary,
      assessment,
      managerDecision,
      execution,
      nextAction: executionNextStep(execution),
    }
  }

  /*
   * A URL é obrigatória.
   */

  if (
    !opportunity.url ||
    !isValidUrl(
      opportunity.url,
    )
  ) {
    execution = transitionExecution(execution, 'failed', {
      error: 'A oportunidade não possui uma URL válida.',
    })
    await persistExecution(execution)

    return {
      success: false,
      state: execution.state,
      reason: execution.error,
      execution,
    }
  }

  /*
   * ========================================
   * VERIFICA CREDENCIAIS
   * ========================================
   */

  const apiKey =
    process.env
      .BROWSERBASE_API_KEY

  if (!apiKey) {
    execution = transitionExecution(execution, 'running')
    execution = transitionExecution(execution, 'failed', {
      error: 'BROWSERBASE_API_KEY não configurada; nenhuma ação externa foi executada.',
    })
    await persistExecution(execution)

    return {
      success: false,
      state: execution.state,
      reason: execution.error,
      execution,
    }
  }

  /*
   * ========================================
   * CRIA SESSÃO
   * ========================================
   *
   * Mantemos a sessão curta.
   *
   * Isso é importante porque o plano Free
   * possui limite de uso de navegador.
   */

  const bb =
    new Browserbase({
      apiKey,
    })

  const session = await getReusableBrowserSession(bb)

  execution = transitionExecution(execution, 'running')
  await persistExecution(execution)

  let browser:
    Awaited<
      ReturnType<
        typeof chromium.connectOverCDP
      >
    > | null = null

  try {
    /*
     * ======================================
     * CONECTA AO NAVEGADOR
     * ======================================
     */

    browser =
      await chromium.connectOverCDP(
        session.connectUrl,
      )

    const context =
      browser.contexts()[0]

    if (!context) {
      throw new Error(
        'Browserbase não retornou um contexto de navegador.',
      )
    }

    const existingPages =
      context.pages()

    const page =
      existingPages[0] ??
      (await context.newPage())

    /*
     * ======================================
     * ABRE A FONTE
     * ======================================
     */

    await page.goto(
      opportunity.url,
      {
        waitUntil:
          'domcontentloaded',

        timeout:
          30_000,
      },
    )

    const authorizedProfile = getAuthorizedProfile()
    if (authorizedProfile) {
      await autoFillAuthorizedForm(page, authorizedProfile)
    }

    /*
     * Pequena espera para conteúdo
     * inicial da página.
     */

    await page.waitForTimeout(
      1000,
    )

    /*
     * ======================================
     * LÊ A PÁGINA
     * ======================================
     */

    const pageTitle =
      await page.title()

    const pageText =
      await page.locator(
        'body',
      ).innerText({
        timeout:
          10_000,
      })

    const cleanedText =
      normalizeText(
        pageText,
      ).slice(
        0,
        12_000,
      )

    /*
     * ======================================
     * IDENTIFICA AÇÃO HUMANA
     * ======================================
     */

    const humanSignals =
      findSignals(
        cleanedText,
        HUMAN_ACTION_SIGNALS,
      )

    /*
     * ======================================
     * IDENTIFICA PAGAMENTO
     * ======================================
     */

    const paymentSignals =
      findSignals(
        cleanedText,
        PAYMENT_SIGNALS,
      )

    /*
     * ======================================
     * NÃO EXECUTA AÇÃO SENSÍVEL
     * ======================================
     *
     * Mesmo que exista um botão:
     *
     * - não clica em cadastro;
     * - não envia formulário;
     * - não informa identidade;
     * - não informa senha;
     * - não informa cartão;
     * - não confirma pagamento.
     */

    const requiresHuman =
      opportunity.requires_user_action ||
      opportunity.requires_signup ||
      humanSignals.length >
        0 ||
      paymentSignals.length > 0 ||
      isSensitiveAction(cleanedText)
    const finalManagerDecision = decideManagerAction(
      assessment.modules,
      {
        score: assessment.score,
        priority: assessment.priority,
        humanActionRequired:
          requiresHuman || paymentSignals.length > 0,
      },
    )

    const sensitiveReason = requiresHuman
      ? sensitiveActionReason({
          title: opportunity.title,
          description: `${cleanedText} ${paymentSignals.join(' ')}`,
          actionRequired: opportunity.action_required,
        }) ?? 'A fonte oficial exige uma intervenção humana antes da próxima etapa.'
      : undefined

    execution = requiresHuman
      ? transitionExecution(execution, 'waiting_human', {
          intervention: {
            required: true,
            reason: sensitiveReason,
            action: 'Abra a fonte oficial, revise a etapa indicada e execute ou autorize somente o que você decidir. O agente não clicou, não enviou dados e não confirmou pagamento.',
            url: page.url(),
          },
        })
      : transitionExecution(execution, 'completed', {
          evidence: `Página oficial acessada e preparada sem autenticação, envio de dados ou confirmação financeira: ${pageTitle}`,
        })

    await persistExecution(execution)

    await sql`
      UPDATE opportunities
      SET status = 'pending'
      WHERE id = ${opportunity.id}
    `

    return {
      success: execution.state !== 'failed',

      state: execution.state,

      opportunity: {
        id:
          opportunity.id,

        title:
          opportunity.title,

        source:
          opportunity.source,

        url:
          opportunity.url,
      },

      browser: {
        active: true,

        sessionId:
          session.id,

        inspected: true,
      },

      page: {
        title:
          pageTitle,

        url:
          page.url(),

        humanActionRequired:
          requiresHuman,

        humanSignals,

        paymentSignals,
      },

      financial: {
        estimatedValue:
          Number(
            opportunity.estimated_value ??
              0,
          ),

        moneyConfirmed:
          false,

        paymentRegistered:
          false,
      },

      manager: assessment,

      managerDecision: finalManagerDecision,

      execution,

      nextAction:
        executionNextStep(execution),
    }
  } finally {
    /*
     * Fecha o navegador.
     */

    if (browser) {
      await browser.close()
    }
  }
}

/*
 * ==========================================
 * GET
 * ==========================================
 */

export async function GET(
  request: Request,
) {
  const sessionActive = await requestHasActiveSession()
  const cronSecret = process.env.CRON_SECRET
  const authorized = isAuthorizedWorkerRequest({
    authorization: request.headers.get('authorization'),
    cronSecret,
    sessionActive,
  })

  if (!authorized) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }
  try {
    /*
     * ======================================
     * SEGURANÇA CRON
     * ======================================
     */

    const url =
      new URL(request.url)

    const opportunityId =
      url.searchParams.get(
        'opportunityId',
      )

    /*
     * ======================================
     * MODO RADAR
     * ======================================
     *
     * Sem oportunidade específica:
     * somente executa a descoberta.
     */

    if (!opportunityId) {
      const radar =
        await runDiscovery(
          request,
        )
      const cycle = await runContinuousCycle()

      return NextResponse.json({
        success: true,

        worker: {
          active: true,

          mode:
            'discovery',

          browserbase:
            'ready',

          continuous:
            true,

          goalsStopAgent:
            false,

          onlyManualStop:
            true,

          confirmedEarningsOnly:
            true,
        },

        radar,
        cycle,
      })
    }

    /*
     * ======================================
     * MODO BROWSERBASE
     * ======================================
     */

    await ensureManagerColumns()

    const opportunity =
      await getOpportunity(
        opportunityId,
      )

    if (!opportunity) {
      return NextResponse.json(
        {
          success: false,

          error:
            'Oportunidade não encontrada.',
        },
        {
          status: 404,
        },
      )
    }

    const result =
      await inspectOpportunity(
        opportunity,
      )

    return NextResponse.json(
      {
        success:
          result.success,

        worker: {
          active: true,

          mode:
            'browserbase',

          browserbase:
            'active',

          onlyManualStop:
            true,

          confirmedEarningsOnly:
            true,
        },

        result,
      },
    )
  } catch (error) {
    console.error(
      'Erro no Worker:',
      error,
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Erro interno no Worker.',
      },
      {
        status: 500,
      },
    )
  }
}
