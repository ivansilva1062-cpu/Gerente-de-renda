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

const CATEGORIES = [
  'microtasks',
  'freelance',
  'surveys',
  'content',
  'affiliate',
  'testing',
] as const

type Category =
  (typeof CATEGORIES)[number]

/*
 * ============================================================
 * RADAR GLOBAL V3
 * ============================================================
 *
 * O objetivo é descobrir FONTES DIRETAS.
 *
 * Não consideramos:
 *
 * - artigos;
 * - blogs;
 * - listas;
 * - vídeos;
 * - Reddit;
 * - guias;
 * - notícias;
 * - páginas comparativas.
 *
 * Oportunidade != dinheiro.
 *
 * Dinheiro real continua somente em /api/earnings.
 */

/*
 * ============================================================
 * PESQUISAS
 * ============================================================
 */

const SEARCHES: {
  query: string
  category: Category
}[] = [
  {
    query:
      'official platform get paid microtasks workers tasks signup',
    category: 'microtasks',
  },

  {
    query:
      'official paid research participant platform signup studies',
    category: 'surveys',
  },

  {
    query:
      'official website testing platform get paid testers signup',
    category: 'testing',
  },

  {
    query:
      'official freelance marketplace remote jobs freelancers',
    category: 'freelance',
  },

  {
    query:
      'official affiliate partner program commission apply',
    category: 'affiliate',
  },

  {
    query:
      'official creator monetization platform creators earn',
    category: 'content',
  },
]

/*
 * ============================================================
 * DOMÍNIOS CONHECIDOS
 * ============================================================
 *
 * Esses domínios recebem prioridade.
 */

const TRUSTED_DOMAINS = [
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
  'rakutenadvertising.com',
  'patreon.com',
  'substack.com',
  'facebook.com',
  'creators.facebook.com',
]

/*
 * ============================================================
 * DOMÍNIOS QUE NÃO DEVEM VIRAR OPORTUNIDADE
 * ============================================================
 */

const BLOCKED_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'reddit.com',
  'quora.com',
  'medium.com',
  'forbes.com',
  'businessinsider.com',
  'linkedin.com',
  'facebook.com/groups',
]

/*
 * ============================================================
 * PALAVRAS DE ARTIGO
 * ============================================================
 */

const BLOCKED_TITLE_WORDS = [
  'best',
  'top ',
  'top 10',
  'top 20',
  'top 50',
  'guide',
  'guides',
  'list',
  'lists',
  'review',
  'reviews',
  'comparison',
  'compare',
  'versus',
  ' vs ',
  'how to',
  'ways to',
  'tips',
  'ideas',
  'article',
  'news',
  'blog',
  'roundup',
  'ultimate guide',
  'websites that',
  'programs that',
  'programs in 2026',
  'programs in 2025',
  'marketplaces updated',
]

/*
 * ============================================================
 * CAMINHOS EDITORIAIS
 * ============================================================
 */

const BLOCKED_PATHS = [
  '/blog',
  '/blogs',
  '/article',
  '/articles',
  '/news',
  '/guide',
  '/guides',
  '/resources',
  '/learn',
  '/knowledge',
  '/community',
  '/forum',
  '/forums',
  '/discussion',
]

/*
 * ============================================================
 * ID
 * ============================================================
 */

function makeId(url: string) {
  return `tavily-${createHash('sha256')
    .update(url)
    .digest('hex')
    .slice(0, 24)}`
}

/*
 * ============================================================
 * TEXTO
 * ============================================================
 */

function cleanText(
  value: string,
) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
}

/*
 * ============================================================
 * DOMÍNIO
 * ============================================================
 */

function getSource(
  url: string,
) {
  try {
    return new URL(url)
      .hostname
      .replace(/^www\./, '')
      .toLowerCase()
  } catch {
    return 'web'
  }
}

/*
 * ============================================================
 * DOMÍNIO CONFIÁVEL
 * ============================================================
 */

function isTrustedDomain(
  hostname: string,
) {
  return TRUSTED_DOMAINS.some(
    (domain) =>
      hostname === domain ||
      hostname.endsWith(
        `.${domain}`,
      ),
  )
}

/*
 * ============================================================
 * DOMÍNIO BLOQUEADO
 * ============================================================
 */

function isBlockedDomain(
  hostname: string,
) {
  return BLOCKED_DOMAINS.some(
    (domain) =>
      hostname === domain ||
      hostname.endsWith(
        `.${domain}`,
      ),
  )
}

/*
 * ============================================================
 * FILTRO PRINCIPAL
 * ============================================================
 */

