import { NextResponse } from 'next/server'
import { chromium } from 'playwright-core'
import Browserbase from '@browserbasehq/sdk'

import { sql } from '@/lib/db'
import { executionNextStep, planManagerExecution } from '@/lib/manager-execution'
import { decideManagerAction } from '@/lib/manager-decision'
import {
  classifyExecutionState,
  createExecution,
  isSensitiveAction,
  sensitiveActionReason,
  transitionExecution,
} from '@/lib/execution-engine'
import { persistExecution } from '@/lib/execution-store'
import { requestHasActiveSession } from '@/lib/auth-server'
import { isAuthorizedWorkerRequest } from '@/lib/worker-auth'
import { runWorkerCycle, shouldIncludeInCycle } from '@/lib/worker-cycle'
import { upsertNotificationEvent } from '@/lib/notifications'
import { getOperatorProfile } from '@/lib/operator-profile'
import { getStoredOperatorProfile } from '@/lib/profile-store'

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

async function getAuthorizedProfile() {
  const profile = (await getStoredOperatorProfile()) ?? getOperatorProfile()
  const name = profile.fullName
  const email = profile.email
  const phone = profile.phone
  const street = profile.address?.street
  const number = profile.address?.number
  const city = profile.address?.city ?? profile.city
  const state = profile.address?.state
  const zip = profile.address?.zipCode
  const country = profile.address?.country ?? profile.country

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

type EvaluablePage = {
  evaluate: <T>(fn: (data: AuthorizedFormData) => T, data?: AuthorizedFormData) => Promise<T>
}

async function autoFillAuthorizedForm(page: EvaluablePage, profile: Awaited<ReturnType<typeof getAuthorizedProfile>>) {
  if (!profile) return 0

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

  return page.evaluate((data) => {
    let filledCount = 0
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
      if (value && fill(selector, value)) filledCount += 1
    }

    return filledCount
  }, fillable)
}

/*
 * ==========================================
 * DETECTA CAMPOS SENSÍVEIS OU ANTIFRAUDE
 * ==========================================
 *
 * Se a página exigir senha, upload de arquivo,
 * dados de cartão/Pix ou CAPTCHA, o agente NUNCA
 * envia o formulário automaticamente.
 */

async function hasSensitiveFormFields(page: EvaluablePage) {
  return page.evaluate(() => {
    const sensitiveInput = document.querySelector(
      'input[type=password], input[type=file], input[name*=card], input[name*=cvv], input[name*=pix], input[name*=cpf], input[name*=cnpj]',
    )
    const captchaMarkup = document.querySelector(
      '.g-recaptcha, .h-captcha, iframe[src*="captcha"], [data-sitekey]',
    )
    return Boolean(sensitiveInput || captchaMarkup)
  })
}

/*
 * ==========================================
 * ENVIA O FORMULÁRIO JÁ PREENCHIDO
 * ==========================================
 *
 * Só é chamado quando:
 * - existem campos preenchidos com dados já autorizados;
 * - não há campos sensíveis nem CAPTCHA;
 * - a etapa não exige criação de credencial nova.
 */

