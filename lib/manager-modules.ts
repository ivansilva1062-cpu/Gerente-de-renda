 export type ManagerModuleName =
  | 'radar'
  | 'avaliador'
  | 'risco'
  | 'financeiro'
  | 'publicador'
  | 'vendedor'
  | 'entrega'

export type OpportunityInput = {
  title: string
  url: string
  description?: string
  estimatedValue?: number
}

export type ModuleResult = {
  module: ManagerModuleName
  approved: boolean
  reason: string
  nextAction?: string
}

export function radar(input: OpportunityInput): ModuleResult {
  return {
    module: 'radar',
    approved: Boolean(input.url && input.title),
    reason: 'Oportunidade localizada para análise.',
    nextAction: 'Enviar para o Avaliador.',
  }
}

export function avaliador(input: OpportunityInput): ModuleResult {
  const text = `${input.title} ${input.description ?? ''}`.toLowerCase()
  const hasWorkSignal = /trabalho|task|tarefa|survey|pesquisa|teste|freelance|serviço|service|job/.test(text)
  const hasPaymentSignal = /paid|pago|pagamento|reward|recompensa|earn|ganhe|dollar|dólar|usd|\$/.test(text)

  return {
    module: 'avaliador',
    approved: hasWorkSignal && hasPaymentSignal,
    reason: hasWorkSignal && hasPaymentSignal
      ? 'Há sinais de trabalho e remuneração.'
      : 'Sinais insuficientes para aprovação automática.',
    nextAction: 'Enviar para o Risco.',
  }
}

export function risco(input: OpportunityInput): ModuleResult {
  const suspicious = /senha|password|cartão|card|pix|cripto|crypto|depósito antecipado|pague para receber/.test(
    `${input.title} ${input.description ?? ''}`.toLowerCase(),
  )

  return {
    module: 'risco',
    approved: !suspicious,
    reason: suspicious
      ? 'Risco detectado: exige ação financeira ou credencial sensível.'
      : 'Nenhum sinal básico de risco bloqueante encontrado.',
    nextAction: suspicious ? 'Enviar para revisão humana.' : 'Enviar para o Financeiro.',
  }
}

export function financeiro(input: OpportunityInput): ModuleResult {
  return {
    module: 'financeiro',
    approved: true,
    reason: 'Valor estimado registrado apenas como estimativa; não representa dinheiro recebido.',
    nextAction: 'Prosseguir sem alterar saldo de ganhos.',
  }
}

export function publicador(input: OpportunityInput): ModuleResult {
  return {
    module: 'publicador',
    approved: true,
    reason: 'Publicação somente em canal autorizado e com informações verdadeiras.',
    nextAction: 'Preparar conteúdo de publicação.',
  }
}

export function vendedor(input: OpportunityInput): ModuleResult {
  return {
    module: 'vendedor',
    approved: true,
    reason: 'Preparar abordagem comercial sem inventar resultados, clientes ou ganhos.',
    nextAction: 'Preparar proposta ou contato autorizado.',
  }
}

export function entrega(input: OpportunityInput): ModuleResult {
  return {
    module: 'entrega',
    approved: true,
    reason: 'Organizar execução e acompanhamento da tarefa.',
    nextAction: 'Acompanhar entrega e aguardar confirmação real.',
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
