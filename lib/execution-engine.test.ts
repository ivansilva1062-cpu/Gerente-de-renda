import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createExecution,
  pickNextOpportunity,
  transitionExecution,
} from './execution-engine.ts'
import { decideManagerAction } from './manager-decision.ts'
import { assessOpportunity, runManagerModules } from './manager-modules.ts'

const approvedOpportunity = {
  title: 'Paid freelance project',
  url: 'https://work.example.com/projects',
  description: 'Get paid $80 per project. Service request available with a clear remote task.',
  source: 'work.example.com',
  category: 'freelance',
  estimatedValue: 80,
  confidence: 100,
}

function context(opportunity = approvedOpportunity) {
  const modules = runManagerModules(opportunity)
  const assessment = assessOpportunity(opportunity)
  const decision = decideManagerAction(modules, {
    score: assessment.score,
    priority: assessment.priority,
  })

  return {
    id: 'execution-1',
    opportunity,
    modules,
    decision,
    now: '2026-09-15T12:00:00.000Z',
  }
}

test('integra a decisão aprovada do Gerente ao início do Execution Engine', () => {
  const assessment = assessOpportunity(approvedOpportunity)
  const decision = decideManagerAction(assessment.modules, {
    score: assessment.score,
    priority: assessment.priority,
  })
  const execution = createExecution({
    id: 'integration-1',
    opportunity: approvedOpportunity,
    modules: assessment.modules,
    decision,
    now: '2026-09-15T12:00:00.000Z',
  })

  assert.equal(decision.decision, 'prepare')
  assert.equal(execution.state, 'queued')
})

test('cria execução aprovada na fila e permite concluir uma ação segura', () => {
  const queued = createExecution(context())
  assert.equal(queued.state, 'queued')

  const running = transitionExecution(queued, 'running', {}, '2026-09-15T12:01:00.000Z')
  const completed = transitionExecution(running, 'completed', {
    evidence: 'Página oficial acessada sem autenticação; ação segura preparada.',
  }, '2026-09-15T12:02:00.000Z')

  assert.equal(completed.state, 'completed')
  assert.match(completed.evidence ?? '', /Página oficial/)
})

test('interrompe exatamente antes de ação sensível e registra intervenção humana', () => {
  const execution = createExecution(context({
    ...approvedOpportunity,
    actionRequired: 'Login e identity verification',
  }))

  assert.equal(execution.state, 'waiting_human')
  assert.equal(execution.intervention?.required, true)
  assert.match(execution.intervention?.action ?? '', /não enviará dados/)
})

test('permite retomar uma execução após intervenção humana e continuar automaticamente', () => {
  const execution = createExecution(context({
    ...approvedOpportunity,
    actionRequired: 'Login e identity verification',
  }))

  assert.equal(execution.state, 'waiting_human')

  const resumed = transitionExecution(execution, 'queued', {
    intervention: execution.intervention,
  }, '2026-09-15T12:03:00.000Z')

  const running = transitionExecution(resumed, 'running', {}, '2026-09-15T12:04:00.000Z')

  assert.equal(running.state, 'running')
  assert.equal(running.intervention?.required, true)
})

test('seleciona a próxima oportunidade pronta em fila e evita duplicidade', () => {
  const opportunities = [
    { id: 'a', status: 'new', managerScore: 50, confidence: 80, estimatedValue: 10 },
    { id: 'b', status: 'new', managerScore: 95, confidence: 99, estimatedValue: 40 },
    { id: 'c', status: 'running', managerScore: 90, confidence: 90, estimatedValue: 30 },
    { id: 'd', status: 'new', managerScore: 95, confidence: 99, estimatedValue: 40 },
  ]

  const queued = pickNextOpportunity(opportunities, new Set(['d']))

  assert.equal(queued?.id, 'b')
  assert.notEqual(queued?.id, 'd')
  assert.equal(pickNextOpportunity(opportunities, new Set(['a', 'b', 'c', 'd'])), null)
})

test('não permite concluir uma execução bloqueada ou parada para humano', () => {
  const execution = createExecution(context({
    ...approvedOpportunity,
    actionRequired: 'Upload document and confirm payment',
  }))

  assert.throws(() => transitionExecution(execution, 'completed'), /Transição inválida/)
})
