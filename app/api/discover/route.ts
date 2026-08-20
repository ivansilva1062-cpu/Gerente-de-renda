import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { sql } from '@/lib/db'

type TavilyResult = {
  title?: string
  url?: string
  content?: string
  score?: number
}

type TavilyResponse = {
  results?: TavilyResult[]
}

const SEARCHES = [
  {
    query:
      'legitimate paid online opportunities apply now remote microtasks paid work',
    category: 'microtasks',
  },
  {
    query:
      'legitimate paid research studies participant sign up apply online',
    category: 'surveys',
  },
  {
    query:
      'paid website app testing become tester sign up',
    category: 'testing',
  },
  {
    query:
      'remote freelance jobs apply now get paid legitimate',
    category: 'freelance',
  },
  {
    query:
      'content creator monetization programs apply join get paid',
    category: 'content',
  },
  {
    query:
      'affiliate programs join apply become affiliate start earning',
    category: 'affiliate',
  },
]

const ALLOWED_CATEGORIES = [
  'microtasks',
  'freelance',
  'surveys',
  'content',
  'affiliate',
  'testing',
] as const

type Category =
  (typeof ALLOWED_CATEGORIES)[number]

/*
 * ==========================================
 * FILTROS DE CONTEÚDO
 * ==========================================
 */

const CONTENT_BLOCKLIST = [
  'blog',
  'article',
  'articles',
  'guide',
  'guides',
  'how-to',
  'howto',
  'explained',
  'what-is',
  'what-are',
  'best-',
  'best_',
  'top-',
  'top_',
  'tips',
  'learn',
  'news',
  'resources',
  'commission-structures',
  'commission-structure',
  'marketing-guide',
  'case-study',
]

const TITLE_BLOCKLIST = [
  'how do',
  'how to',
  'what is',
  'what are',
  'best ',
  'top ',
  'guide',
  'explained',
  'tips',
  'learn about',
  'everything you need to know',
  'commission structure',
  'commission structures',
  'make money',
  'ways to earn',
  'ultimate guide',
  'comparison',
  'reviews',
  'review of',
]

/*
 * ==========================================
 * SINAIS DE AÇÃO
 * ==========================================
 */

const ACTION_SIGNALS = [
  'apply',
  'apply now',
  'sign up',
  'signup',
  'join',
  'join now',
  'become a partner',
  'become an affiliate',
  'start earning',
  'get paid',
  'earn money',
  'earn',
  'register',
  'create account',
  'create an account',
  'work with us',
  'freelancer',
  'freelance job',
  'remote job',
  'paid study',
  'paid research',
  'become a tester',
  'user tester',
  'testing opportunity',
  'participant',
  'participants',
  'paid survey',
  'paid surveys',
]

/*
 * ==========================================
 * SINAIS DE CADASTRO
 * ==========================================
 */

const SIGNUP_SIGNALS = [
  'sign up',
  'signup',
  'register',
  'registration',
  'create account',
  'create an account',
  'join now',
  'join us',
  'become a member',
  'create your profile',
  'apply now',
]

/*
 * ==========================================
 * SINAIS DE AÇÃO HUMANA
 * ==========================================
 */

const HUMAN_ACTION_SIGNALS = [
  'complete your profile',
  'verify your identity',
  'identity verification',
  'verify your email',
  'upload your id',
  'upload identification',
  'complete registration',
  'submit application',
  'apply now',
  'take the test',
  'complete the test',
  'complete a survey',
  'participate in the study',
  'accept the task',
  'claim task',
  'claim opportunity',
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
  'pay',
  'earn',
  'reward',
  'rewards',
  'cash',
  'usd',
  'dollar',
  'dollars',
  '$',
  'compensation',
  'incentive',
  'per task',
  'per study',
  'per test',
  'per survey',
]

/*
 * ==========================================
 * BANCO
 * ==========================================
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
      url TEXT,
      requires_signup BOOLEAN NOT NULL DEFAULT TRUE,
      requires_user_action BOOLEAN NOT NULL DEFAULT TRUE,
      language TEXT NOT NULL DEFAULT 'global',
      automated_preparation BOOLEAN NOT NULL DEFAULT FALSE,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS language TEXT
    NOT NULL DEFAULT 'global'
  `

  await sql`
    ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS automated_preparation BOOLEAN
    NOT NULL DEFAULT FALSE
  `
}

/*
 * ==========================================
 * UTILITÁRIOS
 * ==========================================
 */

