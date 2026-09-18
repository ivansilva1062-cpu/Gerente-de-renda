import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import { sql } from '@/lib/db'
import { requestHasActiveSession } from '@/lib/auth-server'
import { getPixTransfer, confirmPixTransfer } from '@/lib/pix-store'
import { upsertNotificationEvent } from '@/lib/notifications'

function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }

  const { id } = await params
  const transfer = await getPixTransfer(id)
  if (!transfer) {
    return NextResponse.json({ success: false, error: 'Transferência Pix não encontrada.' }, { status: 404 })
  }
  return NextResponse.json({ success: true, transfer })
}

/*
 * ==========================================
 * REGISTRO DA AUTORIZAÇÃO/CONFIRMAÇÃO PIX
 * ==========================================
 *
 * Este endpoint NUNCA envia o Pix. Ele apenas registra o resultado
 * de uma autorização já realizada pela pessoa dona da conta, no
 * canal oficial do banco/PSP (comprovante e ID da transação vêm de
 * lá). Nenhuma senha, PIN ou OTP é aceito ou processado aqui.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, error: 'Origem inválida.' }, { status: 403 })
  }
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }

  const { id } = await params

  try {
    const transfer = await getPixTransfer(id)
    if (!transfer) {
      return NextResponse.json({ success: false, error: 'Transferência Pix não encontrada.' }, { status: 404 })
    }
    if (transfer.status !== 'waiting_human') {
      return NextResponse.json({ success: false, error: 'Esta transferência Pix já foi registrada anteriormente.' }, { status: 409 })
    }

    const body = await request.json() as Record<string, unknown>
    const status = body.status === 'failed' ? 'failed' : 'completed'
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : undefined
    const receipt = typeof body.receipt === 'string' ? body.receipt.trim() : undefined
    const errorMessage = typeof body.error === 'string' ? body.error.trim() : undefined

    if (status === 'completed' && !transactionId) {
      return NextResponse.json(
        { success: false, error: 'Informe o ID da transação/comprovante fornecido pelo banco para confirmar.' },
        { status: 400 },
      )
    }

    const updated = await confirmPixTransfer(id, { status, transactionId, receipt, error: errorMessage })

    if (updated?.status === 'completed' && updated.direction === 'receive') {
      await sql`
        CREATE TABLE IF NOT EXISTS earnings (
          id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          source TEXT NOT NULL,
          amount NUMERIC(12,2) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      const earningId = `earning-pix-${randomUUID()}`
      const inserted = await sql`
        INSERT INTO earnings (id, description, source, amount)
        VALUES (${earningId}, ${updated.description}, 'pix', ${updated.amount})
        RETURNING id, description, source, amount, created_at
      `
      if (inserted.length > 0) {
        await upsertNotificationEvent({
          kind: 'earning',
          ref: String(inserted[0].id),
          title: '💰 Pix recebido e confirmado!',
          body: `${inserted[0].description} • pix`,
          source: 'pix',
          amount: Number(inserted[0].amount),
          url: '/financeiro',
          createdAt: String(inserted[0].created_at),
        })
      }
    }

    return NextResponse.json({ success: true, transfer: updated })
  } catch (error) {
    console.error('Erro ao registrar autorização do Pix:', error)
    return NextResponse.json({ success: false, error: 'Não foi possível registrar a autorização do Pix.' }, { status: 500 })
  }
}
