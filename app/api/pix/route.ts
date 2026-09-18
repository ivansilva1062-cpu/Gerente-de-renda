import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import { requestHasActiveSession } from '@/lib/auth-server'
import { getStoredOperatorProfile } from '@/lib/profile-store'
import { preparePixTransfer, DEFAULT_MAX_PIX_AMOUNT, type PixDirection } from '@/lib/pix'
import { createPreparedPixTransfer, listPixTransfers } from '@/lib/pix-store'
import { upsertNotificationEvent } from '@/lib/notifications'

function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin
}

function maxPixAmount() {
  const configured = Number(process.env.PIX_MAX_TRANSFER_AMOUNT)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_PIX_AMOUNT
}

/*
 * ==========================================
 * HISTÓRICO E PENDÊNCIAS PIX
 * ==========================================
 */
export async function GET() {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }

  try {
    const transfers = await listPixTransfers(100)
    return NextResponse.json({ success: true, transfers })
  } catch (error) {
    console.error('Erro ao consultar Pix:', error)
    return NextResponse.json({ success: false, error: 'Não foi possível consultar o histórico de Pix.' }, { status: 500 })
  }
}

/*
 * ==========================================
 * PREPARAÇÃO AUTOMÁTICA DA TRANSFERÊNCIA PIX
 * ==========================================
 *
 * Preenche o remetente com a conta autorizada já cadastrada,
 * valida destinatário/valor/descrição e grava a transferência como
 * `waiting_human`. O Gerente nunca envia o Pix sozinho: a
 * autorização final acontece no canal oficial do banco/PSP e é
 * apenas registrada aqui depois (ver POST /api/pix/[id]).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, error: 'Origem inválida.' }, { status: 403 })
  }
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }

  try {
    const body = await request.json() as Record<string, unknown>

    const direction = String(body.direction ?? 'send') as PixDirection
    if (direction !== 'send' && direction !== 'receive') {
      return NextResponse.json({ success: false, error: 'Direção do Pix inválida.' }, { status: 400 })
    }

    const profile = await getStoredOperatorProfile()
    if (!profile?.banking) {
      return NextResponse.json(
        { success: false, error: 'Nenhuma conta autorizada cadastrada. Preencha os dados bancários em Configurações.' },
        { status: 400 },
      )
    }

    const result = preparePixTransfer(
      {
        direction,
        recipientKey: String(body.recipientKey ?? ''),
        recipientName: typeof body.recipientName === 'string' ? body.recipientName : undefined,
        amount: Number(body.amount),
        description: String(body.description ?? ''),
      },
      profile.banking,
      { maxAmount: maxPixAmount() },
    )

    if (!result.valid) {
      return NextResponse.json({ success: false, errors: result.errors }, { status: 400 })
    }

    const id = `pix-${randomUUID()}`
    const transfer = await createPreparedPixTransfer(id, result.prepared)

    await upsertNotificationEvent({
      kind: 'financial_confirmation_required',
      ref: `pix:${id}`,
      title: '💳 Pix pronto para sua autorização',
      body: `${direction === 'send' ? 'Envio' : 'Recebimento'} de ${result.prepared.amount.toFixed(2)} preparado. Confira e autorize pelo canal oficial do seu banco.`,
      source: 'pix',
      amount: result.prepared.amount,
      url: '/pix',
      createdAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true, transfer })
  } catch (error) {
    console.error('Erro ao preparar Pix:', error)
    return NextResponse.json({ success: false, error: 'Não foi possível preparar o Pix.' }, { status: 500 })
  }
}
