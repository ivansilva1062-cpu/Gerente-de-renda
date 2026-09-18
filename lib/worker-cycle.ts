import { planManagerExecution, type ManagerExecutionInput } from './manager-execution.ts'
import { pickNextOpportunity, type ExecutionState, type QueueCandidate } from './execution-engine.ts'

export type WorkerCycleCandidate = ManagerExecutionInput & QueueCandidate

export type WorkerCycleResult = {
  id: string
  state: ExecutionState | 'failed'
  error?: string
}

export function shouldIncludeInCycle(
  status: string | null | undefined,
  lastExecutionState?: string | null,
) {
  if (status === 'new' || status === 'queued') {
    return true
  }

  if (status !== 'pending') {
    return false
  }

  if (!lastExecutionState) {
    return false
  }

  return ['failed', 'blocked', 'waiting_external'].includes(lastExecutionState)
}

export function selectWorkerCycleCandidates<T extends WorkerCycleCandidate>(
  candidates: T[],
  excludedIds: Iterable<string> = [],
  maxTotal = 12,
) {
  const excluded = new Set(excludedIds)
  const selected: T[] = []

  while (selected.length < maxTotal) {
    const next = pickNextOpportunity(candidates, [
      ...excluded,
      ...selected.map((candidate) => candidate.id),
    ])
    if (!next) break

    const candidate = candidates.find((item) => item.id === next.id)
    if (!candidate) break

    const plan = planManagerExecution(candidate)
    if (plan.execution.state === 'queued' || plan.execution.state === 'waiting_human') {
      selected.push(candidate)
    } else {
      excluded.add(candidate.id)
    }
  }

  return selected
}

/*
 * ==========================================
 * CICLO DO WORKER
 * ==========================================
 *
 * O ciclo NÃO seleciona um lote fixo e espera
 * todo mundo terminar. Ele mantém um pool de
 * `concurrency` vagas ativas: assim que uma
 * oportunidade termina (concluída, waiting_human,
 * waiting_external ou falha), a vaga libera e a
 * próxima candidata elegível da fila é iniciada
 * imediatamente, dentro do mesmo ciclo — até
 * esgotar os candidatos elegíveis (até `maxTotal`).
 *
 * Uma oportunidade travada em waiting_human ou
 * waiting_external ocupa só a própria vaga: ela
 * conta como "terminada" para efeito de concorrência
 * assim que o processamento devolve o resultado —
 * ela nunca impede as demais de avançar.
 */
export async function runWorkerCycle<T extends WorkerCycleCandidate>(
  candidates: T[],
  excludedIds: Iterable<string>,
  process: (candidate: T) => Promise<WorkerCycleResult>,
  concurrency = 3,
  maxTotal = 12,
) {
  const selected = selectWorkerCycleCandidates(candidates, excludedIds, maxTotal)
  const results: WorkerCycleResult[] = new Array(selected.length)
  let cursor = 0

  async function runOne(candidate: T) {
    let lastError: unknown

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await process(candidate)
      } catch (error) {
        lastError = error
      }
    }

    return {
      id: candidate.id,
      state: 'failed' as const,
      error: lastError instanceof Error ? lastError.message : 'Falha isolada no Worker.',
    }
  }

  async function worker() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= selected.length) return
      results[index] = await runOne(selected[index])
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, selected.length))
  await Promise.all(Array.from({ length: poolSize }, () => worker()))

  return {
    selectedIds: selected.map((candidate) => candidate.id),
    results,
  }
}
