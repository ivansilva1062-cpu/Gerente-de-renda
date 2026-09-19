import { sql } from './db'
import type { ExecutionRecord } from './execution-engine'

/*
 * ==========================================
 * SCHEMA ENSURE (cacheado por instância)
 * ==========================================
 *
 * As chamadas CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN
 * IF NOT EXISTS eram executadas a cada chamada de persistExecution
 * (várias vezes por oportunidade, dezenas de vezes por ciclo do
 * Worker). Cada uma é uma requisição HTTP separada ao Neon, e essa
 * latência somada era uma das causas reais do Worker estourar o
 * tempo limite de execução na Vercel e aparecer como indisponível.
 * Uma instância de função serverless (warm) reaproveita o schema já
 * garantido; a promise evita corridas quando há candidatos
 * concorrentes no mesmo ciclo.
 */
let executionSchemaReady: Promise<void> | null = null

async function ensureExecutionSchema() {
  if (!executionSchemaReady) {
    executionSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS execution_runs (
          id TEXT PRIMARY KEY,
          opportunity_id TEXT,
          state TEXT NOT NULL,
          lifecycle_state TEXT NOT NULL DEFAULT 'DISCOVERED',
          action TEXT NOT NULL,
          opportunity JSONB NOT NULL,
          intervention JSONB,
          evidence TEXT,
          error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `

      await sql`
        ALTER TABLE execution_runs
        ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'DISCOVERED'
      `

      await sql`
        ALTER TABLE execution_runs
        ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 1
      `

      await sql`
        ALTER TABLE execution_runs
        ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ
      `

      await sql`
        ALTER TABLE execution_runs
        ADD COLUMN IF NOT EXISTS action_type TEXT
      `

      await sql`
        ALTER TABLE execution_runs
        ADD COLUMN IF NOT EXISTS integration_available BOOLEAN
      `

      await sql`
        ALTER TABLE execution_runs
        ADD COLUMN IF NOT EXISTS pending_integration_note TEXT
      `

      await sql`
        CREATE TABLE IF NOT EXISTS execution_events (
          id BIGSERIAL PRIMARY KEY,
          execution_id TEXT NOT NULL,
          state TEXT NOT NULL,
          action TEXT NOT NULL,
          error TEXT,
          evidence TEXT,
          intervention JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    })().catch((error) => {
      // Falhou: não deixa o cache "preso" num estado ruim, tenta de novo na próxima chamada.
      executionSchemaReady = null
      throw error
    })
  }

  return executionSchemaReady
}

export async function persistExecution(execution: ExecutionRecord) {
  await ensureExecutionSchema()

  await sql`
    INSERT INTO execution_runs (
      id, opportunity_id, state, lifecycle_state, action, opportunity, intervention,
      evidence, error, attempt, next_attempt_at, action_type, integration_available,
      pending_integration_note, created_at, updated_at
    )
    VALUES (
      ${execution.id},
      ${execution.id.replace(/^execution-/, '')},
      ${execution.state},
      ${execution.lifecycleState},
      ${execution.action},
      ${JSON.stringify(execution.opportunity)},
      ${execution.intervention ? JSON.stringify(execution.intervention) : null},
      ${execution.evidence ?? null},
      ${execution.error ?? null},
      ${execution.attempt},
      ${execution.nextAttemptAt ?? null},
      ${execution.actionType ?? null},
      ${execution.integrationAvailable ?? null},
      ${execution.pendingIntegrationNote ?? null},
      ${execution.createdAt},
      ${execution.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      state = EXCLUDED.state,
      lifecycle_state = EXCLUDED.lifecycle_state,
      action = EXCLUDED.action,
      intervention = EXCLUDED.intervention,
      evidence = EXCLUDED.evidence,
      error = EXCLUDED.error,
      attempt = EXCLUDED.attempt,
      next_attempt_at = EXCLUDED.next_attempt_at,
      action_type = EXCLUDED.action_type,
      integration_available = EXCLUDED.integration_available,
      pending_integration_note = EXCLUDED.pending_integration_note,
      updated_at = EXCLUDED.updated_at
  `

  await sql`
    INSERT INTO execution_events (
      execution_id, state, action, error, evidence, intervention, created_at
    )
    VALUES (
      ${execution.id}, ${execution.state}, ${execution.action},
      ${execution.error ?? null}, ${execution.evidence ?? null},
      ${execution.intervention ? JSON.stringify(execution.intervention) : null},
      ${execution.updatedAt}
    )
  `
}
/*
 * ==========================================
 * TENTATIVA ANTERIOR (retry/backoff)
 * ==========================================
 *
 * Consultado antes de reprocessar uma oportunidade para saber em
 * qual tentativa o ciclo est\u00e1 e se o backoff j\u00e1 expirou.
 */
