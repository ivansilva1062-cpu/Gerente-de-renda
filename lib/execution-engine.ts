import type { ManagerDecisionResult } from './manager-decision'
import type { ModuleResult, OpportunityInput } from './manager-modules'

export type ExecutionState =
  | 'queued'
  | 'running'
  | 'waiting_human'
  | 'completed'
  | 'blocked'
  | 'failed'

export type ExecutionLifecycleState =
  | 'DISCOVERED'
  | 'VALIDATED'
  | 'READY'
  | 'ACTION_REQUIRED'
  | 'RUNNING'
  | 'WAITING_PAYMENT'
  | 'PAID'
  | 'FAILED'
  | 'REJECTED'

export type HumanIntervention = {
  required: true
  reason: string
  action: string
  url?: string
}

export type ExecutionRecord = {
  id: string
  opportunity: OpportunityInput
  state: ExecutionState
  lifecycleState: ExecutionLifecycleState
  action: 'inspect' | 'prepare'
  createdAt: string
  updatedAt: string
  intervention?: HumanIntervention
  error?: string
  evidence?: string
}

export type ExecutionContext = {
  id: string
  opportunity: OpportunityInput
  decision: ManagerDecisionResult
  modules: ModuleResult[]
  now?: string
}

const SENSITIVE_ACTION = /login|log in|sign in|senha|password|credential|credencial|cadastro|register|sign up|signup|identity|identidade|kyc|documento|document|cpf|cnpj|cart[aã]o|card|pagamento|payment|pay to|pix|saque|withdraw|wallet|carteira|captcha|autentica[cç][aã]o|verification|verifica[cç][aã]o|apply now|submit application|complete your profile|take the test|complete the test|complete the survey|participate in the study|accept the task|claim task|payout/i

export function isSensitiveAction(value: string) {
  return SENSITIVE_ACTION.test(value)
}

export function sensitiveActionReason(opportunity: Pick<OpportunityInput, 'title' | 'description' | 'actionRequired'>) {
  const text = `${opportunity.title} ${opportunity.description ?? ''} ${opportunity.actionRequired ?? ''}`

  if (isSensitiveAction(text)) {
    return 'A próxima etapa exige login, cadastro, identidade, credencial, documento, pagamento ou outra ação sensível.'
  }

  return null
}

function timestamp(now?: string) {
  return now ?? new Date().toISOString()
}

function lifecycleForState(state: ExecutionState): ExecutionLifecycleState {
  switch (state) {
    case 'queued':
      return 'READY'
    case 'running':
      return 'RUNNING'
    case 'waiting_human':
      return 'ACTION_REQUIRED'
    case 'completed':
      return 'WAITING_PAYMENT'
    case 'blocked':
      return 'REJECTED'
    case 'failed':
      return 'FAILED'
  }
}

export function createExecution(context: ExecutionContext): ExecutionRecord {
  const now = timestamp(context.now)
  const evaluator = context.modules.find((module) => module.module === 'avaliador')
  const risk = context.modules.find((module) => module.module === 'risco')
  const delivery = context.modules.find((module) => module.module === 'entrega')
  const reason = sensitiveActionReason(context.opportunity)

  if (
    context.decision.decision !== 'prepare' ||
    context.modules.some((module) => module.blocked) ||
    evaluator?.approved === false ||
    risk?.approved === false ||
    delivery?.approved === false
  ) {
    return {
      id: context.id,
      opportunity: context.opportunity,
      state: 'blocked',
      lifecycleState: 'REJECTED',
      action: 'inspect',
      createdAt: now,
      updatedAt: now,
      error: 'A oportunidade não foi aprovada por todos os módulos necessários do Gerente.',
    }
  }

  if (reason) {
    return {
      id: context.id,
      opportunity: context.opportunity,
      state: 'waiting_human',
      lifecycleState: 'ACTION_REQUIRED',
      action: 'prepare',
      createdAt: now,
      updatedAt: now,
      intervention: {
        required: true,
        reason,
        action: 'A pessoa responsável deve executar ou autorizar essa etapa na fonte oficial. O agente não enviará dados nem confirmará pagamento.',
        url: context.opportunity.url,
      },
    }
  }

  return {
    id: context.id,
    opportunity: context.opportunity,
    state: 'queued',
    lifecycleState: 'READY',
    action: 'prepare',
    createdAt: now,
    updatedAt: now,
  }
}

const transitions: Record<ExecutionState, ExecutionState[]> = {
  queued: ['running', 'waiting_human', 'blocked', 'failed'],
  running: ['completed', 'waiting_human', 'blocked', 'failed'],
  waiting_human: ['queued', 'running', 'blocked', 'failed'],
  completed: [],
  blocked: [],
  failed: [],
}

export function transitionExecution(
  execution: ExecutionRecord,
  nextState: ExecutionState,
  details: Pick<ExecutionRecord, 'intervention' | 'error' | 'evidence'> = {},
  now?: string,
): ExecutionRecord {
  if (!transitions[execution.state].includes(nextState)) {
    throw new Error(`Transição inválida: ${execution.state} -> ${nextState}`)
  }

  return {
    ...execution,
    ...details,
    state: nextState,
    lifecycleState: lifecycleForState(nextState),
    updatedAt: timestamp(now),
  }
}

export type ExecutionSummary = {
  queued: number
  running: number
  waiting_human: number
  completed: number
  blocked: number
  failed: number
}

export function summarizeExecutionStates(states: Array<Pick<ExecutionRecord, 'state'>>): ExecutionSummary {
  const summary: ExecutionSummary = {
    queued: 0,
    running: 0,
    waiting_human: 0,
    completed: 0,
    blocked: 0,
    failed: 0,
  }

  for (const record of states) {
    if (record.state in summary) {
      summary[record.state as keyof ExecutionSummary] += 1
    }
  }

  return summary
}

export type QueueCandidate = {
  id: string
  status?: string
  managerScore?: number
  confidence?: number
  estimatedValue?: number
}

export function pickNextOpportunity(
  opportunities: QueueCandidate[],
  excludedIds: Iterable<string> = [],
) {
  const blocked = new Set(excludedIds)

  const next = opportunities
    .filter((opportunity) => opportunity.status !== 'running' && opportunity.status !== 'done')
    .filter((opportunity) => !blocked.has(opportunity.id))
    .sort((left, right) => {
      const scoreDiff = Number(right.managerScore ?? 0) - Number(left.managerScore ?? 0)
      if (scoreDiff !== 0) return scoreDiff
      const confidenceDiff = Number(right.confidence ?? 0) - Number(left.confidence ?? 0)
      if (confidenceDiff !== 0) return confidenceDiff
      return Number(right.estimatedValue ?? 0) - Number(left.estimatedValue ?? 0)
    })
    .at(0)

  return next ?? null
}
