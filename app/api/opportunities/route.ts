import { NextResponse } from 'next/server'

type AnalyzeRequest = {
  url?: string
  title?: string
  source?: string
  category?: string
  content?: string
}

type Classification =
  | 'real_opportunity'
  | 'needs_review'
  | 'content'
  | 'invalid'

type AnalysisResult = {
  valid: boolean
  classification: Classification
  confidence: number
  reasons: string[]
  signals: {
    application: boolean
    signup: boolean
    payment: boolean
    work: boolean
    task: boolean
    contentPage: boolean
    opportunityPage: boolean
  }
}

const CONTENT_WORDS = [
  'blog',
  'article',
  'articles',
  'guide',
  'guides',
  'news',
  'resources',
  'resource',
  'explained',
  'how-to',
  'howto',
  'tips',
  'what-is',
  'what-are',
  'ultimate-guide',
  'learn',
  'academy',
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
  'best affiliate programs',
  'top affiliate programs',
  'affiliate marketing guide',
  'affiliate marketing tips',
  'ways to make money',
  'how to make money',
]

const APPLICATION_WORDS = [
  'apply',
  'apply now',
  'application',
  'applications',
  'register',
  'registration',
  'join',
  'join now',
  'join us',
  'sign up',
  'signup',
  'create account',
  'create an account',
  'become a tester',
  'become an affiliate',
  'become a partner',
  'become a contributor',
  'become a creator',
  'start working',
  'start earning',
  'get started',
  'submit application',
]

const PAYMENT_WORDS = [
  'get paid',
  'paid',
  'payment',
  'payments',
  'commission',
  'commissions',
  'reward',
  'rewards',
  'earn',
  'earnings',
  'cash',
  'payout',
  'payouts',
  'income',
  'money',
  'dollars',
  'usd',
  'per task',
  'per study',
  'per test',
  'per survey',
  'hourly pay',
  'hourly rate',
  'salary',
  'compensation',
]

const WORK_WORDS = [
  'job',
  'jobs',
  'work',
  'worker',
  'workers',
  'freelance',
  'freelancer',
  'task',
  'tasks',
  'microtask',
  'microtasks',
  'study',
  'studies',
  'research',
  'survey',
  'surveys',
  'tester',
  'testing',
  'usertesting',
  'affiliate',
  'affiliates',
  'partner',
  'partners',
  'creator',
  'creators',
  'contractor',
  'contractors',
  'gig',
  'gigs',
]

const STRONG_OPPORTUNITY_PHRASES = [
  'paid survey',
  'paid surveys',
  'paid study',
  'paid studies',
  'paid research',
  'paid research study',
  'paid research studies',
  'get paid to test',
  'get paid testing',
  'paid tester',
  'paid testers',
  'website testing',
  'app testing',
  'user testing',
  'remote job',
  'remote jobs',
  'freelance job',
  'freelance jobs',
  'microtask',
  'microtasks',
  'earn commission',
  'affiliate program',
  'affiliate programme',
  'referral program',
  'referral programme',
  'creator rewards',
  'creator revenue',
  'revenue sharing',
  'paid content creator',
  'content creator program',
]