function makeId(url: string) {
  return `tavily-${createHash('sha256')
    .update(url)
    .digest('hex')
    .slice(0, 24)}`
}

function cleanText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
}

function getSource(url: string) {
  try {
    return new URL(url).hostname
      .replace(/^www\./, '')
  } catch {
    return 'Web'
  }
}

function normalizeText(value: string) {
  return cleanText(value)
    .toLowerCase()
}

/*
 * ==========================================
 * FILTRO DE URL
 * ==========================================
 */

function isBlockedUrl(url: string) {
  const normalized =
    normalizeText(url)

  return CONTENT_BLOCKLIST.some(
    (word) =>
      normalized.includes(word),
  )
}

/*
 * ==========================================
 * FILTRO DE TÍTULO
 * ==========================================
 */

function isBlockedTitle(
  title: string,
) {
  const normalized =
    normalizeText(title)

  return TITLE_BLOCKLIST.some(
    (phrase) =>
      normalized.includes(
        phrase,
      ),
  )
}

/*
 * ==========================================
 * SINAL DE AÇÃO
 * ==========================================
 */

function hasActionSignal(
  title: string,
  content: string,
) {
  const text =
    normalizeText(
      `${title} ${content}`,
    )

  return ACTION_SIGNALS.some(
    (signal) =>
      text.includes(signal),
  )
}

/*
 * ==========================================
 * SINAL DE CADASTRO
 * ==========================================
 */

function requiresSignup(
  title: string,
  content: string,
) {
  const text =
    normalizeText(
      `${title} ${content}`,
    )

  return SIGNUP_SIGNALS.some(
    (signal) =>
      text.includes(signal),
  )
}

/*
 * ==========================================
 * SINAL DE AÇÃO HUMANA
 * ==========================================
 */

function requiresHumanAction(
  title: string,
  content: string,
) {
  const text =
    normalizeText(
      `${title} ${content}`,
    )

  return HUMAN_ACTION_SIGNALS.some(
    (signal) =>
      text.includes(signal),
  )
}

/*
 * ==========================================
 * SINAL DE PAGAMENTO
 * ==========================================
 */

function hasPaymentSignal(
  title: string,
  content: string,
) {
  const text =
    normalizeText(
      `${title} ${content}`,
    )

  return PAYMENT_SIGNALS.some(
    (signal) =>
      text.includes(signal),
  )
}

/*
 * ==========================================
 * EXTRAÇÃO DE VALOR
 * ==========================================
 *
 * Só usa valores que aparecem no
 * resultado da própria fonte pesquisada.
 *
 * Não inventa valor.
 */

function extractEstimatedValue(
  title: string,
  content: string,
) {
  const text =
    `${title} ${content}`

  const patterns = [
    /(?:\$|usd\s*)\s?(\d+(?:[.,]\d{1,2})?)/gi,

    /(\d+(?:[.,]\d{1,2})?)\s?(?:usd|us dollars)/gi,

    /(?:pays?|paid|earn|reward|compensation|payment)[^$]{0,40}\$?\s?(\d+(?:[.,]\d{1,2})?)/gi,
  ]

  const values: number[] = []

  for (
    const pattern of patterns
  ) {
    const matches =
      text.matchAll(pattern)

    for (
      const match of matches
    ) {
      const raw =
        match[1]

      if (!raw) {
        continue
      }

      const normalized =
        raw.replace(
          ',',
          '.',
        )

      const value =
        Number(
          normalized,
        )

      if (
        Number.isFinite(
          value,
        ) &&
        value > 0 &&
        value <= 10000
      ) {
        values.push(
          value,
        )
      }
    }
  }

  if (
    values.length === 0
  ) {
    return 0
  }

  /*
   * Usa o maior valor encontrado
   * como estimativa potencial.
   *
   * Continua sendo apenas estimativa.
   */

  return Number(
    Math.max(
      ...values,
    ).toFixed(2),
  )
}

