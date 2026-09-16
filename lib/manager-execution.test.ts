import assert from 'node:assert/strict'
import test from 'node:test'
import { executionNextStep, planManagerExecution } from './manager-execution.ts'

const safeOpportunity = {
  id: 'safe-1',
  title: 'Paid freelance project',
  url: 'https://work.example.com/project',
  description: 'Get paid $80 per project with a clear remote service request.',
  source: 'work.example.com',
  category: 'freelance',
  estimatedValue: 80,
  confidence: 100,
}

test('integra oportunidade aprovada à fila do Execution Engine', () => {
  const plan = planManagerExecution(safeOpportunity)

  assert.equal(plan.decision.decision, 'prepare')
  assert.equal(plan.execution.state, 'queued')
  assert.match(executionNextStep(plan.execution), /Worker/)
  assert.equal(plan.execution.opportunity.estimatedValue, 80)
})

test('bloqueia oportunidade rejeitada pelo Risco antes de executar', () => {
  const plan = planManagerExecution({
    ...safeOpportunity,
    id: 'blocked-1',
    description: 'Get paid $80, but pay to apply with an upfront fee and connect your wallet.',
  })

  assert.equal(plan.assessment.blocked, true)
  assert.equal(plan.decision.decision, 'block')
  assert.equal(plan.execution.state, 'blocked')
  assert.match(executionNextStep(plan.execution), /bloqueada/i)
})

test('pausa somente a execução que exige intervenção humana', () => {
  const plan = planManagerExecution({
    ...safeOpportunity,
    id: 'human-1',
    actionRequired: 'Login e identity verification',
  })

  assert.equal(plan.execution.state, 'waiting_human')
  assert.equal(plan.execution.intervention?.required, true)
  assert.match(plan.execution.intervention?.action ?? '', /não enviará dados/i)
  assert.match(executionNextStep(plan.execution), /A pessoa responsável/i)
})

test('mantém valor estimado fora do saldo e aponta earnings como confirmação', () => {
  const plan = planManagerExecution(safeOpportunity)

  assert.equal(plan.execution.state, 'queued')
  assert.equal(plan.decision.estimatedValuesAreNotEarnings, true)
  assert.equal(plan.decision.sensitiveActionsRequireHuman, true)
  assert.match(executionNextStep(plan.execution), /Worker/)
})
