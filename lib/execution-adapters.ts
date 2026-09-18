import type { OpportunityCategory } from './opportunity-catalog'

/*
 * ==========================================
 * EXECUTION ADAPTERS
 * ==========================================
 *
 * Cada canal monetizável (afiliados, vendas, serviços, conteúdo,
 * microtarefas, pesquisas, testes, freelance) tem uma forma real e
 * diferente de gerar renda. Um adapter apenas classifica qual é a
 * ação concreta possível para aquela oportunidade — a execução real
 * (Browserbase/Playwright) continua isolada por oportunidade: uma
 * falha em um adapter/canal nunca derruba os demais, porque cada
 * chamada roda isoladamente dentro do pool do Worker (ver
 * lib/worker-cycle.ts).
 *
 * NENHUM adapter confirma pagamento. Ganho confirmado só existe via
 * /api/earnings (ver lib/execution-engine.ts e app/api/earnings).
 */

export type ActionType =
  | 'api'
  | 'form'
  | 'publish'
  | 'offer'
  | 'material'
  | 'commission'
  | 'confirm'
  | 'inspect'

export type AdapterInput = {
  category?: OpportunityCategory | string
  title: string
  description?: string
  url?: string
}

export type ExecutionAdapter = {
  channel: OpportunityCategory | 'other'
  determineAction: (input: AdapterInput) => ActionType
  describeAction: (action: ActionType) => string
}

function text(input: AdapterInput) {
  return `${input.title} ${input.description ?? ''}`.toLowerCase()
}

const HAS_OFFICIAL_API = /\/api\/|developer\.|api docs|rest api|graphql/i

const actionDescriptions: Record<ActionType, string> = {
  api: 'Integração via API oficial da plataforma, quando as credenciais existirem.',
  form: 'Preenchimento e envio de formulário seguro com dados já autorizados pelo operador.',
  publish: 'Publicação de conteúdo/material em canal autorizado.',
  offer: 'Criação ou gestão de uma oferta/anúncio de serviço ou venda.',
  material: 'Geração do material necessário (texto, mídia, proposta) antes do envio.',
  commission: 'Acompanhamento de comissão/afiliado até a confirmação do resultado.',
  confirm: 'Confirmação de resultado de uma etapa já enviada anteriormente.',
  inspect: 'Apenas inspeção da fonte oficial, sem ação automatizável identificada ainda.',
}

/*
 * Mapa channel -> ação padrão quando não há sinal mais específico.
 * Reflete a natureza real de cada canal, não apenas "abrir a página".
 */
const CHANNEL_DEFAULT_ACTION: Record<string, ActionType> = {
  affiliate: 'commission',
  sales: 'offer',
  services: 'offer',
  content: 'publish',
  microtasks: 'form',
  surveys: 'form',
  testing: 'form',
  freelance: 'material',
  other: 'inspect',
}

function determineAction(input: AdapterInput): ActionType {
  const value = text(input)
  const channel = String(input.category ?? 'other')

  if (input.url && HAS_OFFICIAL_API.test(input.url) || HAS_OFFICIAL_API.test(value)) {
    return 'api'
  }

  if (/already applied|already submitted|já enviado|em análise|under review/.test(value)) {
    return 'confirm'
  }

  return CHANNEL_DEFAULT_ACTION[channel] ?? 'inspect'
}

export function resolveAdapter(category?: OpportunityCategory | string): ExecutionAdapter {
  const channel = (category ?? 'other') as OpportunityCategory | 'other'

  return {
    channel,
    determineAction,
    describeAction: (action: ActionType) => actionDescriptions[action],
  }
}

export function classifyExecutionAction(input: AdapterInput): { actionType: ActionType; description: string } {
  const adapter = resolveAdapter(input.category)
  const actionType = adapter.determineAction(input)
  return { actionType, description: adapter.describeAction(actionType) }
}
