import { NextResponse } from 'next/server'
import { chromium } from 'playwright-core'
import Browserbase from '@browserbasehq/sdk'

import { sql } from '@/lib/db'

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
  requires_signup: boolean
  requires_user_action: boolean
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
  /*
   * A URL é obrigatória.
   */

  if (
    !opportunity.url ||
    !isValidUrl(
      opportunity.url,
    )
  ) {
    await sql`
      UPDATE opportunities
      SET
        status = 'pending'
      WHERE id = ${opportunity.id}
    `

    return {
      success: false,
      state: 'pending',
      reason:
        'A oportunidade não possui uma URL válida.',
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
    throw new Error(
      'BROWSERBASE_API_KEY não configurada na Vercel.',
    )
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

  const session =
    await bb.sessions.create({
      timeout: 60,

      userMetadata: {
        opportunityId:
          opportunity.id,

        category:
          opportunity.category,

        worker:
          'gerente-de-renda',
      },
    })

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
        0

    await sql`
      UPDATE opportunities
      SET
        status = 'pending'
      WHERE id = ${opportunity.id}
    `

    return {
      success: true,

      state: 'pending',

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

      nextAction:
        requiresHuman
          ? 'Aguardando ação do usuário na fonte oficial.'
          : 'Página analisada. A execução externa ainda precisa de confirmação oficial.',
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
  try {
    /*
     * ======================================
     * SEGURANÇA CRON
     * ======================================
     */

    const cronSecret =
      process.env.CRON_SECRET

    if (cronSecret) {
      const authorization =
        request.headers.get(
          'authorization',
        )

      if (
        authorization !==
        `Bearer ${cronSecret}`
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Não autorizado.',
          },
          {
            status: 401,
          },
        )
      }
    }

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
      })
    }

    /*
     * ======================================
     * MODO BROWSERBASE
     * ======================================
     */

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
