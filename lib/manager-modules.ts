export type ManagerModuleName =
  | 'radar'
  | 'avaliador'
  | 'risco'
  | 'financeiro'
  | 'publicador'
  | 'vendedor'
  | 'entrega'

export type OpportunityPriority = 'low' | 'medium' | 'high'

export type OpportunityInput = {
  title: string
  url: string
  description?: string
  estimatedValue?: number
  category?: string
  confidence?: number
}

export type ModuleResult = {
  module: ManagerModuleName
  approved: boolean
  reason: string
  nextAction?: string
  scoreImpact?: number
  blocked?: boolean
  requiresHumanAction?: boolean
}

export type OpportunityAssessment = {
  score: number
  priority: OpportunityPriority
  blocked: boolean
  requiresHumanAction: boolean
  summary: string
  route: 'blocked' | 'human_review' | 'prepare' | 'monitor'
  blockedBy: ManagerModuleName[]
  modules: ModuleResult[]
}

const clampScore = (value: number) =>
  Math.min(100, Math.max(0, Math.round(value)))

function hasSensitiveFlow(text: string) {
  return /senha|password|cartão|card|pix|cripto|crypto|identidade|identity|documento|cpf|cnpj|pague para receber|depósito antecipado/i.test(text)
}

const contentUrlSignals = [
  'blog',
  'article',
  'articles',
  'guide',
  'guides',
  'how-to',
  'howto',
  'explained',
  'news',
  'resources',
  'tips',
  'what-is',
  'what-are',
  'reviews',
  'comparison',
]

const contentTitleSignals = [
  'how to',
  'what is',
  'what are',
  'best ways',
  'ultimate guide',
  'everything you need to know',
  'commission structure',
  'tips and tricks',
  'learn more about',
  'ways to make money',
  'how to make money',
]

const concreteOpportunitySignals = [
  'apply now',
  'sign up',
  'signup',
  'register now',
  'join now',
  'become a tester',
  'become an affiliate',
  'become a partner',
  'start earning',
  'get paid',
  'paid survey',
  'paid research',
  'paid study',
  'paid test',
  'remote job',
  'freelance job',
  'microtask',
  'affiliate program',
  'referral program',
]

function containsAny(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(signal))
}

export function isInformationalContent(input: Pick<OpportunityInput, 'title' | 'url' | 'description'>) {
  const title = input.title.toLowerCase()
  const url = input.url.toLowerCase()
  const description = (input.description ?? '').toLowerCase()
  const text = `${title} ${description}`
  const hasContentSignal =
    containsAny(url, contentUrlSignals) ||
    containsAny(title, contentTitleSignals)

  return hasContentSignal && !containsAny(text, concreteOpportunitySignals)
}

export function radar(input: OpportunityInput): ModuleResult {
  const hasBasicData = Boolean(input.url && input.title)
  const clarityScore = input.description ? 10 : 0
  const informationalContent = isInformationalContent(input)

  if (informationalContent) {
    return {
      module: 'radar',
      approved: false,
      reason: 'Página classificada como conteúdo informativo, não como oportunidade concreta de trabalho ou renda.',
      nextAction: 'Descartar do catálogo e continuar procurando uma página acionável.',
      scoreImpact: -30,
      blocked: false,
      requiresHumanAction: false,
    }
  }

  return {
    module: 'radar',
    approved: hasBasicData,
    reason: hasBasicData
      ? 'Oportunidade localizada com dados mínimos para análise.'
      : 'Faltam título e/ou URL para validar a oportunidade.',
    nextAction: hasBasicData ? 'Enviar para o Avaliador.' : 'Coletar dados mínimos da oportunidade.',
    scoreImpact: hasBasicData ? 10 + clarityScore : -10,
    blocked: false,
    requiresHumanAction: false,
  }
}

export function avaliador(input: OpportunityInput): ModuleResult {
  const text = `${input.title} ${input.description ?? ''} ${input.category ?? ''}`.toLowerCase()
  const hasWorkSignal = /trabalho|task|tarefa|survey|pesquisa|teste|freelance|serviço|service|job|microtask|gig|gigwork/.test(text)
  const hasPaymentSignal = /paid|pago|pagamento|reward|recompensa|earn|ganhe|dollar|dólar|usd|\$/.test(text) || Number(input.estimatedValue ?? 0) > 0
  const hasConcreteAction = containsAny(text, concreteOpportunitySignals)
  const hasClearTask = Boolean(input.title && input.description)
  const approved = hasWorkSignal && hasPaymentSignal && hasConcreteAction && !isInformationalContent(input)

  return {
    module: 'avaliador',
    approved,
    reason: approved
      ? 'Há sinais concretos de ação, trabalho e remuneração.'
      : 'Sinais insuficientes para aprovação automática.',
    nextAction: hasWorkSignal && hasPaymentSignal ? 'Enviar para o Risco.' : 'Revisar clareza da tarefa e remuneração.',
    scoreImpact: approved ? 25 + (hasClearTask ? 10 : 0) : -15,
    blocked: false,
    requiresHumanAction: false,
  }
}

