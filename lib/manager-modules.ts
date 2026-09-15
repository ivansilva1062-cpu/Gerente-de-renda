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
  source?: string
  estimatedValue?: number
  category?: string
  confidence?: number
}

export type EvaluatorDetails = {
  score: number
  remuneration: 'verifiable' | 'indicative' | 'missing'
  action: 'clear' | 'human_required' | 'unclear'
  accessibility: 'open' | 'restricted' | 'unknown'
  effort: 'low' | 'medium' | 'high'
  returnLevel: 'low' | 'medium' | 'high'
  sourceQuality: 'official' | 'known' | 'unknown'
  riskSignals: string[]
}

export type ModuleResult = {
  module: ManagerModuleName
  approved: boolean
  reason: string
  nextAction?: string
  scoreImpact?: number
  blocked?: boolean
  requiresHumanAction?: boolean
  evaluation?: EvaluatorDetails
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
  'service request',
  'service provider',
  'sell products',
  'sales opportunity',
  'commissioned sales',
]

function containsAny(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(signal))
}

function countAny(text: string, signals: string[]) {
  return signals.filter((signal) => text.includes(signal)).length
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
  const hasWorkSignal = /trabalho|task|tarefa|survey|pesquisa|teste|freelance|serviço|service|job|microtask|gig|gigwork|venda|sales|sell|produto|product|affiliate|creator/.test(text)
  const hasPaymentSignal = /paid|pago|pagamento|reward|recompensa|earn|ganhe|dollar|dólar|usd|\$|compensation|salary|hourly rate|per task|per study|per test|per survey/.test(text)
  const hasConcreteAction = containsAny(text, concreteOpportunitySignals)
  const hasClearTask = Boolean(input.title && input.description)
  const remuneration = /per task|per study|per test|per survey|hourly rate|salary|compensation|paid \$|\$\s*\d|usd\s*\d|\d\s*usd/.test(text)
    ? 'verifiable'
    : hasPaymentSignal || Number(input.estimatedValue ?? 0) > 0
      ? 'indicative'
      : 'missing'
  const action = hasConcreteAction
    ? /captcha|identity|identidade|cadastro|login|senha|documento|autenticação|verification|verificação/.test(text)
      ? 'human_required'
      : 'clear'
    : 'unclear'
  const accessibility = !input.url
    ? 'unknown'
    : /invite only|invitation only|residents only|us only|uk only|available in|waitlist|lista de espera/.test(text)
      ? 'restricted'
      : 'open'
  const effort = countAny(text, ['qualification', 'qualify', 'training', 'multiple steps', 'long survey', 'interview', 'portfolio', 'teste técnico', 'technical test']) >= 2
    ? 'high'
    : countAny(text, ['survey', 'pesquisa', 'task', 'tarefa', 'test', 'teste', 'profile', 'cadastro']) >= 1
      ? 'medium'
      : 'low'
  const returnLevel = remuneration === 'verifiable' && Number(input.estimatedValue ?? 0) >= 50
    ? 'high'
    : remuneration === 'verifiable' || Number(input.estimatedValue ?? 0) > 0
      ? 'medium'
      : 'low'
  const sourceQuality = input.source && /\.(gov|edu)(\.|$)/i.test(input.source)
    ? 'official'
    : input.source || input.url.startsWith('https://')
      ? 'known'
      : 'unknown'
  const riskSignals = [
    /pague para receber|depósito antecipado|upfront fee|pay to apply/.test(text) ? 'cobrança antecipada' : '',
    /cripto|crypto|wallet|carteira/.test(text) ? 'fluxo cripto' : '',
    /senha|password|cartão|card|pix|documento|cpf|identity|identidade/.test(text) ? 'dado sensível' : '',
  ].filter(Boolean)
  const evaluationScore = Math.max(0, Math.min(100, Math.round(
    (hasWorkSignal ? 15 : 0) +
      (remuneration === 'verifiable' ? 25 : remuneration === 'indicative' ? 10 : 0) +
      (action === 'clear' ? 20 : action === 'human_required' ? 10 : 0) +
      (accessibility === 'open' ? 10 : accessibility === 'restricted' ? 3 : 0) +
      (returnLevel === 'high' ? 15 : returnLevel === 'medium' ? 8 : 2) +
      (effort === 'low' ? 10 : effort === 'medium' ? 6 : 2) +
      (sourceQuality === 'official' ? 5 : sourceQuality === 'known' ? 3 : 0) -
      riskSignals.length * 20,
  )))
  const evaluation: EvaluatorDetails = {
    score: evaluationScore,
    remuneration,
    action,
    accessibility,
    effort,
    returnLevel,
    sourceQuality,
    riskSignals,
  }
  const approved = hasWorkSignal &&
    remuneration !== 'missing' &&
    action !== 'unclear' &&
    accessibility !== 'restricted' &&
    evaluationScore >= 55 &&
    !isInformationalContent(input)

  return {
    module: 'avaliador',
    approved,
    reason: approved
      ? `Avaliação ${evaluationScore}/100: remuneração ${remuneration === 'verifiable' ? 'verificável' : 'indicada'}, retorno ${returnLevel} e esforço ${effort}.`
      : `Avaliação ${evaluationScore}/100: revisar remuneração, ação, acessibilidade, esforço/retorno ou fonte antes de preparar.`,
    nextAction: approved ? 'Enviar para o Risco.' : 'Manter em monitoramento; não preparar até melhorar a evidência.',
    scoreImpact: approved ? 25 + (hasClearTask ? 10 : 0) : -20,
    blocked: false,
    requiresHumanAction: action === 'human_required',
    evaluation,
  }
}

export function risco(input: OpportunityInput): ModuleResult {
  const text = `${input.title} ${input.description ?? ''}`.toLowerCase()
  const suspicious = hasSensitiveFlow(text)
  const informationalContent = isInformationalContent(input)
  const needsHumanAction = /captcha|verificação|identity|identidade|cadastro|login|senha|documento|autenticação|kyc/.test(text)

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
