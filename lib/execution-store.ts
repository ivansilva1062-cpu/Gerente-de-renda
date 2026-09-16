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
