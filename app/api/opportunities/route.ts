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

type AnalyzeResponse = {
  success?: boolean
  analysis?: {
    valid?: boolean
    classification?:
      | 'real_opportunity'
      | 'needs_review'
      | 'content'
      | 'invalid'
    confidence?: number
    reasons?: string[]
    signals?: {
      application?: boolean
      signup?: boolean
      payment?: boolean
      work?: boolean
      contentPage?: boolean
    }
  }
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

/*
 * Analisa a oportunidade antes de salvar.
 *
 * O radar chama a API de análise existente.
 */
async function analyzeOpportunity(
  request: Request,
  result: TavilyResult,
  category: Category,
) {
  if (!result.url) {
    return {
      valid: false,
      classification: 'invalid',
      confidence: 0,
    }
  }

  try {
    const analyzeUrl = new URL(
      '/api/opportunities/analyze',
      request.url,
    )

    const response = await fetch(
      analyzeUrl.toString(),
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          url: result.url,
          title: result.title ?? '',
          source: getSource(result.url),
          category,
          content:
            result.content ?? '',
        }),
        cache: 'no-store',
      },
    )

    if (!response.ok) {
      return {
        valid: false,
        classification: 'invalid',
        confidence: 0,
      }
    }

    const data =
      (await response.json()) as AnalyzeResponse

    const analysis =
      data.analysis

    if (!analysis) {
      return {
        valid: false,
        classification: 'invalid',
        confidence: 0,
      }
    }

    return {
      valid:
        analysis.valid === true,
      classification:
        analysis.classification ??
        'invalid',
      confidence:
        Number(
          analysis.confidence ?? 0,
        ),
    }
  } catch (error) {
    console.error(
      'Erro ao analisar oportunidade:',
      error,
    )

    return {
      valid: false,
      classification: 'invalid',
      confidence: 0,
    }
  }
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
  confidence: number,
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

export async function GET(
  request: Request,
) {
  try {
    await ensureTable()

    let discovered = 0
    let searches = 0
    let analyzed = 0
    let rejected = 0
    let needsReview = 0

    const errors: string[] = []

    /*
     * RADAR GLOBAL
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
          if (
            !result.url ||
            !result.title
          ) {
            rejected += 1
            continue
          }

          /*
           * PRIMEIRO:
           * verifica a oportunidade.
           */
          const analysis =
            await analyzeOpportunity(
              request,
              result,
              search.category as Category,
            )

          analyzed += 1

          /*
           * CONTEÚDO PURO:
           * não entra no catálogo.
           */
          if (
            analysis.classification ===
              'content' ||
            analysis.classification ===
              'invalid'
          ) {
            rejected += 1
            continue
          }

          /*
           * POSSÍVEL OPORTUNIDADE:
           * entra, mas com confiança menor.
           */
          if (
            analysis.classification ===
            'needs_review'
          ) {
            needsReview += 1
          }

          /*
           * OPORTUNIDADE REAL:
           * salva.
           */
          const baseConfidence =
            calculateConfidence(
              Number(
                result.score ?? 0,
              ),
            )

          const finalConfidence =
            Math.min(
              baseConfidence,
              Number(
                analysis.confidence ??
                  baseConfidence,
              ),
            )

          const saved =
            await saveOpportunity(
              result,
              search.category as Category,
              finalConfidence,
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
     * CATÁLOGO ATUAL
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

        /*
         * IMPORTANTE:
         * estimativa NÃO é dinheiro.
         */
        estimatedValue:
          Number(
            row.estimated_value ?? 0,
          ),

        confidence:
          Number(
            row.confidence ?? 0,
          ),

        status:
          row.status,

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

      worker: {
        active: true,
        continuous: true,

        /*
         * A META NUNCA PARA O AGENTE.
         */
        goalsStopAgent: false,

        /*
         * SOMENTE PARADA MANUAL.
         */
        onlyManualStop: true,
      },

      radar: {
        active: true,
        engine: 'Tavily',

        searches,

        analyzed,

        discovered,

        rejected,

        needsReview,

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

      total:
        opportunities.length,

      opportunities,

      message:
        'Radar executado. Oportunidades passaram pelo analisador antes de serem catalogadas.',

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
