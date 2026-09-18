import { planManagerExecution, type ManagerExecutionInput } from './manager-execution.ts'
import { pickNextOpportunity, type ExecutionState, type QueueCandidate } from './execution-engine.ts'

export type WorkerCycleCandidate = ManagerExecutionInput & QueueCandidate

export type WorkerCycleResult = {
  id: string
  state: ExecutionState | 'failed'
  error?: string
}

export function selectWorkerCycleCandidates(
  candidates: WorkerCycleCandidate[],
  excludedIds: Iterable<string> = [],
  limit = 3,
) {
  const excluded = new Set(excludedIds)
  const selected: WorkerCycleCandidate[] = []

  while (selected.length < limit) {
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

export async function runWorkerCycle<T extends WorkerCycleCandidate>(
  candidates: T[],
  excludedIds: Iterable<string>,
  process: (candidate: T) => Promise<WorkerCycleResult>,
  limit = 3,
) {
  const selected = selectWorkerCycleCandidates(candidates, excludedIds, limit)
  const results = await Promise.all(selected.map(async (candidate) => {
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
  }))

  return {
    selectedIds: selected.map((candidate) => candidate.id),
    results,
  }
}
