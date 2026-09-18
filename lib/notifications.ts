import { randomUUID } from 'node:crypto'
import webPush from 'web-push'

import { sql } from './db.ts'

export type NotificationKind = 'earning' | 'human_action' | 'opportunity_ready' | 'payment_pending' | 'financial_confirmation_required' | 'error'

export type NotificationInput = {
  kind: NotificationKind
  ref: string
  title?: string
  body?: string
  source?: string | null
  amount?: number | null
  url?: string | null
  createdAt?: string
}

export type NotificationRecord = {
  id: string
  kind: NotificationKind
  event_key: string
  title: string
  body: string
  source: string | null
  amount: number | null
  url: string | null
  read: boolean
  created_at: string
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function composeEventKey(kind: string, ref: string) {
  return `${kind}:${String(ref ?? '').trim() || 'none'}`
}

export function buildNotificationTitle(input: {
  kind: NotificationKind
  title?: string
  amount?: number | null
  source?: string | null
  summary?: string
  name?: string
}) {
  if (input.title) return input.title

  switch (input.kind) {
    case 'earning':
      return '💰 Ganho confirmado!'
    case 'human_action':
      return '⚠️ Ação necessária'
    case 'opportunity_ready':
      return '🚀 Oportunidade pronta'
    case 'payment_pending':
      return '⏳ Pagamento pendente'
    case 'financial_confirmation_required':
      return '💳 Confirmação financeira necessária'
    case 'error':
      return '⚠️ Gerente precisa de atenção'
    default:
      return 'Gerente de Renda'
  }
}

export function buildNotificationBody(input: {
  kind: NotificationKind
  amount?: number | null
  source?: string | null
  at?: string | null
  summary?: string
  name?: string
  error?: string
}) {
  const amountValue = Number(input.amount ?? 0)
  const sourceText = input.source?.trim() || 'Fonte desconhecida'
  const atText = input.at ? new Date(input.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  switch (input.kind) {
    case 'earning':
      return `${currencyFormatter.format(amountValue)} • ${sourceText} • ${atText}`
    case 'human_action':
      return input.summary?.trim() || `A ação necessária ainda não foi concluída em ${sourceText}.`
    case 'opportunity_ready':
      return `${input.name || 'Oportunidade'} • ${currencyFormatter.format(amountValue)} • ainda não é ganho confirmado • ${sourceText}`
    case 'payment_pending':
      return `Pagamento pendente em ${sourceText} • ${currencyFormatter.format(amountValue)} • ${atText}.`
    case 'financial_confirmation_required':
      return input.summary?.trim() || `Confirmação financeira necessária em ${sourceText} • valor ${currencyFormatter.format(amountValue)} • ação obrigatória do usuário.`
    case 'error':
      return input.error?.trim() || 'Foi detectado um erro que exige atenção.'
    default:
      return sourceText
  }
}

export async function ensureNotificationTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS notification_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      event_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      source TEXT,
      amount NUMERIC(12,2),
      url TEXT,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

export async function listNotifications() {
  await ensureNotificationTables()

  const rows = await sql`
    SELECT id, kind, event_key, title, body, source, amount, url, read, created_at
    FROM notifications
    ORDER BY created_at DESC
    LIMIT 80
  `

  return rows.map((row) => ({
    id: String(row.id),
    kind: String(row.kind) as NotificationKind,
    eventKey: String(row.event_key),
    title: String(row.title),
    body: String(row.body),
    source: row.source ? String(row.source) : null,
    amount: row.amount == null ? null : Number(row.amount),
    url: row.url ? String(row.url) : null,
    read: Boolean(row.read),
    createdAt: String(row.created_at),
  }))
}

export async function registerPushSubscription(input: {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}) {
  await ensureNotificationTables()

  const endpoint = String(input.endpoint || '').trim()
  const p256dh = String(input.p256dh || '').trim()
  const auth = String(input.auth || '').trim()

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Subscription inválida.')
  }

  await sql`
    INSERT INTO notification_subscriptions (endpoint, p256dh, auth, user_agent, last_used_at)
    VALUES (${endpoint}, ${p256dh}, ${auth}, ${input.userAgent ?? null}, NOW())
    ON CONFLICT (endpoint)
    DO UPDATE SET
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent,
      last_used_at = NOW()
  `

  return { success: true }
}

export async function removePushSubscription(endpoint: string) {
  await ensureNotificationTables()

  const value = String(endpoint || '').trim()
  if (!value) return { success: true }

  await sql`
    DELETE FROM notification_subscriptions
    WHERE endpoint = ${value}
  `

  return { success: true }
}

export async function upsertNotificationEvent(input: NotificationInput) {
  await ensureNotificationTables()

  const eventKey = composeEventKey(input.kind, input.ref)
  const title = buildNotificationTitle({
    kind: input.kind,
    title: input.title,
    amount: input.amount,
    source: input.source,
    summary: input.body,
  })
  const body = buildNotificationBody({
    kind: input.kind,
    amount: input.amount,
    source: input.source,
    at: input.createdAt,
    summary: input.body,
    name: input.title,
    error: input.body,
  })

  const created = await sql`
    INSERT INTO notifications (
      id,
      kind,
      event_key,
      title,
      body,
      source,
      amount,
      url,
      read,
      created_at
    )
    VALUES (
      ${randomUUID()},
      ${input.kind},
      ${eventKey},
      ${title},
      ${body},
      ${input.source ?? null},
      ${input.amount ?? null},
      ${input.url ?? null},
      FALSE,
      ${input.createdAt ? new Date(input.createdAt) : new Date()}
    )
    ON CONFLICT (event_key)
    DO NOTHING
    RETURNING *
  `

  if (created.length === 0) {
    const existing = await sql`
      SELECT * FROM notifications
      WHERE event_key = ${eventKey}
      LIMIT 1
    `

    return existing[0] ? toNotificationRecord(existing[0]) : null
  }

  const notification = toNotificationRecord(created[0])
  await sendPushNotifications(notification)
  return notification
}

export async function markNotificationAsRead(id: string) {
  await ensureNotificationTables()

  const rows = await sql`
    UPDATE notifications
    SET read = TRUE
    WHERE id = ${id}
    RETURNING *
  `

  return rows[0] ? toNotificationRecord(rows[0]) : null
}

export async function clearReadNotifications() {
  await ensureNotificationTables()

  await sql`
    DELETE FROM notifications
    WHERE read = TRUE
  `

  return { success: true }
}

async function sendPushNotifications(notification: NotificationRecord) {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim()

  if (!vapidPublicKey || !vapidPrivateKey) {
    return
  }

  webPush.setVapidDetails(
    'mailto:gerente@localhost',
    vapidPublicKey,
    vapidPrivateKey,
  )

  const rows = await sql`
    SELECT endpoint, p256dh, auth
    FROM notification_subscriptions
  `

  for (const row of rows) {
    try {
      await webPush.sendNotification(
        {
          endpoint: String(row.endpoint),
          keys: {
            p256dh: String(row.p256dh),
            auth: String(row.auth),
          },
        },
        JSON.stringify({
          title: notification.title,
          body: notification.body,
          tag: notification.event_key,
          data: {
            url: notification.url || '/financeiro',
          },
          icon: '/apple-icon.png',
          badge: '/icon.svg',
          vibrate: [150, 100, 150],
        }),
      )
    } catch (error) {
      console.warn('Falha ao enviar push notification:', error)
      await sql`
        DELETE FROM notification_subscriptions
        WHERE endpoint = ${String(row.endpoint)}
      `
    }
  }
}

function toNotificationRecord(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    kind: String(row.kind) as NotificationKind,
    event_key: String(row.event_key),
    title: String(row.title),
    body: String(row.body),
    source: row.source ? String(row.source) : null,
    amount: row.amount == null ? null : Number(row.amount),
    url: row.url ? String(row.url) : null,
    read: Boolean(row.read),
    created_at: String(row.created_at),
  }
}
