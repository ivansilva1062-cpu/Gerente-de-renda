/*
 * ==========================================
 * LOG ESTRUTURADO E SEGURO DO WORKER
 * ==========================================
 *
 * Cada evento é uma linha JSON única (fácil de filtrar nos logs da
 * Vercel). NUNCA recebe segredo: só ids, contagens, estados e
 * durações. `sanitize` remove defensivamente qualquer chave com
 * nome sensível caso alguém passe um objeto maior por engano.
 */

export type WorkerLogEvent =
  | 'WORKER_START'
  | 'WORKER_AUTHORIZED'
  | 'WORKER_UNAUTHORIZED'
  | 'RADAR_STARTED'
  | 'RADAR_FINISHED'
  | 'RADAR_FAILED'
  | 'CANDIDATES_FOUND'
  | 'OPPORTUNITY_CLAIMED'
  | 'OPPORTUNITY_CLAIM_FAILED'
  | 'EXECUTION_STARTED'
  | 'BROWSER_STARTED'
  | 'PAGE_INSPECTED'
  | 'ACTION_EXECUTED'
  | 'ACTION_CONFIRMED'
  | 'WAITING_HUMAN'
  | 'WAITING_EXTERNAL'
  | 'EXECUTION_FAILED'
  | 'EXECUTION_COMPLETED'
  | 'WORKER_FINISHED'

const SENSITIVE_KEY = /secret|password|senha|token|cookie|api[_-]?key|database_url|cron_secret|browserbase_api_key/i

function sanitize(data: Record<string, unknown>) {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY.test(key)) continue
    clean[key] = value
  }
  return clean
}

export function logWorkerEvent(event: WorkerLogEvent, data: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      event,
      at: new Date().toISOString(),
      ...sanitize(data),
    }),
  )
}