/*
 * ==========================================
 * CONFIANÇA
 * ==========================================
 */

function calculateConfidence(
  score = 0,
  hasAction = false,
  hasPayment = false,
) {
  let value =
    65 +
    Math.min(
      Math.max(
        score,
        0,
      ),
      1,
    ) *
      20

  if (
    hasAction
  ) {
    value += 5
  }

  if (
    hasPayment
  ) {
    value += 5
  }

  return Math.min(
    Math.round(
      value,
    ),
    95,
  )
}

/*
 * ==========================================
 * OPORTUNIDADE REAL
 * ==========================================
 */

function isRealOpportunity(
  result: TavilyResult,
) {
  if (
    !result.url ||
    !result.title
  ) {
    return false
  }

  const url =
    result.url.trim()

  const title =
    cleanText(
      result.title,
    )

  const content =
    cleanText(
      result.content ??
        '',
    )

  if (
    !url.startsWith(
      'http',
    )
  ) {
    return false
  }

  if (
    isBlockedUrl(url)
  ) {
    return false
  }

  if (
    isBlockedTitle(
      title,
    )
  ) {
    return false
  }

  if (
    !hasActionSignal(
      title,
      content,
    )
  ) {
    return false
  }

  return true
}

/*
 * ==========================================
 * TAVILY
 * ==========================================
 */

async function searchTavily(
  query: string,
) {
  const apiKey =
    process.env.TAVILY_API_KEY

  if (!apiKey) {
    throw new Error(
      'TAVILY_API_KEY não configurada no ambiente.',
    )
  }

  const response =
    await fetch(
      'https://api.tavily.com/search',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify({
            api_key:
              apiKey,

            query,

            search_depth:
              'advanced',

            topic:
              'general',

            max_results:
              8,

            include_answer:
              false,

            include_raw_content:
              false,
          }),

        cache:
          'no-store',
      },
    )

  if (
    !response.ok
  ) {
    const text =
      await response.text()

    throw new Error(
      `Tavily respondeu ${response.status}: ${text}`,
    )
  }

  return (
    (await response.json()) as TavilyResponse
  )
}

/*
 * ==========================================
 * SALVAR OPORTUNIDADE
 * ==========================================
 */

async function saveOpportunity(
  result: TavilyResult,
  category: Category,
) {
  if (
    !isRealOpportunity(
      result,
    )
  ) {
    return false
  }

  const url =
    result.url!.trim()

  const title =
    cleanText(
      result.title!,
    )

  const content =
    cleanText(
      result.content ??
        '',
    )

  const id =
    makeId(url)

  const source =
    getSource(url)

  const signup =
    requiresSignup(
      title,
      content,
    )

  const humanAction =
    requiresHumanAction(
      title,
      content,
    )

  const paymentSignal =
    hasPaymentSignal(
      title,
      content,
    )

  const actionSignal =
    hasActionSignal(
      title,
      content,
    )

  const estimatedValue =
    extractEstimatedValue(
      title,
      content,
    )

  const confidence =
    calculateConfidence(
      Number(
        result.score ??
          0,
      ),
      actionSignal,
      paymentSignal,
    )

  await sql`
    INSERT INTO opportunities (
      id,
      title,
      source,
      category,
      estimated_value,
      confidence,
      status,
      url,
      requires_signup,
      requires_user_action,
      language,
      automated_preparation,
      discovered_at
    )
    VALUES (
      ${id},
      ${title},
      ${source},
      ${category},
      ${estimatedValue},
      ${confidence},
      'new',
      ${url},
      ${signup},
      ${humanAction || signup},
      'global',
      TRUE,
      NOW()
    )

    ON CONFLICT (id)
    DO UPDATE SET
      title =
        EXCLUDED.title,

      source =
        EXCLUDED.source,

      category =
        EXCLUDED.category,

      estimated_value =
        CASE
          WHEN EXCLUDED.estimated_value > 0
          THEN EXCLUDED.estimated_value
          ELSE opportunities.estimated_value
        END,

      confidence =
        EXCLUDED.confidence,

      url =
        EXCLUDED.url,

      requires_signup =
        EXCLUDED.requires_signup,

      requires_user_action =
        EXCLUDED.requires_user_action,

      discovered_at =
        NOW()
  `

  return true
}

