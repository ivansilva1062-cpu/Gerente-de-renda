import { NextResponse } from 'next/server'
import { requestHasActiveSession } from '@/lib/auth-server'
import { getControlCenterSettings, updateControlCenterSettings } from '@/lib/control-center'
import { OPPORTUNITY_CATEGORIES } from '@/lib/opportunity-catalog'

export async function GET() {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }
  try {
    const settings = await getControlCenterSettings()
    return NextResponse.json({ success: true, settings, availableCategories: OPPORTUNITY_CATEGORIES })
  } catch (error) {
    console.error('Erro ao consultar a Central de Controle:', error)
    return NextResponse.json({ success: false, error: 'Não foi possível consultar os limites.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }
  try {
    const body = await request.json()

    const dailyActionLimit =
      body.dailyActionLimit === null || body.dailyActionLimit === undefined
        ? undefined
        : Number(body.dailyActionLimit)
    const requiresApprovalAboveUsd =
      body.requiresApprovalAboveUsd === null || body.requiresApprovalAboveUsd === undefined
        ? undefined
        : Number(body.requiresApprovalAboveUsd)
    const blockedCategories = Array.isArray(body.blockedCategories)
      ? body.blockedCategories.filter((category: unknown) => typeof category === 'string')
      : undefined

    if (dailyActionLimit !== undefined && (!Number.isFinite(dailyActionLimit) || dailyActionLimit < 0)) {
      return NextResponse.json({ success: false, error: 'Limite diário inválido.' }, { status: 400 })
    }
    if (requiresApprovalAboveUsd !== undefined && (!Number.isFinite(requiresApprovalAboveUsd) || requiresApprovalAboveUsd < 0)) {
      return NextResponse.json({ success: false, error: 'Limite de aprovação inválido.' }, { status: 400 })
    }

    const settings = await updateControlCenterSettings({
      dailyActionLimit: body.dailyActionLimit === null ? null : dailyActionLimit,
      requiresApprovalAboveUsd: body.requiresApprovalAboveUsd === null ? null : requiresApprovalAboveUsd,
      blockedCategories,
    })

    return NextResponse.json({ success: true, settings })
  } catch (error) {
    console.error('Erro ao atualizar a Central de Controle:', error)
    return NextResponse.json({ success: false, error: 'Não foi possível salvar os limites.' }, { status: 500 })
  }
}
