import type {
  ModuleResult,
  OpportunityPriority,
} from '@/lib/manager-modules'

export type ManagerDecision =
  | 'block'
  | 'human_review'
  | 'prepare'
  | 'monitor'

export type ManagerDecisionContext = {
  score?: number
  priority?: OpportunityPriority
  humanActionRequired?: boolean
}

export type ManagerDecisionResult = {
  decision: ManagerDecision
  reason: string
  nextAction: string
  blockedBy: ModuleResult['module'][]
  requiresHumanAction: boolean
  estimatedValuesAreNotEarnings: true
  sensitiveActionsRequireHuman: true
}

export function decideManagerAction(
  modules: ModuleResult[],
  context: ManagerDecisionContext = {},
): ManagerDecisionResult {
  const blockedBy = modules
    .filter((module) => module.blocked)
    .map((module) => module.module)
  const requiresHumanAction =
    Boolean(context.humanActionRequired) ||
    modules.some((module) => module.requiresHumanAction)

  if (blockedBy.length > 0) {
    return {
      decision: 'block',
      reason: 'A oportunidade exige credencial, identidade, pagamento ou outro dado sensível.',
      nextAction: 'Não executar ações externas; encaminhar para revisão humana.',
      blockedBy,
      requiresHumanAction,
      estimatedValuesAreNotEarnings: true,
      sensitiveActionsRequireHuman: true,
    }
  }

  if (requiresHumanAction) {
    return {
      decision: 'human_review',
      reason: 'A oportunidade possui uma etapa que depende de decisão ou intervenção humana.',
      nextAction: 'Aguardar intervenção humana sem enviar credenciais, identidade, cartão ou confirmação de pagamento.',
      blockedBy,
      requiresHumanAction: true,
      estimatedValuesAreNotEarnings: true,
      sensitiveActionsRequireHuman: true,
    }
  }

  const evaluator = modules.find((module) => module.module === 'avaliador')

  if (evaluator && !evaluator.approved) {
    return {
      decision: 'monitor',
      reason: 'O Avaliador não encontrou evidência suficiente de retorno, acessibilidade ou ação concreta.',
      nextAction: 'Continuar monitorando sem preparar a oportunidade até haver evidência verificável.',
      blockedBy,
      requiresHumanAction: false,
      estimatedValuesAreNotEarnings: true,
      sensitiveActionsRequireHuman: true,
    }
  }

  const isReadyToPrepare =
    context.priority === 'high' ||
    Number(context.score ?? 0) >= 75

  return {
    decision: isReadyToPrepare ? 'prepare' : 'monitor',
    reason: isReadyToPrepare
      ? 'Os módulos aprovam a preparação segura da oportunidade, sem concluir ações sensíveis.'
      : 'A oportunidade pode ser acompanhada, mas ainda não há base suficiente para preparação automática.',
    nextAction: isReadyToPrepare
      ? 'Preparar o próximo passo sem alterar ganhos nem executar ações sensíveis.'
      : 'Monitorar a oportunidade e aguardar sinais ou confirmação adicional.',
    blockedBy,
    requiresHumanAction: false,
    estimatedValuesAreNotEarnings: true,
    sensitiveActionsRequireHuman: true,
  }
}