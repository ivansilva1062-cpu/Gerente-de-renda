import assert from 'node:assert/strict'
import test from 'node:test'
import { runWorkerCycle, selectWorkerCycleCandidates } from './worker-cycle.ts'

const candidate = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: 'Paid freelance project',
  url: `https://work.example.com/${id}`,
  description: 'Get paid $80 per project with a clear remote service request.',
  source: 'work.example.com',
  category: 'freelance',
  estimatedValue: 80,
  confidence: 95,
  status: 'new',
  managerScore: 90,
  ...overrides,
})

test('retorna ciclo vazio quando não há oportunidades aprovadas', () => {
  const selected = selectWorkerCycleCandidates([
    candidate('blocked', {
      description: 'Pay to apply with an upfront fee and connect your wallet.',
    }),
  ])

  assert.deepEqual(selected, [])
})

test('seleciona oportunidades aprovadas, prioriza score e evita duplicidade', () => {
  const selected = selectWorkerCycleCandidates([
    candidate('low', { managerScore: 60 }),
    candidate('high', { managerScore: 95 }),
    candidate('excluded', { managerScore: 100 }),
  ], ['excluded'], 2)

  assert.deepEqual(selected.map((item) => item.id), ['high', 'low'])
})

test('processa waiting_human sem impedir a próxima oportunidade', async () => {
  const calls: string[] = []
  const result = await runWorkerCycle(
    [candidate('human', { actionRequired: 'Login e identity verification', managerScore: 100 }), candidate('safe')],
    [],
    async (item) => {
      calls.push(item.id)
      return { id: item.id, state: item.id === 'human' ? 'waiting_human' : 'completed' }
    },
    2,
  )

  assert.deepEqual(calls, ['human', 'safe'])
  assert.deepEqual(result.results.map((item) => item.state), ['waiting_human', 'completed'])
})

test('isola falha de uma oportunidade e continua processando as demais', async () => {
  const result = await runWorkerCycle(
    [candidate('fails', { managerScore: 100 }), candidate('works')],
    [],
    async (item) => {
      if (item.id === 'fails') throw new Error('falha controlada')
      return { id: item.id, state: 'completed' }
    },
    2,
  )

  assert.equal(result.results[0]?.state, 'failed')
  assert.equal(result.results[0]?.error, 'falha controlada')
  assert.equal(result.results[1]?.state, 'completed')
})
