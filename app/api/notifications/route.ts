import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import { requestHasActiveSession } from '@/lib/auth-server'
import {
  clearReadNotifications,
  ensureNotificationTables,
  listNotifications,
  markNotificationAsRead,
  registerPushSubscription,
  removePushSubscription,
  upsertNotificationEvent,
} from '@/lib/notifications'

export async function GET() {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }

  await ensureNotificationTables()
  const notifications = await listNotifications()
  return NextResponse.json({ success: true, notifications })
}

export async function POST(request: Request) {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }

  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action ?? '').trim()

    if (action === 'subscribe') {
      const endpoint = String(body.endpoint ?? '').trim()
      const p256dh = String((body.keys as Record<string, string> | undefined)?.p256dh ?? '').trim()
      const auth = String((body.keys as Record<string, string> | undefined)?.auth ?? '').trim()

      if (!endpoint || !p256dh || !auth) {
        return NextResponse.json({ success: false, error: 'Subscription inválida.' }, { status: 400 })
      }

      await registerPushSubscription({
        endpoint,
        p256dh,
        auth,
        userAgent: typeof body.userAgent === 'string' ? body.userAgent : null,
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'create') {
      const notification = await upsertNotificationEvent({
        kind: String(body.kind ?? 'error') as 'earning' | 'human_action' | 'opportunity_ready' | 'error',
        ref: String(body.ref ?? randomUUID()),
        title: typeof body.title === 'string' ? body.title : undefined,
        body: typeof body.body === 'string' ? body.body : undefined,
        source: typeof body.source === 'string' ? body.source : null,
        amount: typeof body.amount === 'number' ? body.amount : null,
        url: typeof body.url === 'string' ? body.url : null,
        createdAt: typeof body.createdAt === 'string' ? body.createdAt : new Date().toISOString(),
      })

      return NextResponse.json({ success: true, notification })
    }

    return NextResponse.json({ success: false, error: 'Ação de notificação desconhecida.' }, { status: 400 })
  } catch (error) {
    console.error('Erro ao processar notificação:', error)
    return NextResponse.json({ success: false, error: 'Erro ao processar notificação.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }

  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action ?? '').trim()
    const id = String(body.id ?? '').trim()

    if (action === 'mark-read' && id) {
      const item = await markNotificationAsRead(id)
      return NextResponse.json({ success: true, notification: item })
    }

    return NextResponse.json({ success: false, error: 'Ação de notificação desconhecida.' }, { status: 400 })
  } catch (error) {
    console.error('Erro ao marcar notificação:', error)
    return NextResponse.json({ success: false, error: 'Erro ao marcar notificação.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = String(body.action ?? '').trim()

    if (action === 'clear-read') {
      await clearReadNotifications()
      return NextResponse.json({ success: true })
    }

    if (typeof body.endpoint === 'string' && body.endpoint.trim()) {
      await removePushSubscription(body.endpoint)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: 'Ação de notificação desconhecida.' }, { status: 400 })
  } catch (error) {
    console.error('Erro ao remover notificação:', error)
    return NextResponse.json({ success: false, error: 'Erro ao remover notificação.' }, { status: 500 })
  }
}
