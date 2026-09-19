import type { ManagerDecisionResult } from './manager-decision'
import type { ModuleResult, OpportunityInput } from './manager-modules'

export type ExecutionState =
  | 'queued'
  | 'running'
  | 'waiting_human'
  | 'waiting_external'
  | 'completed'
  | 'blocked'
  | 'failed'

export type ExecutionLifecycleState =
  | 'DISCOVERED'
  | 'VALIDATED'
  | 'READY'
  | 'ACTION_REQUIRED'
  | 'RUNNING'
  | 'WAITING_EXTERNAL'
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
  /*
   * Tentativa atual (1 na primeira execução). Persistido no banco
   * para permitir retry com backoff entre ciclos do Worker.
   */
  attempt: number
  /*
   * Quando definido, o candidato só volta a ser elegível para o
   * ciclo do Worker depois deste horário (backoff de falhas).
   */
  nextAttemptAt?: string
  /*
   * Tipo de ação real identificado pelo execution adapter do canal
   * (ver lib/execution-adapters.ts). Não substitui `action`, que é
   * o estágio genérico (inspect/prepare) do Execution Engine.
   */
  actionType?: string
}

export type ExecutionContext = {
  id: string
  opportunity: OpportunityInput
  decision: ManagerDecisionResult
  modules: ModuleResult[]
  now?: string
  /*
   * Número da tentativa atual. Quem chama `createExecution` é
   * responsável por consultar a tentativa anterior no banco
   * (ver lib/execution-store.ts) e incrementar ao reprocessar.
   */
  attempt?: number
}

const SENSITIVE_ACTION = /senha|password|credential|credencial|identity|identidade|kyc|documento|document|cpf|cnpj|cart[aã]o|card|pix|saque|withdraw|wallet|carteira|captcha|autentica[cç][aã]o|verification|verifica[cç][aã]o/i

export function isSensitiveAction(value: string) {
  return SENSITIVE_ACTION.test(value)
}

export function sensitiveActionReason(opportunity: Pick<OpportunityInput, 'title' | 'description' | 'actionRequired'>) {
  const text = `${opportunity.title} ${opportunity.description ?? ''} ${opportunity.actionRequired ?? ''}`

  if (isSensitiveAction(text)) {
    return 'A próxima etapa exige identidade, credencial, documento, cartão, Pix, CAPTCHA ou outra ação sensível que não pode ser automatizada.'
  }

  return null
}

function timestamp(now?: string) {
  return now ?? new Date().toISOString()
}

/*
 * ==========================================
 * BACKOFF DE RETENTATIVAS
 * ==========================================
 *
 * Backoff exponencial com teto, para que falhas transitórias não
 * fiquem retentando a cada ciclo nem fiquem paradas para sempre.
 * attempt 1 -> 1min, 2 -> 2min, 3 -> 4min ... teto de 30min.
 */
const BASE_BACKOFF_MS = 60_000
const MAX_BACKOFF_MS = 30 * 60_000

export function computeBackoffMs(attempt: number) {
  const safeAttempt = Math.max(1, Math.floor(attempt))
  const backoff = BASE_BACKOFF_MS * 2 ** (safeAttempt - 1)
  return Math.min(backoff, MAX_BACKOFF_MS)
}