const ACTION_PHRASES = [
  'apply now',
  'sign up',
  'signup',
  'register now',
  'join now',
  'join us',
  'become an affiliate',
  'become a partner',
  'become a tester',
  'become a creator',
  'start earning',
  'get paid',
  'get started',
  'apply for',
  'create an account',
  'create account',
]

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, ' ')
    .replace(/www\./g, ' ')
    .replace(/[^a-z0-9$%./ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsAny(
  text: string,
  words: string[],
) {
  return words.some((word) =>
    text.includes(normalize(word)),
  )
}

function countMatches(
  text: string,
  words: string[],
) {
  return words.filter((word) =>
    text.includes(normalize(word)),
  ).length
}

function isContentPage(
  url: string,
  title: string,
) {
  const normalizedUrl = normalize(url)
  const normalizedTitle = normalize(title)

  const urlContent =
    containsAny(
      normalizedUrl,
      CONTENT_WORDS,
    )

  const titleContent =
    containsAny(
      normalizedTitle,
      CONTENT_PHRASES,
    )

  return urlContent || titleContent
}

function analyzeText(
  url: string,
  title: string,
  content: string,
): AnalysisResult {
  const normalizedUrl = normalize(url)
  const normalizedTitle = normalize(title)

  const text = normalize(
    `${title} ${content}`,
  )

  const contentPage = isContentPage(
    url,
    title,
  )

  const application =
    containsAny(
      text,
      APPLICATION_WORDS,
    )

  const signup =
    containsAny(
      text,
      [
        'sign up',
        'signup',
        'register',
        'registration',
        'create account',
        'create an account',
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

  const task =
    containsAny(
      text,
      [
        'task',
        'tasks',
        'microtask',
        'microtasks',
        'study',
        'research',
        'survey',
        'surveys',
        'testing',
        'tester',
        'job',
        'jobs',
        'freelance',
      ],
    )

  const strongOpportunity =
    containsAny(
      text,
      STRONG_OPPORTUNITY_PHRASES,
    )

  const explicitAction =
    containsAny(
      text,
      ACTION_PHRASES,
    )

  const opportunityPage =
    strongOpportunity ||
    (
      explicitAction &&
      (
        application ||
        signup
      ) &&
      (
        payment ||
        work ||
        task
      )
    )

  const reasons: string[] = []

  if (application) {
    reasons.push(
      'Encontrado sinal de candidatura, inscrição ou participação.',
    )
  }

  if (signup) {
    reasons.push(
      'Encontrado sinal de cadastro.',
    )
  }

  if (payment) {
    reasons.push(
      'Encontrados sinais explícitos de pagamento, recompensa ou remuneração.',
    )
  }

  if (work) {
    reasons.push(
      'Encontrados sinais de trabalho, serviço ou atividade remunerada.',
    )
  }

  if (task) {
    reasons.push(
      'Encontrados sinais de tarefa, estudo, teste, pesquisa ou trabalho.',
    )
  }

  if (strongOpportunity) {
    reasons.push(
      'Encontrada expressão diretamente relacionada a uma oportunidade de renda.',
    )
  }

  if (contentPage) {
    reasons.push(
      'A página parece ser conteúdo informativo, artigo, guia ou lista.',
    )
  }

  /*
   * 1. CONTEÚDO PURO
   *
   * Artigos, guias e listas não devem
   * aparecer como oportunidade.
   */
  if (
    contentPage &&
    !opportunityPage &&
    !strongOpportunity
  ) {
    return {
      valid: false,
      classification: 'content',
      confidence: 96,
      reasons: [
        ...reasons,
        'A página não apresentou uma ação clara para participar ou ganhar dinheiro.',
      ],
      signals: {
        application,
        signup,
        payment,
        work,
        task,
        contentPage,
        opportunityPage,
      },
    }
  }

  /*
   * 2. OPORTUNIDADE REAL
   *
   * Precisa existir uma combinação
   * concreta de ação + renda/atividade.
   */
  if (
    opportunityPage &&
    (
      payment ||
      work ||
      task
    )
  ) {
    return {
      valid: true,
      classification: 'real_opportunity',
      confidence: 93,
      reasons: [
        ...reasons,
        'A página apresenta sinais suficientes de uma oportunidade acionável.',
      ],
      signals: {
        application,
        signup,
        payment,
        work,
        task,
        contentPage,
        opportunityPage,
      },
    }
  }

  /*
   * 3. OPORTUNIDADE FORTE POR FRASE
   *
   * Algumas páginas oficiais não usam
   * "apply" no texto inicial, mas o próprio
   * título deixa claro que existe atividade paga.
   */
  if (
    strongOpportunity &&
    (
      payment ||
      work ||
      task
    ) &&
    !(
      contentPage &&
      !explicitAction
    )
  ) {
    return {
      valid: true,
      classification: 'real_opportunity',
      confidence: 88,
      reasons: [
        ...reasons,
        'O título ou conteúdo indica uma atividade remunerada concreta.',
      ],
      signals: {
        application,
        signup,
        payment,
        work,
        task,
        contentPage,
        opportunityPage,
      },
    }
  }

  /*
   * 4. REVISÃO
   *
   * Só usamos revisão quando existem
   * sinais relevantes, mas não suficientes.
   */
  const paymentMatches =
    countMatches(
      text,
      PAYMENT_WORDS,
    )

  const workMatches =
    countMatches(
      text,
      WORK_WORDS,
    )

  if (
    (
      paymentMatches >= 2 ||
      workMatches >= 2
    ) &&
    !contentPage
  ) {
    return {
      valid: true,
      classification: 'needs_review',
      confidence: 65,
      reasons: [
        ...reasons,
        'Existem sinais de possível oportunidade, mas é necessária verificação adicional.',
      ],
      signals: {
        application,
        signup,
        payment,
        work,
        task,
        contentPage,
        opportunityPage,
      },
    }
  }

  /*
   * 5. INVÁLIDA
   */
  return {
    valid: false,
    classification: 'invalid',
    confidence: 30,
    reasons: [
      ...reasons,
      'Não foram encontrados sinais suficientes de uma oportunidade real e acionável.',
    ],
    signals: {
      application,
      signup,
      payment,
      work,
      task,
      contentPage,
      opportunityPage,
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
          /<noscript[\s\S]*?<\/noscript>/gi,
          ' ',
        )
        .replace(
          /<[^>]+>/g,
          ' ',
        )
        .replace(
          /&nbsp;/gi,
          ' ',
        )
        .replace(
          /&amp;/gi,
          '&',
        )
        .replace(
          /\s+/g,
          ' ',
        )
        .trim()

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
      body.title?.trim() ?? ''

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

    let pageContent =
      body.content?.trim() ?? ''

    /*
     * Se o radar não trouxe conteúdo suficiente,
     * abre a página oficial para análise.
     */
    if (
      pageContent.length < 100
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