export async function getExecutionRetryState(opportunityId: string) {
  try {
    const rows = await sql`
      SELECT attempt, next_attempt_at
      FROM execution_runs
      WHERE id = ${`execution-${opportunityId}`}
      LIMIT 1
    `
    const row = rows[0] as { attempt?: number; next_attempt_at?: string | null } | undefined
    return {
      attempt: Number(row?.attempt ?? 0),
      nextAttemptAt: row?.next_attempt_at ?? null,
    }
  } catch {
    return { attempt: 0, nextAttemptAt: null }
  }
}
/*
 * ==========================================
 * HIST\u00d3RICO REAL DE EXECU\u00c7\u00d5ES
 * ==========================================
 */
export async function getExecutionHistory(limit = 100) {
  const rows = await sql`
    SELECT
      er.id AS execution_id,
      er.opportunity_id,
      o.title,
      o.source,
      er.state,
      er.action,
      er.action_type,
      er.integration_available,
      er.pending_integration_note,
      er.attempt,
      er.evidence,
      er.error,
      er.intervention,
      er.created_at AS started_at,
      er.updated_at AS finished_at,
      er.next_attempt_at
    FROM execution_runs er
    LEFT JOIN opportunities o ON o.id = er.opportunity_id
    ORDER BY er.updated_at DESC
    LIMIT ${limit}
  `
  return rows
}
/*
 * ==========================================
 * M\u00c9TRICAS REAIS
 * ==========================================
 *
 * Nunca conta estimatedValue como ganho: `confirmedValue` e
 * `confirmedEarnings` v\u00eam exclusivamente da tabela earnings.
 */
export async function getExecutionMetrics() {
  const [discovered, qualified, executed, byState, retrying, pendingIntegration, earnings] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM opportunities`,
    // Qualificada = já avaliada pelo Avaliador/Risco e não bloqueada pelo Gerente.
    sql`SELECT COUNT(*)::int AS count FROM opportunities WHERE manager_blocked = FALSE AND manager_score > 0`,
    sql`SELECT COUNT(*)::int AS count FROM execution_runs`,
    sql`
      SELECT state, COUNT(*)::int AS count
      FROM execution_runs
      GROUP BY state
    `,
    // Retentando = falhou mas já tem próxima tentativa agendada (backoff em andamento).
    sql`SELECT COUNT(*)::int AS count FROM execution_runs WHERE state = 'failed' AND next_attempt_at IS NOT NULL AND next_attempt_at > NOW()`,
    // Dependem de integração de API oficial ainda não autorizada (ver AUTHORIZED_API_INTEGRATIONS).
    sql`SELECT COUNT(*)::int AS count FROM execution_runs WHERE integration_available = FALSE`,
    sql`SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total FROM earnings`,
  ])

  const stateCounts = Object.fromEntries(
    (byState as Array<{ state: string; count: number }>).map((row) => [row.state, row.count]),
  ) as Record<string, number>

  const completed = stateCounts.completed ?? 0
  const waitingHuman = stateCounts.waiting_human ?? 0
  const failed = stateCounts.failed ?? 0
  const blocked = stateCounts.blocked ?? 0
  const executedCount = Number(executed[0]?.count ?? 0)
  const confirmedCount = Number(earnings[0]?.count ?? 0)
  const confirmedValue = Number(earnings[0]?.total ?? 0)
  /*
   * Ações preparadas = execuções que o Publicador liberou para o Worker
   * (tudo que não foi barrado já na criação por Risco/Avaliador).
   */
  const prepared = executedCount - blocked
  /*
   * Não existe integração real de faturamento (Browserbase, APIs pagas
   * etc.) que informe custo por execução. Em vez de estimar/inventar um
   * valor, mantemos 0 até haver uma fonte real de custo integrada — o
   * lucro líquido nunca deve subtrair um número fictício.
   */
  const costs = 0
  const netProfit = confirmedValue - costs

  return {
    discovered: Number(discovered[0]?.count ?? 0),
    qualified: Number(qualified[0]?.count ?? 0),
    prepared,
    executed: executedCount,
    actionsCompleted: completed,
    waitingUser: waitingHuman,
    retrying: Number(retrying[0]?.count ?? 0),
    failures: failed,
    blocked,
    pendingIntegration: Number(pendingIntegration[0]?.count ?? 0),
    confirmedEarnings: confirmedCount,
    confirmedValue,
    costs,
    netProfit,
    conversionRate: executedCount > 0 ? Number((confirmedCount / executedCount).toFixed(4)) : 0,
  }
}