async function trySubmitAuthorizedForm(page: EvaluablePage) {
  return page.evaluate(() => {
    const submitButton = document.querySelector(
      'button[type=submit], input[type=submit], form button:not([type=button])',
    ) as HTMLElement | null

    if (submitButton) {
      submitButton.click()
      return true
    }

    const form = document.querySelector('form')
    if (form instanceof HTMLFormElement) {
      form.requestSubmit ? form.requestSubmit() : form.submit()
      return true
    }

    return false
  })
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
 *
 * Só entram aqui etapas que o agente NUNCA pode
 * concluir sozinho, independente dos campos da
 * página (identidade/documento real, verificação
 * de e-mail que só o dono da caixa pode confirmar).
 * Login/cadastro NÃO estão aqui: a classificação
 * real depende dos campos encontrados na página
 * (ver hasSensitiveFormFields), não da palavra.
 */

const HUMAN_ACTION_SIGNALS = [
  'verify your identity',
  'identity verification',
  'upload your id',
  'verify your email',
]

/*
 * ==========================================
 * SINAIS DE AÇÃO AUTOMATIZÁVEL
 * ==========================================
 *
 * Estes sinais indicam um formulário ou etapa
 * que o próprio agente pode preencher e enviar
 * usando os dados já autorizados pelo operador,
 * desde que não existam campos sensíveis nem
 * CAPTCHA na página (checagem real, não só a
 * palavra "cadastro"/"sign up"/"login" no texto).
 */

const SOFT_ACTION_SIGNALS = [
  'apply now',
  'submit application',
  'complete your profile',
  'take the test',
  'complete the test',
  'complete the survey',
  'participate in the study',
  'accept the task',
  'claim task',
  'sign in',
  'log in',
  'login',
  'sign up',
  'signup',
  'register',
  'create account',
  'create an account',
  'cadastro',
  'cadastre-se',
]

/*
 * ==========================================
 * SINAIS DE CAPTCHA / ANTIFRAUDE
 * ==========================================
 */

const CAPTCHA_SIGNALS = [
  'captcha',
  'recaptcha',
  'hcaptcha',
  "i'm not a robot",
  'prove you are human',
]

/*
 * ==========================================
 * SINAIS DE ESPERA EXTERNA
 * ==========================================
 *
 * A tarefa já foi enviada/preparada pelo agente,
 * mas depende agora da própria plataforma
 * (revisão, aprovação, processamento), não do usuário.
 */

const EXTERNAL_WAIT_SIGNALS = [
  'application submitted',
  'application received',
  'under review',
  'pending approval',
  'we will contact you',
  'thank you for applying',
  'thank you for your submission',
  'em análise',
  'aguardando aprovação',
  'candidatura enviada',
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

const FINANCIAL_CONFIRMATION_SIGNALS = [
  'password',
  'senha',
  'two-factor',
  '2fa',
  'identity verification',
  'verify your identity',
  'credit card',
  'cartão',
  'pix',
  'bank account',
  'conta bancária',
  'withdraw',
  'saque',
  'payout',
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
  /*
   * O ciclo reprocessa apenas candidatos realmente executáveis:
   * - novas/queued prontas para entrar;
   * - pending com última execução retryável (falha, bloqueio ou espera externa);
   * - nunca waiting_human/completed em loop de execução automática.
   */
  const rows = await sql`
    SELECT o.id, o.title, o.source, o.category, o.description, o.action_required,
      o.estimated_value, o.confidence, o.status, o.url, o.requires_signup, o.requires_user_action,
      le.state AS last_execution_state
    FROM opportunities o
    LEFT JOIN LATERAL (
      SELECT state
      FROM execution_runs er
      WHERE er.opportunity_id = o.id
      ORDER BY er.updated_at DESC
      LIMIT 1
    ) le ON TRUE
    WHERE o.title IS NOT NULL
      AND o.url IS NOT NULL
    ORDER BY o.manager_blocked ASC, o.manager_score DESC, o.confidence DESC, o.estimated_value DESC, o.created_at DESC NULLS LAST
    LIMIT 60
  `

  const rowsWithState = rows as Array<OpportunityRow & { last_execution_state?: string | null }>

  return rowsWithState.filter((row) => shouldIncludeInCycle(row.status, row.last_execution_state)) as OpportunityRow[]
}

async function getExcludedExecutionIds() {
  try {
    /*
     * Exclui apenas quem está em andamento, precisa do usuário ou já
     * terminou de verdade. 'blocked'/'waiting_external'/'failed' NÃO
     * entram aqui: são justamente os estados retryáveis selecionados
     * por getCycleCandidates/shouldIncludeInCycle — excluí-los aqui
     * cancelava a retentativa que aquela função tentava permitir.
     */
    const rows = await sql`
      SELECT opportunity_id
      FROM execution_runs
      WHERE state IN ('queued', 'running', 'waiting_human', 'completed')
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
    actionRequired: row.action_required ?? undefined,
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
    actionRequired: opportunity.action_required ?? undefined,
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
      classification: classifyExecutionState(execution.state),
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

    await sql`
      UPDATE opportunities
      SET status = 'pending'
      WHERE id = ${opportunity.id}
    `

    return {
      success: false,
      state: execution.state,
      classification: classifyExecutionState(execution.state),
      reason: execution.error,
      execution,
      nextAction: executionNextStep(execution),
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

    await sql`
      UPDATE opportunities
      SET status = 'pending'
      WHERE id = ${opportunity.id}
    `

    return {
      success: false,
      state: execution.state,
      classification: classifyExecutionState(execution.state),
      reason: execution.error,
      execution,
      nextAction: executionNextStep(execution),
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

    const authorizedProfile = await getAuthorizedProfile()
    let filledFieldCount = 0
    if (authorizedProfile) {
      filledFieldCount = await autoFillAuthorizedForm(page, authorizedProfile)
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
     * IDENTIFICA AÇÃO AUTOMATIZÁVEL
     * ======================================
     */

    const softSignals = findSignals(cleanedText, SOFT_ACTION_SIGNALS)

    /*
     * ======================================
     * IDENTIFICA CAPTCHA / ANTIFRAUDE
     * ======================================
     */

    const captchaSignals = findSignals(cleanedText, CAPTCHA_SIGNALS)
    const captchaDetected = captchaSignals.length > 0 || (await hasSensitiveFormFields(page))

    /*
     * ======================================
     * IDENTIFICA MENÇÃO DE PAGAMENTO
     * ======================================
     *
     * Apenas informativo: mencionar "pago" ou
     * "recompensa" não exige, por si só,
     * intervenção humana.
     */

    const paymentSignals =
      findSignals(
        cleanedText,
        PAYMENT_SIGNALS,
      )

    const financialConfirmationRequired =
      findSignals(cleanedText, FINANCIAL_CONFIRMATION_SIGNALS).length > 0 ||
      Boolean(opportunity.action_required && isSensitiveAction(opportunity.action_required))

    /*
     * ======================================
     * NÃO EXECUTA AÇÃO SENSÍVEL
     * ======================================
     *
     * Mesmo que exista um botão:
     *
     * - não clica em cadastro;
     * - não envia formulário com senha, cartão, Pix ou identidade;
     * - não contorna CAPTCHA;
     * - não confirma pagamento.
     *
     * IMPORTANTE: requires_signup/requires_user_action são apenas
     * sinais informativos do Radar (baseados em palavras do
     * título/descrição no momento da descoberta). A classificação
     * REAL usa o conteúdo e os campos encontrados na página ao
     * vivo (humanSignals, financialConfirmationRequired,
     * captchaDetected) — nunca a palavra isolada "cadastro"/"apply"
     * capturada antes de a página ser visitada.
     */

    const requiresHuman =
      humanSignals.length > 0 ||
      financialConfirmationRequired ||
      captchaDetected ||
      isSensitiveAction(cleanedText)

    /*
     * ======================================
     * EXECUÇÃO AUTÔNOMA DE ETAPA SEGURA
     * ======================================
     *
     * Quando a etapa não exige credencial, identidade,
     * pagamento ou CAPTCHA, o agente preenche e envia
     * o formulário com os dados já autorizados pelo operador.
     */

    let autoSubmitted = false
    if (!requiresHuman && softSignals.length > 0 && filledFieldCount > 0) {
      autoSubmitted = await trySubmitAuthorizedForm(page)
      if (autoSubmitted) {
        await page.waitForTimeout(1500)
      }
    }

    const postSubmitText = autoSubmitted
      ? normalizeText(await page.locator('body').innerText({ timeout: 10_000 }).catch(() => cleanedText)).slice(0, 12_000)
      : cleanedText

    const awaitingExternalReview =
      autoSubmitted && findSignals(postSubmitText, EXTERNAL_WAIT_SIGNALS).length > 0

    const finalManagerDecision = decideManagerAction(
      assessment.modules,
      {
        score: assessment.score,
        priority: assessment.priority,
        humanActionRequired: requiresHuman,
      },
    )

    const sensitiveReason = requiresHuman
      ? sensitiveActionReason({
          title: opportunity.title,
          description: `${cleanedText} ${paymentSignals.join(' ')}`,
          actionRequired: opportunity.action_required,
        }) ?? 'A fonte oficial exige uma intervenção humana antes da próxima etapa.'
      : undefined

    if (requiresHuman) {
      execution = transitionExecution(execution, 'waiting_human', {
        intervention: {
          required: true,
          reason: sensitiveReason ?? 'A fonte oficial exige uma intervenção humana antes da próxima etapa.',
          action: 'Abra a fonte oficial, revise a etapa indicada e execute ou autorize somente o que você decidir. O agente não clicou, não enviou dados e não confirmou pagamento.',
          url: page.url(),
        },
      })
    } else if (autoSubmitted && awaitingExternalReview) {
      execution = transitionExecution(execution, 'waiting_external', {
        evidence: `Formulário preenchido e enviado automaticamente com os dados já autorizados. A plataforma agora está processando a etapa: ${pageTitle}`,
      })
    } else if (autoSubmitted) {
      execution = transitionExecution(execution, 'completed', {
        evidence: `Formulário preenchido e enviado automaticamente com os dados já autorizados: ${pageTitle}`,
      })
    } else {
      execution = transitionExecution(execution, 'completed', {
        evidence: `Página oficial acessada e preparada sem autenticação, envio de dados ou confirmação financeira: ${pageTitle}`,
      })
    }

    if (requiresHuman) {
      const notificationKind = financialConfirmationRequired
        ? 'financial_confirmation_required'
        : 'human_action'
      const notificationTitle = financialConfirmationRequired
        ? '💳 CONFIRMAÇÃO FINANCEIRA NECESSÁRIA'
        : '⚠️ Sua resposta é necessária'
      const notificationBody = financialConfirmationRequired
        ? `Plataforma: ${opportunity.source}. Valor anunciado: ${Number(opportunity.estimated_value ?? 0)}. Motivo: ${sensitiveReason ?? 'a fonte exige confirmação financeira ou credencial sensível'}. Ação: abra a fonte oficial e confirme somente o que você decidir.`
        : `Oportunidade: ${opportunity.title}. Ação: ${sensitiveReason ?? 'responda a etapa indicada na fonte oficial'}.`

      await upsertNotificationEvent({
        kind: notificationKind,
        ref: `opportunity:${opportunity.id}`,
        title: notificationTitle,
        body: notificationBody,
        source: opportunity.source,
        amount: Number(opportunity.estimated_value ?? 0),
        url: opportunity.url ?? '/pendentes',
        createdAt: new Date().toISOString(),
      })
    } else if (awaitingExternalReview) {
      await upsertNotificationEvent({
        kind: 'blocked_external',
        ref: `opportunity-external:${opportunity.id}`,
        title: '⏳ Aguardando processamento externo',
        body: `Oportunidade: ${opportunity.title}. O agente já enviou a etapa disponível; agora depende exclusivamente do processamento da própria plataforma.`,
        source: opportunity.source,
        amount: Number(opportunity.estimated_value ?? 0),
        url: opportunity.url ?? '/pendentes',
        createdAt: new Date().toISOString(),
      })
    }

    if (!requiresHuman && opportunity.url && opportunity.estimated_value) {
      await upsertNotificationEvent({
        kind: 'opportunity_ready',
        ref: `opportunity-ready:${opportunity.id}`,
        title: '🚀 Oportunidade pronta',
        body: `Oportunidade pronta para execução: ${opportunity.title}. Ainda não é ganho confirmado.`,
        source: opportunity.source,
        amount: Number(opportunity.estimated_value ?? 0),
        url: opportunity.url ?? '/oportunidades',
        createdAt: new Date().toISOString(),
      })
    }

    await persistExecution(execution)

    await sql`
      UPDATE opportunities
      SET status = ${execution.state === 'completed' ? 'done' : 'pending'}
      WHERE id = ${opportunity.id}
    `

    return {
      success: execution.state !== 'failed',

      state: execution.state,

      classification: classifyExecutionState(execution.state),

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

        autoSubmitted,

        awaitingExternalReview,
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Erro ao inspecionar oportunidade.'
    execution = transitionExecution(execution, 'failed', {
      error: detail,
    })
    await persistExecution(execution)

    await upsertNotificationEvent({
      kind: 'error',
      ref: `execution-error:${opportunity.id}`,
      title: '⚠️ Gerente precisa de atenção',
      body: detail,
      source: opportunity.source,
      amount: Number(opportunity.estimated_value ?? 0),
      url: '/pendentes',
      createdAt: new Date().toISOString(),
    })

    await sql`
      UPDATE opportunities
      SET status = 'pending'
      WHERE id = ${opportunity.id}
    `

    return {
      success: false,
      state: execution.state,
      classification: classifyExecutionState(execution.state),
      reason: detail,
      execution,
      nextAction: executionNextStep(execution),
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
