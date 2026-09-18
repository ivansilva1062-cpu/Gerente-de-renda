import assert from 'node:assert/strict'
import test from 'node:test'
import { runWorkerCycle, selectWorkerCycleCandidates, shouldIncludeInCycle } from './worker-cycle.ts'

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

test('processa candidatos em paralelo e limita a retentativa a uma tentativa extra', async () => {
    const attempts = new Map<string, number>()
    let active = 0
    let maximumActive = 0

    const result = await runWorkerCycle(
      [
        candidate('first', { managerScore: 90 }),
        candidate('second', { managerScore: 80 }),
      ],
      [],
      async (candidate) => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1

        const currentAttempt = (attempts.get(candidate.id) ?? 0) + 1
        attempts.set(candidate.id, currentAttempt)
        if (candidate.id === 'first' && currentAttempt === 1) {
          throw new Error('falha transitória')
        }

        return { id: candidate.id, state: 'completed' as const }
      },
      2,
    )

    assert.equal(maximumActive, 2)
    assert.equal(attempts.get('first'), 2)
    assert.equal(attempts.get('second'), 1)
    assert.deepEqual(result.results.map((item) => item.state), ['completed', 'completed'])
})

test('quando uma das 3 vagas termina rápido, o ciclo puxa imediatamente a próxima candidata elegível', async () => {
  const durations: Record<string, number> = {
    a: 5,
    b: 40,
    c: 40,
    d: 5,
    e: 5,
  }

  let active = 0
  let maximumActive = 0
  const startedOrder: string[] = []

  const ids = ['a', 'b', 'c', 'd', 'e']
  const result = await runWorkerCycle(
    ids.map((id, index) => candidate(id, { managerScore: 100 - index })),
    [],
    async (item) => {
      startedOrder.push(item.id)
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, durations[item.id]))
      active -= 1
      return { id: item.id, state: 'completed' as const }
    },
    3,
  )

  assert.equal(maximumActive, 3)
  assert.equal(result.selectedIds.length, 5)
  assert.equal(result.results.length, 5)
  assert.deepEqual(new Set(result.results.map((item) => item.id)), new Set(['a', 'b', 'c', 'd', 'e']))
  assert.ok(result.results.every((item) => item.state === 'completed'))
  /*
   * 'a' e 'd'/'e' terminam rápido enquanto 'b'/'c' ainda rodam;
   * como só há 3 vagas, o ciclo já deve ter iniciado uma 4ª e
   * 5ª oportunidade antes de 'b'/'c' terminarem.
   */
  assert.ok(startedOrder.length === 5)
})

test('waiting_external não bloqueia as demais oportunidades no mesmo ciclo', async () => {
  const calls: string[] = []
  const result = await runWorkerCycle(
    [candidate('external', { managerScore: 100 }), candidate('safe-1'), candidate('safe-2')],
    [],
    async (item) => {
      calls.push(item.id)
      if (item.id === 'external') {
        return { id: item.id, state: 'waiting_external' as const }
      }
      return { id: item.id, state: 'completed' as const }
    },
    3,
  )

  assert.deepEqual(new Set(calls), new Set(['external', 'safe-1', 'safe-2']))
  assert.deepEqual(
    result.results.find((item) => item.id === 'external')?.state,
    'waiting_external',
  )
  assert.ok(result.results.filter((item) => item.state === 'completed').length === 2)
})

test('sem candidatos elegíveis, o ciclo fica corretamente sem nenhuma tarefa executável', async () => {
  const result = await runWorkerCycle(
    [candidate('blocked-only', {
      description: 'Pay to apply with an upfront fee and connect your wallet.',
    })],
    [],
    async (item) => ({ id: item.id, state: 'completed' as const }),
    3,
  )

  assert.deepEqual(result.selectedIds, [])
  assert.deepEqual(result.results, [])
})

test('reprocessa pendentes apenas quando a última execução foi retryável, sem reciclar waiting_human ou waiting_external', () => {
  assert.equal(shouldIncludeInCycle('pending', 'failed'), true)
  assert.equal(shouldIncludeInCycle('pending', 'blocked'), true)
  assert.equal(shouldIncludeInCycle('pending', 'waiting_external'), true)
  assert.equal(shouldIncludeInCycle('pending', 'queued'), false)
  assert.equal(shouldIncludeInCycle('pending', 'waiting_human'), false)
  assert.equal(shouldIncludeInCycle('pending', 'completed'), false)
  assert.equal(shouldIncludeInCycle('new', undefined), true)
  assert.equal(shouldIncludeInCycle('queued', undefined), true)
})
