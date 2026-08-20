import { NextResponse } from 'next/server'

type OpportunityInput = {
  id?: string
  title?: string
  source?: string
  category?: string
  estimatedValue?: number
  confidence?: number
  url?: string | null
  requiresSignup?: boolean
  requiresUserAction?: boolean
}

const ALLOWED_CATEGORIES = [
  'microtasks',
  'freelance',
  'surveys',
  'content',
  'affiliate',
  'testing',
] as const

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function analyzeOpportunity(
  opportunity: OpportunityInput,
) {
  const title = clean(
    opportunity.title,
  )

  const source = clean(
    opportunity.source,
  )

  const category = clean(
    opportunity.category,
  )

  const url = clean(
    opportunity.url,
  )

  const confidence = Math.max(
    0,
    Math.min(
      100,
      Number(
        opportunity.confidence ?? 0,
      ),
    ),
  )

  const requiresSignup =
    Boolean(
      opportunity.requiresSignup,
    )

  const requiresUserAction =
    Boolean(
      opportunity.requiresUserAction,
    )

  const categoryAllowed =
    ALLOWED_CATEGORIES.includes(
      category as (typeof ALLOWED_CATEGORIES)[number],
    )

  let priority:
    | 'high'
    | 'medium'
    | 'low' = 'low'

  if (
    confidence >= 85 &&
    categoryAllowed &&
    url
  ) {
    priority = 'high'
  } else if (
    confidence >= 75 &&
    categoryAllowed &&
    url
  ) {
    priority = 'medium'
  }

  const reasons: string[] = []

  if (categoryAllowed) {
    reasons.push(
      'Categoria reconhecida pelo radar.',
    )
  } else {
    reasons.push(
      'Categoria não reconhecida pelo catálogo atual.',
    )
  }

  if (url) {
    reasons.push(
      'Possui endereço para continuar a análise.',
    )
  } else {
    reasons.push(
      'Não possui URL disponível.',
    )
  }

  if (requiresSignup) {
    reasons.push(
      'Pode exigir cadastro do usuário.',
    )
  }

  if (requiresUserAction) {
    reasons.push(
      'Exige ação humana e não deve ser executada fingindo identidade.',
    )
  }

  const automatedPreparation =
    categoryAllowed &&
    Boolean(url)

  const manualActionRequired =
    requiresUserAction ||
    requiresSignup

  return {
    id:
      opportunity.id ?? null,

    title,

    source,

    category,

    priority,

    confidence,

    url:
      url || null,

    requiresSignup,

    requiresUserAction,

    automatedPreparation,

    manualActionRequired,

    estimatedValueIsMoney:
      false,

    paymentConfirmed:
      false,

    canRegisterEarning:
      false,

    reasons,

    nextAction:
      manualActionRequired
        ? 'Encaminhar o usuário para a fonte oficial e aguardar a ação humana.'
        : 'Preparar a oportunidade para análise posterior.',

    safety: {
      usesPassword:
        false,

      usesCpf:
        false,

      usesCard:
        false,

      usesTwoFactorCode:
        false,

      impersonatesUser:
        false,
    },
  }
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as OpportunityInput

    if (
      !body ||
      typeof body !== 'object'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Oportunidade inválida.',
        },
        {
          status: 400,
        },
      )
    }

    const analysis =
      analyzeOpportunity(body)

    return NextResponse.json({
      success: true,

      analysis,

      rules: {
        opportunityIsNotMoney:
          true,

        estimatedValuesAreNotMoney:
          true,

        onlyConfirmedEarnings:
          true,

        identityActionsRequireUser:
          true,

        automaticSignup:
          false,

        automaticIdentityUse:
          false,
      },
    })
  } catch (error) {
    console.error(
      'Erro ao analisar oportunidade:',
      error,
    )

    return NextResponse.json(
      {
        success: false,
        error:
          'Não foi possível analisar a oportunidade.',
      },
      {
        status: 500,
      },
    )
  }
}
