import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  AUTH_COOKIE,
  authenticationOptions,
  createSession,
  ensureAuthTables,
  hasCredential,
  getIdleTimeoutSeconds,
  registrationOptions,
  revokeSession,
  sessionStatus,
  touchSession,
  updateIdleTimeoutSeconds,
  verifyAuthentication,
  verifyRegistration,
} from '@/lib/auth-server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/types'

function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin
}

function errorResponse(error: unknown) {
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : 'Falha de autenticação.' },
    { status: 400 },
  )
}

export async function GET(request: Request) {
  try {
    await ensureAuthTables()
    const cookie = (await cookies()).get(AUTH_COOKIE)?.value
    const session = await sessionStatus(cookie)
    return NextResponse.json({
      configured: await hasCredential(),
      authenticated: session.active,
      session,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ success: false, error: 'Origem inválida.' }, { status: 403 })
  try {
    const body = await request.json() as {
      action?: string
      response?: RegistrationResponseJSON | AuthenticationResponseJSON
      idleTimeoutSeconds?: number
    }
    const cookieStore = await cookies()

    if (body.action === 'registration-options') {
      if (await hasCredential()) return NextResponse.json({ success: false, error: 'Este Gerente já possui uma passkey.' }, { status: 409 })
      return NextResponse.json(await registrationOptions())
    }
    if (body.action === 'registration-verify') {
      await verifyRegistration(body.response as RegistrationResponseJSON)
      const session = await createSession()
      cookieStore.set(AUTH_COOKIE, session.value, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
        path: '/', maxAge: session.maxAge,
      })
      return NextResponse.json({ success: true })
    }
    if (body.action === 'authentication-options') {
      if (!(await hasCredential())) return NextResponse.json({ success: false, error: 'Cadastre a primeira passkey.' }, { status: 409 })
      return NextResponse.json(await authenticationOptions())
    }
    if (body.action === 'authentication-verify') {
      await verifyAuthentication(body.response as AuthenticationResponseJSON)
      const session = await createSession()
      cookieStore.set(AUTH_COOKIE, session.value, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
        path: '/', maxAge: session.maxAge,
      })
      return NextResponse.json({ success: true })
    }
    if (body.action === 'logout') {
      await revokeSession(cookieStore.get(AUTH_COOKIE)?.value)
      cookieStore.set(AUTH_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 })
      return NextResponse.json({ success: true })
    }
    if (body.action === 'block') {
      await revokeSession(cookieStore.get(AUTH_COOKIE)?.value)
      cookieStore.set(AUTH_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 })
      return NextResponse.json({ success: true, blocked: true })
    }
    if (body.action === 'heartbeat') {
      const active = await touchSession(cookieStore.get(AUTH_COOKIE)?.value)
      if (!active) {
        cookieStore.set(AUTH_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 })
        return NextResponse.json({ success: false, error: 'Sessão expirada por inatividade.' }, { status: 401 })
      }
      return NextResponse.json({ success: true, session: await sessionStatus(cookieStore.get(AUTH_COOKIE)?.value) })
    }
    if (body.action === 'settings') {
      const active = await touchSession(cookieStore.get(AUTH_COOKIE)?.value)
      if (!active) return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
      if (typeof body.idleTimeoutSeconds === 'number') {
        await updateIdleTimeoutSeconds(body.idleTimeoutSeconds)
      }
      return NextResponse.json({ success: true, idleTimeoutSeconds: await getIdleTimeoutSeconds() })
    }
    return NextResponse.json({ success: false, error: 'Ação de autenticação desconhecida.' }, { status: 400 })
  } catch (error) {
    return errorResponse(error)
  }
}