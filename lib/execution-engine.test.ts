import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createExecution,
  pickNextOpportunity,
  summarizeExecutionStates,
  transitionExecution,
} from './execution-engine.ts'
import { decideManagerAction } from './manager-decision.ts'
import { assessOpportunity, runManagerModules } from './manager-modules.ts'
import { isAuthorizedWorkerRequest } from './worker-auth.ts'

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

test('bloqueia uma oportunidade rejeitada pelo Risco antes de entrar na fila', () => {
  const opportunity = {
    ...approvedOpportunity,
    description: 'Get paid $80, but pay to apply with an upfront fee and connect your wallet.',
  }
  const assessment = assessOpportunity(opportunity)
  const execution = createExecution({
    id: 'risk-blocked',
    opportunity,
    modules: assessment.modules,
    decision: decideManagerAction(assessment.modules, {
      score: assessment.score,
      priority: assessment.priority,
    }),
    now: '2026-09-15T12:00:00.000Z',
  })

  assert.equal(assessment.blocked, true)
  assert.equal(assessment.blockedBy.includes('risco'), true)
  assert.equal(execution.state, 'blocked')
})

test('registra falha de execução e impede retomada de estado terminal', () => {
  const queued = createExecution(context())
  const running = transitionExecution(queued, 'running', {}, '2026-09-15T12:01:00.000Z')
  const failed = transitionExecution(running, 'failed', {
    error: 'Falha controlada ao inspecionar a página oficial.',
  }, '2026-09-15T12:02:00.000Z')

  assert.equal(failed.state, 'failed')
  assert.equal(failed.error, 'Falha controlada ao inspecionar a página oficial.')
  assert.throws(() => transitionExecution(failed, 'running'), /Transição inválida/)
})

test('mantém waiting_human isolada enquanto seleciona outra oportunidade pronta', () => {
  const waiting = createExecution(context({
    ...approvedOpportunity,
    actionRequired: 'Login e identity verification',
  }))
  const next = pickNextOpportunity([
    { id: waiting.id, status: 'new', managerScore: 99, confidence: 99, estimatedValue: 100 },
    { id: 'safe', status: 'new', managerScore: 80, confidence: 90, estimatedValue: 40 },
  ], [waiting.id])

  assert.equal(waiting.state, 'waiting_human')
  assert.equal(next?.id, 'safe')
})

test('resume múltiplas execuções sem permitir duplicidade da mesma oportunidade', () => {
  const opportunities = [
    { id: 'a', status: 'new', managerScore: 80, confidence: 90, estimatedValue: 20 },
    { id: 'b', status: 'new', managerScore: 70, confidence: 90, estimatedValue: 30 },
  ]

  const first = pickNextOpportunity(opportunities)
  const second = pickNextOpportunity(opportunities, [first?.id ?? ''])

  assert.equal(first?.id, 'a')
  assert.equal(second?.id, 'b')
  assert.notEqual(first?.id, second?.id)
})

test('resume os estados do painel sem confundir estimativa com conclusão', () => {
  const summary = summarizeExecutionStates([
    { state: 'queued' },
    { state: 'running' },
    { state: 'waiting_human' },
    { state: 'completed' },
    { state: 'blocked' },
    { state: 'failed' },
    { state: 'waiting_human' },
  ])

  assert.deepEqual(summary, {
    queued: 1,
    running: 1,
    waiting_human: 2,
    completed: 1,
    blocked: 1,
    failed: 1,
  })
})

test('autoriza Worker por sessão ativa ou segredo de cron, mas nunca sem credencial', () => {
  assert.equal(isAuthorizedWorkerRequest({
    authorization: null,
    cronSecret: 'cron-secret',
    sessionActive: true,
  }), true)
  assert.equal(isAuthorizedWorkerRequest({
    authorization: 'Bearer cron-secret',
    cronSecret: 'cron-secret',
    sessionActive: false,
  }), true)
  assert.equal(isAuthorizedWorkerRequest({
    authorization: 'Bearer wrong-secret',
    cronSecret: 'cron-secret',
    sessionActive: false,
  }), false)
  assert.equal(isAuthorizedWorkerRequest({
    authorization: null,
    cronSecret: undefined,
    sessionActive: false,
  }), false)
})
