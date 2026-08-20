import { NextResponse } from 'next/server'

type AnalyzeRequest = {
  url?: string
  title?: string
  source?: string
  category?: string
  content?: string
}

type AnalysisResult = {
  valid: boolean
  classification:
    | 'real_opportunity'
    | 'needs_review'
    | 'content'
    | 'invalid'
  confidence: number
  reasons: string[]
  signals: {
    application: boolean
    signup: boolean
    payment: boolean
    work: boolean
    contentPage: boolean
  }
}

const CONTENT_WORDS = [
  'blog',
  'article',
  'guide',
  'guides',
  'news',
  'resources',
  'explained',
  'how-to',
  'howto',
  'tips',
  'what-is',
  'what-are',
  'ultimate-guide',
]

const CONTENT_PHRASES = [
  'how to',
  'what is',
  'what are',
  'best ways',
  'ultimate guide',
  'everything you need to know',
  'commission structure',
  'commission structures',
  'tips and tricks',
  'learn more about',
]

const ACTION_WORDS = [
  'apply',
  'apply now',
  'sign up',
  'signup',
  'register',
  'join',
  'join now',
  'create account',
  'create an account',
  'become a partner',
  'become an affiliate',
  'become a tester',
  'start earning',
  'get paid',
  'paid study',
  'paid research',
  'paid survey',
  'remote job',
  'freelance job',
  'work with us',
]

const PAYMENT_WORDS = [
  'get paid',
  'paid',
  'payment',
  'payments',
  'commission',
  'reward',
  'rewards',
  'earn',
  'earning',
  'earnings',
  'cash',
  'payout',
]

const WORK_WORDS = [
  'job',
  'jobs',
  'work',
  'worker',
  'workers',
  'freelance',
  'task',
  'tasks',
  'microtask',
  'microtasks',
  'study',
  'research',
  'survey',
  'surveys',
  'tester',
  'testing',
  'affiliate',
  'partner',
]

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function containsAny(
  text: string,
  words: string[],
) {
  return words.some((word) =>
    text.includes(word),
  )
}

function isContentPage(
  url: string,
  title: string,
) {
  const normalizedUrl =
    normalize(url)

  const normalizedTitle =
    normalize(title)

  return (
    containsAny(
      normalizedUrl,
      CONTENT_WORDS,
    ) ||
    containsAny(
      normalizedTitle,
      CONTENT_PHRASES,
    )
  )
}

function analyzeText(
  url: string,
  title: string,
  content: string,
): AnalysisResult {
  const text = normalize(
    `${title} ${content}`,
  )

  const contentPage =
    isContentPage(
      url,
      title,
    )

  const application =
    containsAny(
      text,
      [
        'apply',
        'apply now',
        'register',
        'join',
        'become a tester',
        'become an affiliate',
        'become a partner',
      ],
    )

  const signup =
    containsAny(
      text,
      [
        'sign up',
        'signup',
        'create account',
        'create an account',
        'register',
      ],
    )

  const payment =
    containsAny(
      text,
      PAYMENT_WORDS,
    )

  const work =
    containsAny(
      text,
      WORK_WORDS,
    )

  const reasons: string[] = []

  if (application) {
    reasons.push(
      'Possui sinal de candidatura ou inscrição.',
    )
  }

  if (signup) {
    reasons.push(
      'Possui sinal de cadastro.',
    )
  }

  if (payment) {
    reasons.push(
      'Possui sinais relacionados a pagamento ou recompensa.',
    )
  }

  if (work) {
    reasons.push(
      'Possui sinais relacionados a trabalho ou atividade remunerada.',
    )
  }

  if (contentPage) {
    reasons.push(
      'A URL ou o título parece indicar conteúdo informativo.',
    )
  }

  /*
   * CONTEÚDO PURO
   *
   * Se parece artigo e não possui
   * sinais fortes de ação, rejeita.
   */
  if (
    contentPage &&
    !application &&
    !signup
  ) {
    return {
      valid: false,
      classification:
        'content',
      confidence: 95,
      reasons,
      signals: {
        application,
        signup,
        payment,
        work,
        contentPage,
      },
    }
  }

  /*
   * OPORTUNIDADE FORTE
   *
   * Precisa existir ação + sinais
   * de pagamento/trabalho.
   */
  if (
    (application || signup) &&
    (payment || work) &&
    !contentPage
  ) {
    return {
      valid: true,
      classification:
        'real_opportunity',
      confidence: 90,
      reasons,
      signals: {
        application,
        signup,
        payment,
        work,
        contentPage,
      },
    }
  }

  /*
   * POSSÍVEL OPORTUNIDADE
   */
  if (
    (payment || work) &&
    (application ||
      signup ||
      !contentPage)
  ) {
    return {
      valid: true,
      classification:
        'needs_review',
      confidence: 70,
      reasons,
      signals: {
        application,
        signup,
        payment,
        work,
        contentPage,
      },
    }
  }

  /*
   * NÃO TEM SINAIS SUFICIENTES.
   */
  return {
    valid: false,
    classification:
      'invalid',
    confidence: 40,
    reasons: [
      ...reasons,
      'Não foram encontrados sinais suficientes de uma oportunidade acionável.',
    ],
    signals: {
      application,
      signup,
      payment,
      work,
      contentPage,
    },
  }
}

async function inspectPage(
  url: string,
) {
  try {
    const response =
      await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        headers: {
          'User-Agent':
            'Mozilla/5.0 Gerente-de-Renda Opportunity Analyzer',
        },
      })

    if (!response.ok) {
      return ''
    }

    const contentType =
      response.headers.get(
        'content-type',
      ) ?? ''

    if (
      !contentType.includes(
        'text/html',
      )
    ) {
      return ''
    }

    const html =
      await response.text()

    /*
     * Remove scripts e estilos.
     */
    const text =
      html
        .replace(
          /<script[\s\S]*?<\/script>/gi,
          ' ',
        )
        .replace(
          /<style[\s\S]*?<\/style>/gi,
          ' ',
        )
        .replace(
          /<[^>]+>/g,
          ' ',
        )
        .replace(
          /\s+/g,
          ' ',
        )
        .trim()

    /*
     * Limita o tamanho para
     * evitar processamento excessivo.
     */
    return text.slice(
      0,
      30000,
    )
  } catch {
    return ''
  }
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as AnalyzeRequest

    const url =
      body.url?.trim()

    const title =
      body.title?.trim() ??
      ''

    if (!url) {
      return NextResponse.json(
        {
          success: false,
          error:
            'URL da oportunidade não informada.',
        },
        {
          status: 400,
        },
      )
    }

    /*
     * Verificação básica da URL.
     */
    try {
      new URL(url)
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            'URL inválida.',
        },
        {
          status: 400,
        },
      )
    }

    /*
     * Primeiro usa o conteúdo já
     * encontrado pelo radar.
     */
    let pageContent =
      body.content?.trim() ??
      ''

    /*
     * Depois tenta consultar a
     * página oficial.
     */
    if (
      pageContent.length <
      100
    ) {
      pageContent =
        await inspectPage(
          url,
        )
    }

    const result =
      analyzeText(
        url,
        title,
        pageContent,
      )

    return NextResponse.json({
      success: true,

      opportunity: {
        url,
        title,
        source:
          body.source ??
          null,
        category:
          body.category ??
          null,
      },

      analysis:
        result,
    })
  } catch (error) {
    console.error(
      'Erro no analisador de oportunidades:',
      error,
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao analisar oportunidade.',
      },
      {
        status: 500,
      },
    )
  }
}
