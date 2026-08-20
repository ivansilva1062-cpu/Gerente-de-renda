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
 * PALAVRAS QUE INDICAM CONTEÚDO
 *
 * Se aparecerem no título ou URL,
 * normalmente estamos diante de artigo,
 * guia, notícia ou explicação.
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
]

/*
 * FRASES QUE NORMALMENTE INDICAM
 * QUE É APENAS MATERIAL INFORMATIVO.
 */
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
]

/*
 * SINAIS DE AÇÃO REAL.
 *
 * A página precisa indicar alguma ação
 * que possa levar a uma oportunidade.
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
]

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

function calculateConfidence(score = 0) {
  const value = Math.round(
    70 +
      Math.min(
        Math.max(score, 0),
        1,
      ) *
        25,
  )

  return Math.min(value, 95)
}

/*
 * Verifica se a URL parece ser
 * uma página de conteúdo.
 */
function isBlockedUrl(url: string) {
  const normalized =
    url.toLowerCase()

  return CONTENT_BLOCKLIST.some(
    (word) =>
      normalized.includes(word),
  )
}

/*
 * Verifica se o título parece
 * ser apenas conteúdo educativo.
 */
function isBlockedTitle(
  title: string,
) {
  const normalized =
    title.toLowerCase()

  return TITLE_BLOCKLIST.some(
    (phrase) =>
      normalized.includes(
        phrase,
      ),
  )
}

/*
 * Verifica se existe algum sinal
 * de oportunidade acionável.
 */
function hasActionSignal(
  title: string,
  content: string,
) {
  const text =
    `${title} ${content}`
      .toLowerCase()

  return ACTION_SIGNALS.some(
    (signal) =>
      text.includes(signal),
  )
}

/*
 * FILTRO PRINCIPAL
 *
 * A oportunidade precisa:
 *
 * 1. Ter URL.
 * 2. Ter título.
 * 3. Não parecer artigo.
 * 4. Ter sinal de ação.
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
    cleanText(result.title)

  const content =
    cleanText(
      result.content ?? '',
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
    isBlockedTitle(title)
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
        body: JSON.stringify({
          api_key:
            apiKey,
          query,
          search_depth:
            'advanced',
          topic: 'general',
          max_results: 8,
          include_answer:
            false,
          include_raw_content:
            false,
        }),
        cache:
          'no-store',
      },
    )

  if (!response.ok) {
    const text =
      await response.text()

    throw new Error(
      `Tavily respondeu ${response.status}: ${text}`,
    )
  }

  return (await response.json()) as TavilyResponse
}

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

  const id =
    makeId(url)

  const title =
    cleanText(
      result.title!,
    )

  const confidence =
    calculateConfidence(
      Number(
        result.score ?? 0,
      ),
    )

  const source =
    getSource(url)

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
      0,
      ${confidence},
      'new',
      ${url},
      TRUE,
      TRUE,
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
      confidence =
        EXCLUDED.confidence,
      url =
        EXCLUDED.url,
      discovered_at =
        NOW()
  `

  return true
}

/*
 * LIMPA O CATÁLOGO ANTIGO.
 *
 * Remove oportunidades que claramente
 * parecem artigos ou conteúdo.
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

export async function GET() {
  try {
    await ensureTable()

    /*
     * Limpa lixo antigo antes
     * de executar o novo radar.
     */
    await cleanOldContent()

    let discovered = 0
    let searches = 0
    let rejected = 0

    const errors: string[] = []

    /*
     * PESQUISA GLOBAL
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

          if (saved) {
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
          String(error),
        )
      }
    }

    /*
     * DEVOLVE O CATÁLOGO FINAL.
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
          discovered_at DESC
        LIMIT 100
      `

    const opportunities =
      rows.map(
        (row) => ({
          id: row.id,

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

    return NextResponse.json({
      success: true,

      radar: {
        active: true,

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
      },

      discovered,

      rejected,

      total:
        opportunities.length,

      opportunities,

      message:
        'Radar V4 executado com filtro de oportunidades acionáveis.',

      errors:
        errors.length > 0
          ? errors
          : undefined,
    })
  } catch (
    error
  ) {
    console.error(
      'Erro no radar V4:',
      error,
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Erro ao executar radar',

        opportunities:
          [],
      },
      {
        status: 500,
      },
    )
  }
}