function lifecycleForState(state: ExecutionState): ExecutionLifecycleState {
  switch (state) {
    case 'queued':
      return 'READY'
    case 'running':
      return 'RUNNING'
    case 'waiting_human':
      return 'ACTION_REQUIRED'
    case 'waiting_external':
      return 'WAITING_EXTERNAL'
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
  const attempt = Math.max(1, Math.floor(context.attempt ?? 1))
  const evaluator = context.modules.find((module) => module.module === 'avaliador')
  const risk = context.modules.find((module) => module.module === 'risco')
  const delivery = context.modules.find((module) => module.module === 'entrega')
  const reason = sensitiveActionReason(context.opportunity)

  /* Bloqueios são terminais apenas quando sinalizados como tal pelo módulo. */
  if (
    context.modules.some((module) => module.blocked) ||
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
      attempt,
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
      attempt,
      intervention: {
        required: true,
        reason,
        action: 'A pessoa responsável deve executar ou autorizar essa etapa na fonte oficial. O agente não enviará dados nem confirmará pagamento.',
        url: context.opportunity.url,
      },
    }
  }

  if (evaluator?.approved === false) {
    return {
      id: context.id,
      opportunity: context.opportunity,
      state: 'waiting_human',
      lifecycleState: 'ACTION_REQUIRED',
      action: 'inspect',
      createdAt: now,
      updatedAt: now,
      attempt,
      intervention: {
        required: true,
        reason: evaluator.reason,
        action: 'Revisar a evidência de remuneração, ação e acessibilidade antes de autorizar qualquer preparação. O agente não executará ações externas.',
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
    attempt,
  }
}

const transitions: Record<ExecutionState, ExecutionState[]> = {
  queued: ['running', 'waiting_human', 'blocked', 'failed'],
  running: ['completed', 'waiting_human', 'waiting_external', 'blocked', 'failed'],
  waiting_human: ['queued', 'running', 'blocked', 'failed'],
  waiting_external: ['queued', 'running', 'completed', 'blocked', 'failed'],
  completed: [],
  blocked: [],
  failed: [],
}

export function transitionExecution(
  execution: ExecutionRecord,
  nextState: ExecutionState,
  details: Partial<Pick<ExecutionRecord, 'intervention' | 'error' | 'evidence' | 'attempt' | 'nextAttemptAt' | 'actionType'>> = {},
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

export function finalizeBrowserAction(
  execution: ExecutionRecord,
  actionConfirmed: boolean,
  evidence: string,
) {
  if (!actionConfirmed) {
    return transitionExecution(execution, 'blocked', {
      error: 'Nenhuma ação externa foi executada e confirmada pela fonte oficial.',
      evidence,
    })
  }

  return transitionExecution(execution, 'completed', { evidence })
}

/*
 * Marca a próxima tentativa (backoff) de uma execução que falhou,
 * sem alterar o estado — quem seleciona candidatos do ciclo do
 * Worker deve respeitar `nextAttemptAt` antes de reprocessar.
 */
export function scheduleRetry(execution: ExecutionRecord, now?: string): ExecutionRecord {
  const nextAttempt = execution.attempt + 1
  const delay = computeBackoffMs(nextAttempt)
  const base = timestamp(now)
  return {
    ...execution,
    attempt: nextAttempt,
    nextAttemptAt: new Date(new Date(base).getTime() + delay).toISOString(),
  }
}

export type ExecutionSummary = {
  queued: number
  running: number
  waiting_human: number
  waiting_external: number
  completed: number
  blocked: number
  failed: number
}

export function summarizeExecutionStates(states: Array<Pick<ExecutionRecord, 'state'>>): ExecutionSummary {
  const summary: ExecutionSummary = {
    queued: 0,
    running: 0,
    waiting_human: 0,
    waiting_external: 0,
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

/*
 * ==========================================
 * CLASSIFICAÇÃO REAL DA OPORTUNIDADE
 * ==========================================
 *
 * Fonte única de verdade sobre a situação real
 * de uma oportunidade, usada tanto pelas rotas
 * de API quanto pelo painel. GANHO_CONFIRMADO
 * não é derivado do estado de execução: só existe
 * quando há um registro real em /api/earnings.
 */
export type OpportunityClassification =
  | 'EXECUTAVEL_AUTOMATICAMENTE'
  | 'MONITORAMENTO'
  | 'AGUARDANDO_EXTERNO'
  | 'AGUARDANDO_USUARIO'
  | 'CONCLUIDA'

export function classifyExecutionState(state: ExecutionState): OpportunityClassification {
  switch (state) {
    case 'queued':
    case 'running':
      return 'EXECUTAVEL_AUTOMATICAMENTE'
    case 'waiting_human':
      return 'AGUARDANDO_USUARIO'
    case 'waiting_external':
      return 'AGUARDANDO_EXTERNO'
    case 'completed':
      return 'CONCLUIDA'
    case 'blocked':
    case 'failed':
      return 'MONITORAMENTO'
  }
}
