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
 * ============================================================
 * RADAR GLOBAL
 * ============================================================
 *
 * O radar procura FONTES REAIS de oportunidade.
 *
 * IMPORTANTE:
 *
 * - descoberta não é dinheiro;
 * - estimativa não altera saldo;
 * - não faz cadastro;
 * - não usa senha;
 * - não usa CPF;
 * - não usa cartão;
 * - não usa 2FA;
 * - não finge identidade;
 * - pagamento real continua exclusivamente em /api/earnings.
 */

/*
 * Pesquisas mais específicas.
 *
 * O objetivo é encontrar a plataforma real,
 * e não artigos falando sobre plataformas.
 */
const SEARCHES: {
  query: string
  category: Category
}[] = [
  {
    query:
      'official platform get paid microtasks workers sign up remote tasks',
    category: 'microtasks',
  },

  {
    query:
      'official platform paid online research participants sign up studies',
    category: 'surveys',
  },

  {
    query:
      'official website get paid test websites apps participants sign up',
    category: 'testing',
  },

  {
    query:
      'official freelance marketplace find paid remote jobs services',
    category: 'freelance',
  },

  {
    query:
      'official affiliate program apply commission partner program',
    category: 'affiliate',
  },

  {
    query:
      'official creator monetization platform earn money content creators',
    category: 'content',
  },
]

/*
 * Domínios conhecidos de plataformas.
 *
 * Isso ajuda o radar a reconhecer fontes reais.
 */
const KNOWN_PLATFORMS = [
  'prolific.com',
  'usertesting.com',
  'userlytics.com',
  'testbirds.com',
  'respondent.io',
  'clickworker.com',
  'toloka.ai',
  'appen.com',
  'crowdgen.com',
  'fiverr.com',
  'upwork.com',
  'freelancer.com',
  'peopleperhour.com',
  'contra.com',
  'impact.com',
  'partnerstack.com',
  'cj.com',
  'awin.com',
  'shareasale.com',
  'rakutenadvertising.com',
  'patreon.com',
  'substack.com',
]

/*
 * Palavras que normalmente indicam artigo,
 * notícia, comparação ou conteúdo editorial.
 *
 * Essas páginas NÃO são oportunidades.
 */
const BLOCKED_TITLE_WORDS = [
  'best ',
  'best  ',
  'top ',
  'top  ',
  'guide',
  'guides',
  'list',
  'lists',
  'review',
  'reviews',
  'comparison',
  'compare',
  'vs ',
  'versus',
  'article',
  'blog',
  'news',
  'ideas',
  'tips',
  'ways to',
  'how to make money',
  'highest paying programs',
  'programs in 2026',
  'programs in 2025',
  'marketplaces updated',
]

/*
 * Caminhos que frequentemente representam
 * artigos e páginas editoriais.
 */
const BLOCKED_PATH_WORDS = [
  '/blog/',
  '/blog',
  '/news/',
  '/news',
  '/article/',
  '/articles/',
  '/guide/',
  '/guides/',
  '/resources/',
  '/learn/',
  '/knowledge/',
  '/compare/',
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
      .toLowerCase()
  } catch {
    return 'web'
  }
}

function isKnownPlatform(
  hostname: string,
) {
  return KNOWN_PLATFORMS.some(
    (domain) =>
      hostname === domain ||
      hostname.endsWith(`.${domain}`),
  )
}

/*
 * Determina se o resultado parece ser
 * uma oportunidade real ou apenas um artigo.
 */
function isLikelyOpportunity(
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

  if (
    !url.startsWith(
      'http://',
    ) &&
    !url.startsWith(
      'https://',
    )
  ) {
    return false
  }

  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  const title =
    cleanText(
      result.title,
    ).toLowerCase()

  const pathname =
    parsed.pathname.toLowerCase()

  /*
   * Rejeita títulos claramente editoriais.
   */
  const blockedTitle =
    BLOCKED_TITLE_WORDS.some(
      (word) =>
        title.includes(word),
    )

  if (blockedTitle) {
    return false
  }

  /*
   * Rejeita caminhos de blog/artigo.
   *
   * Exceção:
   * se for um domínio conhecido,
   * ainda podemos aceitar.
   */
  const blockedPath =
    BLOCKED_PATH_WORDS.some(
      (word) =>
        pathname.includes(word),
    )

  const hostname =
    parsed.hostname
      .replace(/^www\./, '')
      .toLowerCase()

  if (
    blockedPath &&
    !isKnownPlatform(hostname)
  ) {
    return false
  }

  return true
}

/*
 * Confiança baseada no score do Tavily.
 *
 * Não representa chance de pagamento.
 */
function calculateConfidence(
  score = 0,
  knownPlatform = false,
) {
  const normalized =
    Math.min(
      Math.max(
        Number(score) || 0,
        0,
      ),
      1,
    )

  let confidence =
    Math.round(
      65 +
        normalized * 25,
    )

  if (
    knownPlatform
  ) {
    confidence += 5
  }

  return Math.min(
    confidence,
    95,
  )
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

          topic:
            'general',

          max_results:
            10,

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

  return (
    (await response.json()) as
      TavilyResponse
  )
}

async function saveOpportunity(
  result: TavilyResult,
  category: Category,
) {
  if (
    !isLikelyOpportunity(
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

  const source =
    getSource(url)

  const knownPlatform =
    isKnownPlatform(
      source,
    )

  const confidence =
    calculateConfidence(
      Number(
        result.score ?? 0,
      ),
      knownPlatform,
    )

  const id =
    makeId(url)

  /*
   * estimated_value permanece ZERO.
   *
   * Não inventamos valor.
   * Não confundimos potencial com dinheiro.
   */
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

    let discovered =
      0

    let searches =
      0

    let rejected =
      0

    const errors: string[] =
      []

    /*
     * Executa todas as pesquisas.
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
            !isLikelyOpportunity(
              result,
            )
          ) {
            rejected += 1
            continue
          }

          const saved =
            await saveOpportunity(
              result,
              search.category,
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
          error instanceof Error
            ? error.message
            : String(error),
        )
      }
    }

    /*
     * Catálogo atual.
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
          discovered_at DESC
        LIMIT 100
      `

    const opportunities =
      rows.map(
        (row) => ({
          id:
            row.id,

          title:
            row.title,

          source:
            row.source,

          category:
            row.category,

          /*
           * Continua zero até existir
           * valor confirmado.
           */
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

        articleFiltering:
          true,

        knownPlatformValidation:
          true,
      },

      discovered,

      rejected,

      total:
        opportunities.length,

      opportunities,

      message:
        'Radar executado com filtro de fontes reais. Artigos e páginas editoriais são descartados.',

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
        success:
          false,

        error:
          error instanceof Error
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
