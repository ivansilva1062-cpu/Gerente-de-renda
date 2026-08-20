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
      'legitimate paid online opportunities remote work microtasks paid studies testing freelance',
    category: 'microtasks',
  },
  {
    query:
      'paid research studies online participants legitimate remote',
    category: 'surveys',
  },
  {
    query:
      'get paid to test websites apps remote user testing',
    category: 'testing',
  },
  {
    query:
      'freelance jobs online earn money remote services marketplace',
    category: 'freelance',
  },
  {
    query:
      'content creator affiliate programs legitimate online income',
    category: 'content',
  },
  {
    query:
      'affiliate programs remote online income legitimate',
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
    70 + Math.min(Math.max(score, 0), 1) * 25,
  )

  return Math.min(value, 95)
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

  const response = await fetch(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        topic: 'general',
        max_results: 8,
        include_answer: false,
        include_raw_content: false,
      }),
      cache: 'no-store',
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
  if (!result.url || !result.title) {
    return false
  }

  const url = result.url.trim()

  if (!url.startsWith('http')) {
    return false
  }

  const id = makeId(url)

  const title =
    cleanText(result.title)

  const content =
    cleanText(
      result.content ?? '',
    )

  const source =
    getSource(url)

  const confidence =
    calculateConfidence(
      Number(result.score ?? 0),
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

export async function GET() {
  try {
    await ensureTable()

    let discovered = 0
    let searches = 0
    const errors: string[] = []

    /*
     * PESQUISA GLOBAL
     *
     * O agente consulta várias categorias.
     */
    for (const search of SEARCHES) {
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

        for (const result of results) {
          const saved =
            await saveOpportunity(
              result,
              search.category as Category,
            )

          if (saved) {
            discovered += 1
          }
        }
      } catch (error) {
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
     * DEVOLVE O CATÁLOGO ATUAL.
     */
    const rows = await sql`
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
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        source: row.source,
        category: row.category,
        estimatedValue:
          Number(
            row.estimated_value ?? 0,
          ),
        confidence:
          Number(
            row.confidence ?? 0,
          ),
        status: row.status,
        url:
          row.url ?? null,
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
      }))

    return NextResponse.json({
      success: true,

      radar: {
        active: true,
        engine: 'Tavily',
        searches,
        categories:
          ALLOWED_CATEGORIES,
        continuous: true,
        goalsStopAgent: false,
        onlyManualStop: true,
        estimatedValuesAreNotMoney:
          true,
        confirmedEarningsOnly:
          true,
        identityActionsRequireUser:
          true,
      },

      discovered,
      total:
        opportunities.length,
      opportunities,

      message:
        'Radar Tavily executado. Novas oportunidades legítimas encontradas e catalogadas.',
      errors:
        errors.length > 0
          ? errors
          : undefined,
    })
  } catch (error) {
    console.error(
      'Erro no radar Tavily:',
      error,
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao executar radar',
        opportunities: [],
      },
      {
        status: 500,
      },
    )
  }
}
