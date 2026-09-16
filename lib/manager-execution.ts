import { assessOpportunity, runManagerModules, type OpportunityInput } from './manager-modules.ts'
import { decideManagerAction, type ManagerDecisionResult } from './manager-decision.ts'
import { createExecution, type ExecutionRecord } from './execution-engine.ts'

export type ManagerExecutionInput = OpportunityInput & {
  id: string
}

export type ManagerExecutionPlan = {
  opportunity: ManagerExecutionInput
  modules: ReturnType<typeof runManagerModules>
  assessment: ReturnType<typeof assessOpportunity>
  decision: ManagerDecisionResult
  execution: ExecutionRecord
}

export function planManagerExecution(opportunity: ManagerExecutionInput): ManagerExecutionPlan {
  const modules = runManagerModules(opportunity)
  const assessment = assessOpportunity(opportunity)
  const decision = decideManagerAction(modules, {
    score: assessment.score,
    priority: assessment.priority,
  })
  const execution = createExecution({
    id: `execution-${opportunity.id}`,
    opportunity,
    modules,
    decision,
  })

  return { opportunity, modules, assessment, decision, execution }
}

export function executionNextStep(execution: ExecutionRecord) {
  if (execution.state === 'waiting_human') {
    return execution.intervention?.action ?? 'Aguardando ação humana na fonte oficial.'
  }
  if (execution.state === 'blocked') {
    return `Oportunidade bloqueada pelo Gerente. ${execution.error ?? 'Não executar.'}`
  }
  if (execution.state === 'failed') {
    return execution.error ?? 'Revisar a falha antes de qualquer nova tentativa.'
  }
  if (execution.state === 'completed') {
    return 'Preparação segura concluída. Nenhum ganho foi confirmado.'
  }
  if (execution.state === 'running') {
    return 'Worker inspecionando a fonte oficial sem executar ações sensíveis.'
  }
  return 'Aguardando o Worker iniciar a preparação autorizada.'
}
