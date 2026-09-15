import assert from 'node:assert/strict'
import test from 'node:test'
import { createExecution, transitionExecution } from './execution-engine.ts'
import { decideManagerAction } from './manager-decision.ts'
import { runManagerModules } from './manager-modules.ts'

const approvedOpportunity = {
  title: 'Paid freelance job apply now',
  url: 'https://work.example.com/apply',
  description: 'Get paid $80 per project with a clear remote task.',
  source: 'work.example.com',
  category: 'freelance',
  estimatedValue: 80,
  confidence: 100,
}

function context(opportunity = approvedOpportunity) {
  const modules = runManagerModules(opportunity)
  const decision = decideManagerAction(modules, { score: 100, priority: 'high' })

  return {
    id: 'execution-1',
    opportunity,
    modules,
    decision,
    now: '2026-09-15T12:00:00.000Z',
  }
}

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

test('não permite concluir uma execução bloqueada ou parada para humano', () => {
  const execution = createExecution(context({
    ...approvedOpportunity,
    actionRequired: 'Upload document and confirm payment',
  }))

  assert.throws(() => transitionExecution(execution, 'completed'), /Transição inválida/)
})
