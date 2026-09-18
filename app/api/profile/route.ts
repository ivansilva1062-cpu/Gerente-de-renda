import { NextResponse } from 'next/server'

import { requestHasActiveSession } from '@/lib/auth-server'
import { getStoredOperatorProfile, maskOperatorProfile, saveOperatorProfile } from '@/lib/profile-store'

function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin
}

export async function GET() {
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }

  const profile = await getStoredOperatorProfile()
  return NextResponse.json({ success: true, profile: maskOperatorProfile(profile) })
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, error: 'Origem inválida.' }, { status: 403 })
  }
  if (!(await requestHasActiveSession())) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Perfil inválido.' }, { status: 400 })
    }

    await saveOperatorProfile(body)
    return NextResponse.json({ success: true, profile: maskOperatorProfile(body) })
  } catch (error) {
    console.error('Erro ao salvar perfil do operador:', error instanceof Error ? error.message : 'falha desconhecida')
    return NextResponse.json({ success: false, error: 'Não foi possível salvar o perfil.' }, { status: 500 })
  }
}