function classifyResult(
  result: TavilyResult,
) {
  if (
    !result.url ||
    !result.title
  ) {
    return {
      valid: false,
      reason: 'missing',
    }
  }

  const url =
    result.url.trim()

  if (
    !url.startsWith(
      'https://',
    ) &&
    !url.startsWith(
      'http://',
    )
  ) {
    return {
      valid: false,
      reason: 'invalid-url',
    }
  }

  let parsed: URL

  try {
    parsed =
      new URL(url)
  } catch {
    return {
      valid: false,
      reason: 'invalid-url',
    }
  }

  const hostname =
    parsed.hostname
      .replace(/^www\./, '')
      .toLowerCase()

  const pathname =
    parsed.pathname.toLowerCase()

  const title =
    cleanText(
      result.title,
    ).toLowerCase()

  /*
   * Domínio editorial conhecido.
   */
  if (
    isBlockedDomain(
      hostname,
    )
  ) {
    return {
      valid: false,
      reason: 'blocked-domain',
    }
  }

  /*
   * Título de artigo/lista.
   */
  if (
    BLOCKED_TITLE_WORDS.some(
      (word) =>
        title.includes(word),
    )
  ) {
    return {
      valid: false,
      reason: 'editorial-title',
    }
  }

  /*
   * Caminho editorial.
   *
   * Domínio confiável pode possuir
   * páginas /blog legítimas, mas ainda
   * assim o título precisa passar.
   */
  if (
    BLOCKED_PATHS.some(
      (path) =>
        pathname === path ||
        pathname.startsWith(
          `${path}/`,
        ),
    ) &&
    !isTrustedDomain(
      hostname,
    )
  ) {
    return {
      valid: false,
      reason: 'editorial-path',
    }
  }

  /*
   * Conteúdo textual.
   */
  const content =
    cleanText(
      result.content ??
        '',
    ).toLowerCase()

  /*
   * Sinais de uma página operacional.
   */
  const operationalSignals = [
    'sign up',
    'signup',
    'register',
    'apply',
    'application',
    'join',
    'get paid',
    'paid',
    'earn',
    'commission',
    'freelance',
    'tasks',
    'task',
    'participant',
    'tester',
    'creator',
    'affiliate',
    'partner',
    'worker',
  ]

  const signalCount =
    operationalSignals.filter(
      (signal) =>
        title.includes(
          signal,
        ) ||
        content.includes(
          signal,
        ),
    ).length

  /*
   * Se não for domínio conhecido,
   * exigimos sinais suficientes.
   */
  if (
    !isTrustedDomain(
      hostname,
    ) &&
    signalCount < 2
  ) {
    return {
      valid: false,
      reason: 'weak-source',
    }
  }

  return {
    valid: true,
    reason: isTrustedDomain(
      hostname,
    )
      ? 'trusted'
      : 'candidate',
  }
}

/*
 * ============================================================
 * CONFIANÇA
 * ============================================================
 */

function calculateConfidence(
  score = 0,
  trusted = false,
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
        normalized * 20,
    )

  if (trusted) {
    confidence += 10
  }

  return Math.min(
    confidence,
    95,
  )
}

/*
 * ============================================================
 * TAVILY
 * ============================================================
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

/*
 * ============================================================
 * SALVAR
 * ============================================================
 */

async function saveOpportunity(
  result: TavilyResult,
  category: Category,
) {
  const classification =
    classifyResult(
      result,
    )

  if (
    !classification.valid
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

  const trusted =
    isTrustedDomain(
      source,
    )

  const confidence =
    calculateConfidence(
      Number(
        result.score ?? 0,
      ),
      trusted,
    )

  const id =
    makeId(url)

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
 * ============================================================
 * GET
 * ============================================================
 */

export async function GET() {
  try {
    await ensureTable()

    /*
     * ========================================================
     * LIMPEZA
     * ========================================================
     *
     * Remove resultados Tavily antigos.
     *
     * As fontes fixas como:
     * source-prolific
     * source-usertesting
     * source-clickworker
     * source-fiverr
     *
     * NÃO são apagadas.
     */

    await sql`
      DELETE FROM opportunities
      WHERE id LIKE 'tavily-%'
    `

    let discovered = 0

    let rejected = 0

    let searches = 0

    const rejectionReasons: Record<
      string,
      number
    > = {}

    const errors: string[] =
      []

    /*
     * ========================================================
     * PESQUISAS
     * ========================================================
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
          const classification =
            classifyResult(
              result,
            )

          if (
            !classification.valid
          ) {
            rejected += 1

            rejectionReasons[
              classification.reason
            ] =
              (
                rejectionReasons[
                  classification.reason
                ] ?? 0
              ) + 1

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
          'Erro na pesquisa Tavily:',
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
     * ========================================================
     * CATÁLOGO
     * ========================================================
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
          'Tavily V3',

        searches,

        categories:
          CATEGORIES,

        continuous:
          true,

        goalsStopAgent:
          false,

        onlyManualStop:
          true,

        confirmedEarningsOnly:
          true,

        estimatedValuesAreNotMoney:
          true,

        identityActionsRequireUser:
          true,

        directSourceFiltering:
          true,

        editorialFiltering:
          true,

        oldTavilyResultsCleaned:
          true,
      },

      discovered,

      rejected,

      rejectionReasons,

      total:
        opportunities.length,

      opportunities,

      message:
        'Radar V3 executado. Resultados editoriais antigos foram removidos e novas fontes foram filtradas.',
      
      errors:
        errors.length > 0
          ? errors
          : undefined,
    })
  } catch (error) {
    console.error(
      'Erro no radar V3:',
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

/*
 * ============================================================
 * GARANTIR TABELA
 * ============================================================
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
