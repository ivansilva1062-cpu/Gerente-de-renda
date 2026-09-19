import { sql } from './db'

export { canStartMoreActions, isCategoryBlocked, requiresManualApproval } from './control-center-rules'

/*
 * ==========================================
 * CENTRAL DE CONTROLE
 * ==========================================
 *
 * Limites operacionais definidos pelo operador. Diferente da "meta
 * diária" (indicador visual em app/configuracoes/page.tsx), estes
 * limites são reais: persistidos no banco e aplicados pelo Worker
 * antes de iniciar qualquer ação nova. O Worker nunca ultrapassa
 * `dailyActionLimit`, nunca inicia ação de `blockedCategories`, e
 * nunca conclui sozinho uma oportunidade acima de
 * `requiresApprovalAboveUsd` sem passar por WAITING_USER.
 */
export type ControlCenterSettings = {
  dailyActionLimit: number | null
  blockedCategories: string[]
  requiresApprovalAboveUsd: number | null
  updatedAt: string
}

const DEFAULT_SETTINGS: Omit<ControlCenterSettings, 'updatedAt'> = {
  dailyActionLimit: null,
  blockedCategories: [],
  requiresApprovalAboveUsd: null,
}

let schemaReady: Promise<void> | null = null

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS control_center_settings (
          id TEXT PRIMARY KEY DEFAULT 'default',
          daily_action_limit INTEGER,
          blocked_categories JSONB NOT NULL DEFAULT '[]',
          requires_approval_above_usd NUMERIC(12,2),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    })().catch((error) => {
      schemaReady = null
      throw error
    })
  }

  return schemaReady
}

export async function getControlCenterSettings(): Promise<ControlCenterSettings> {
  await ensureSchema()

  const rows = await sql`
    SELECT daily_action_limit, blocked_categories, requires_approval_above_usd, updated_at
    FROM control_center_settings
    WHERE id = 'default'
    LIMIT 1
  `

  const row = rows[0] as
    | { daily_action_limit: number | null; blocked_categories: string[]; requires_approval_above_usd: string | number | null; updated_at: string }
    | undefined

  if (!row) {
    return { ...DEFAULT_SETTINGS, updatedAt: new Date(0).toISOString() }
  }

  return {
    dailyActionLimit: row.daily_action_limit ?? null,
    blockedCategories: Array.isArray(row.blocked_categories) ? row.blocked_categories : [],
    requiresApprovalAboveUsd: row.requires_approval_above_usd == null ? null : Number(row.requires_approval_above_usd),
    updatedAt: row.updated_at,
  }
}

export async function updateControlCenterSettings(
  patch: Partial<Pick<ControlCenterSettings, 'dailyActionLimit' | 'blockedCategories' | 'requiresApprovalAboveUsd'>>,
): Promise<ControlCenterSettings> {
  await ensureSchema()
  const current = await getControlCenterSettings()

  const next = {
    dailyActionLimit: patch.dailyActionLimit !== undefined ? patch.dailyActionLimit : current.dailyActionLimit,
    blockedCategories: patch.blockedCategories !== undefined ? patch.blockedCategories : current.blockedCategories,
    requiresApprovalAboveUsd:
      patch.requiresApprovalAboveUsd !== undefined ? patch.requiresApprovalAboveUsd : current.requiresApprovalAboveUsd,
  }

  const rows = await sql`
    INSERT INTO control_center_settings (id, daily_action_limit, blocked_categories, requires_approval_above_usd, updated_at)
    VALUES ('default', ${next.dailyActionLimit}, ${JSON.stringify(next.blockedCategories)}, ${next.requiresApprovalAboveUsd}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      daily_action_limit = EXCLUDED.daily_action_limit,
      blocked_categories = EXCLUDED.blocked_categories,
      requires_approval_above_usd = EXCLUDED.requires_approval_above_usd,
      updated_at = NOW()
    RETURNING daily_action_limit, blocked_categories, requires_approval_above_usd, updated_at
  `

  const row = rows[0] as { daily_action_limit: number | null; blocked_categories: string[]; requires_approval_above_usd: string | number | null; updated_at: string }

  return {
    dailyActionLimit: row.daily_action_limit ?? null,
    blockedCategories: Array.isArray(row.blocked_categories) ? row.blocked_categories : [],
    requiresApprovalAboveUsd: row.requires_approval_above_usd == null ? null : Number(row.requires_approval_above_usd),
    updatedAt: row.updated_at,
  }
}

/*
 * Ações realmente iniciadas (estado 'running') nas últimas 24h —
 * base real para aplicar `dailyActionLimit` sem depender de um
 * contador em memória que se perderia a cada novo deploy/instância.
 */
export async function countActionsStartedLast24h(): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM execution_events
    WHERE state = 'running'
      AND created_at >= NOW() - INTERVAL '24 hours'
  `
  return Number((rows[0] as { count?: number } | undefined)?.count ?? 0)
}