export function risco(input: OpportunityInput): ModuleResult {
  const text = `${input.title} ${input.description ?? ''}`.toLowerCase()
  const suspicious = hasSensitiveFlow(text)
  const informationalContent = isInformationalContent(input)
  const needsHumanAction = /captcha|verificação|identity|identidade|cadastro|login|senha|documento|autenticação|kYC/.test(text)

  return {
    module: 'risco',
    approved: !suspicious && !informationalContent,
    reason: suspicious
      ? 'Risco detectado: exige ação financeira, credencial ou dado sensível.'
      : informationalContent
        ? 'Página informativa sem fluxo concreto de participação; não deve entrar no fluxo de execução.'
      : 'Nenhum sinal básico de risco bloqueante encontrado.',
    nextAction: suspicious
      ? 'Enviar para revisão humana.'
      : informationalContent
        ? 'Descartar e manter o Radar procurando oportunidades acionáveis.'
        : 'Enviar para o Financeiro.',
    scoreImpact: suspicious ? -35 : informationalContent ? -20 : 15,
    blocked: suspicious || informationalContent,
    requiresHumanAction: Boolean(needsHumanAction),
  }
}

export function financeiro(input: OpportunityInput): ModuleResult {
  const estimatedValue = Number(input.estimatedValue ?? 0)
  const isPositiveEstimate = estimatedValue > 0

  return {
    module: 'financeiro',
    approved: true,
    reason: isPositiveEstimate
      ? 'Valor estimado registrado apenas como referência de potencial; não altera o saldo de ganhos.'
      : 'Sem valor estimado informado; o agente mantém o saldo de ganhos inalterado.',
    nextAction: 'Prosseguir sem alterar saldo de ganhos. Só ganhos confirmados afetam o financeiro.',
    scoreImpact: isPositiveEstimate ? 10 : 5,
    blocked: false,
    requiresHumanAction: false,
  }
}

export function publicador(input: OpportunityInput): ModuleResult {
  const validChannel = Boolean(input.url) && !hasSensitiveFlow(`${input.title} ${input.description ?? ''}`)

  return {
    module: 'publicador',
    approved: validChannel,
    reason: validChannel
      ? 'Publicação somente em canal autorizado e com informações verdadeiras.'
      : 'Canal ou conteúdo exige revisão antes da publicação.',
    nextAction: validChannel ? 'Preparar conteúdo de publicação.' : 'Revisar conteúdo antes de publicar.',
    scoreImpact: validChannel ? 8 : -5,
    blocked: false,
    requiresHumanAction: false,
  }
}

export function vendedor(input: OpportunityInput): ModuleResult {
  const hasCommercialIntent = /oferta|proposta|trabalho|remuneração|pagamento|compra|serviço|venda/.test(
    `${input.title} ${input.description ?? ''}`.toLowerCase(),
  )

  return {
    module: 'vendedor',
    approved: true,
    reason: hasCommercialIntent
      ? 'Há intenção comercial suficiente para preparar uma abordagem segura.'
      : 'Preparar abordagem sem inventar resultados, clientes ou ganhos.',
    nextAction: 'Preparar proposta ou contato autorizado.',
    scoreImpact: hasCommercialIntent ? 10 : 5,
    blocked: false,
    requiresHumanAction: false,
  }
}

export function entrega(input: OpportunityInput): ModuleResult {
  const needsHumanAction = /senha|login|documento|identidade|autenticação|cadastro|cartão|pix|pagamento/.test(
    `${input.title} ${input.description ?? ''}`.toLowerCase(),
  )

  return {
    module: 'entrega',
    approved: !needsHumanAction,
    reason: needsHumanAction
      ? 'A entrega exige ação humana e não deve ser automatizada para dados sensíveis.'
      : 'Organizar execução e acompanhamento da tarefa com segurança.',
    nextAction: needsHumanAction ? 'Solicitar confirmação humana para a etapa sensível.' : 'Acompanhar entrega e aguardar confirmação real.',
    scoreImpact: needsHumanAction ? -10 : 10,
    blocked: false,
    requiresHumanAction: needsHumanAction,
  }
}

export function runManagerModules(input: OpportunityInput): ModuleResult[] {
  return [
    radar(input),
    avaliador(input),
    risco(input),
    financeiro(input),
    publicador(input),
    vendedor(input),
    entrega(input),
  ]
}

export function assessOpportunity(input: OpportunityInput): OpportunityAssessment {
  const results = runManagerModules(input)
  const baseline = 30
  const confidenceImpact = Math.round((Number(input.confidence ?? 0) - 50) / 5)

  const score = clampScore(
    baseline +
      confidenceImpact +
      results.reduce((total, result) => total + (result.scoreImpact ?? 0), 0),
  )

  const blocked = results.some((result) => result.blocked)
  const requiresHumanAction = results.some((result) => result.requiresHumanAction)
  const blockedBy = results
    .filter((result) => result.blocked)
    .map((result) => result.module)

  const priority: OpportunityPriority =
    blocked
      ? 'low'
      : score >= 75
        ? 'high'
        : score >= 45
          ? 'medium'
          : 'low'

  const summary = blocked
    ? 'Oportunidade bloqueada por risco ou ação sensível.'
    : priority === 'high'
      ? 'Alta prioridade: potencial promissor com risco controlado.'
      : priority === 'medium'
        ? 'Prioridade média: potencial relevante, mas com revisão necessária.'
        : 'Baixa prioridade: potencial limitado, risco alto ou clareza insuficiente.'

  const route = blocked
    ? 'blocked'
    : requiresHumanAction
      ? 'human_review'
      : priority === 'high'
        ? 'prepare'
        : 'monitor'

  return {
    score,
    priority,
    blocked,
    requiresHumanAction,
    summary,
    route,
    blockedBy,
    modules: results,
  }
}