/*
 * ==========================================
 * LIMPEZA DE CONTEÚDO ANTIGO
 * ==========================================
 */

async function cleanOldContent() {
  for (
    const phrase of TITLE_BLOCKLIST
  ) {
    await sql`
      DELETE FROM opportunities
      WHERE LOWER(title)
      LIKE ${`%${phrase.toLowerCase()}%`}
    `
  }

  for (
    const word of CONTENT_BLOCKLIST
  ) {
    await sql`
      DELETE FROM opportunities
      WHERE LOWER(url)
      LIKE ${`%${word.toLowerCase()}%`}
    `
  }
}

/*
 * ==========================================
 * GET
 * ==========================================
 */

export async function GET() {
  try {
    await ensureTable()

    /*
     * Remove lixo antigo.
     */

    await cleanOldContent()

    let discovered =
      0

    let searches =
      0

    let rejected =
      0

    const errors: string[] =
      []

    /*
     * ======================================
     * PESQUISA GLOBAL
     * ======================================
     */

    for (
      const search of SEARCHES
    ) {
      try {
        const data =
          await searchTavily(
            search.query,
          )

        searches += 1

        const results =
          Array.isArray(
            data.results,
          )
            ? data.results
            : []

        for (
          const result of results
        ) {
          if (
            !isRealOpportunity(
              result,
            )
          ) {
            rejected += 1
            continue
          }

          const saved =
            await saveOpportunity(
              result,
              search.category as Category,
            )

          if (
            saved
          ) {
            discovered += 1
          }
        }
      } catch (
        error
      ) {
        console.error(
          'Erro em pesquisa Tavily:',
          error,
        )

        errors.push(
          String(
            error,
          ),
        )
      }
    }

    /*
     * ======================================
     * CATÁLOGO FINAL
     * ======================================
     */

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
          requires_user_action,
          language,
          automated_preparation,
          discovered_at,
          created_at
        FROM opportunities
        ORDER BY
          confidence DESC,
          estimated_value DESC,
          discovered_at DESC
        LIMIT 100
      `

    const opportunities =
      rows.map(
        (
          row,
        ) => ({
          id:
            row.id,

          title:
            row.title,

          source:
            row.source,

          category:
            row.category,

          estimatedValue:
            Number(
              row.estimated_value ??
                0,
            ),

          confidence:
            Number(
              row.confidence ??
                0,
            ),

          status:
            row.status,

          url:
            row.url ??
            null,

          requiresSignup:
            Boolean(
              row.requires_signup,
            ),

          requiresUserAction:
            Boolean(
              row.requires_user_action,
            ),

          language:
            row.language ??
            'global',

          automatedPreparation:
            Boolean(
              row.automated_preparation,
            ),

          discoveredAt:
            row.discovered_at,

          createdAt:
            row.created_at,
        }),
      )

    /*
     * ======================================
     * RESPOSTA
     * ======================================
     */

    return NextResponse.json({
      success:
        true,

      radar: {
        active:
          true,

        engine:
          'Tavily',

        searches,

        categories:
          ALLOWED_CATEGORIES,

        continuous:
          true,

        goalsStopAgent:
          false,

        onlyManualStop:
          true,

        estimatedValuesAreNotMoney:
          true,

        confirmedEarningsOnly:
          true,

        identityActionsRequireUser:
          true,

        contentFilter:
          true,

        actionRequired:
          true,

        valueExtraction:
          true,

        duplicateProtection:
          true,
      },

      discovered,

      rejected,

      total:
        opportunities.length,

      opportunities,

      message:
        'Radar executado com filtragem, classificação e extração de estimativas das fontes.',

      errors:
        errors.length >
        0
          ? errors
          : undefined,
    })
  } catch (
    error
  ) {
    console.error(
      'Erro no radar:',
      error,
    )

    return NextResponse.json(
      {
        success:
          false,

        error:
          error instanceof
          Error
            ? error.message
            : 'Erro ao executar radar',

        opportunities:
          [],
      },
      {
        status:
          500,
      },
    )
  }
}
