import { sql } from './db'
import type { ExecutionRecord } from './execution-engine'

export async function persistExecution(execution: ExecutionRecord) {
  await sql`
    CREATE TABLE IF NOT EXISTS execution_runs (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT,
      state TEXT NOT NULL,
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
    INSERT INTO execution_runs (
      id, opportunity_id, state, action, opportunity, intervention,
      evidence, error, created_at, updated_at
    )
    VALUES (
      ${execution.id},
      ${execution.id.replace(/^execution-/, '')},
      ${execution.state},
      ${execution.action},
      ${JSON.stringify(execution.opportunity)},
      ${execution.intervention ? JSON.stringify(execution.intervention) : null},
      ${execution.evidence ?? null},
      ${execution.error ?? null},
      ${execution.createdAt},
      ${execution.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      state = EXCLUDED.state,
      action = EXCLUDED.action,
      intervention = EXCLUDED.intervention,
      evidence = EXCLUDED.evidence,
      error = EXCLUDED.error,
      updated_at = EXCLUDED.updated_at
  `
}
