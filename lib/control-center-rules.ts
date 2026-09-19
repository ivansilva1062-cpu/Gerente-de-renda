/*
 * ==========================================
 * REGRAS PURAS DA CENTRAL DE CONTROLE
 * ==========================================
 *
 * Sem import de banco de propósito: permite testar as regras de
 * limite diário, categoria bloqueada e aprovação manual isoladamente
 * (ver lib/control-center.test.ts), do mesmo jeito que
 * lib/execution-engine.ts fica separado de lib/execution-store.ts.
 */

export type ControlCenterLimits = {
  dailyActionLimit: number | null
  blockedCategories: string[]
  requiresApprovalAboveUsd: number | null
}

export function canStartMoreActions(settings: Pick<ControlCenterLimits, 'dailyActionLimit'>, actionsStartedToday: number) {
  if (settings.dailyActionLimit == null) return true
  return actionsStartedToday < settings.dailyActionLimit
}

/*
 * Uma categoria bloqueada pela Central de Controle nunca chega a
 * ser executada, independente do score do Gerente.
 */
export function isCategoryBlocked(settings: Pick<ControlCenterLimits, 'blockedCategories'>, category?: string | null) {
  if (!category) return false
  return settings.blockedCategories.includes(category)
}

/*
 * Valor acima do limite de aprovação automática sempre exige
 * confirmação humana, mesmo que todos os outros módulos tenham
 * aprovado a oportunidade.
 */
export function requiresManualApproval(
  settings: Pick<ControlCenterLimits, 'requiresApprovalAboveUsd'>,
  estimatedValue: number,
) {
  if (settings.requiresApprovalAboveUsd == null) return false
  return estimatedValue > settings.requiresApprovalAboveUsd
}
