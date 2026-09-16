import { NextResponse, type NextRequest } from 'next/server'

const COOKIE = 'gerente_session'

async function validSignature(value: string) {
  const separator = value.lastIndexOf('.')
  const token = separator > 0 ? value.slice(0, separator) : ''
  const signature = separator > 0 ? value.slice(separator + 1) : ''
  const [randomPart, expiresAt] = token.split('.')
  const secret = process.env.AUTH_SESSION_SECRET
  if (!randomPart || !expiresAt || !signature || !secret || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token))
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  return signature === expected
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/_next') || pathname === '/favicon.ico' || pathname.startsWith('/manifest') || pathname.startsWith('/sw.js') || pathname.startsWith('/icon') || pathname.startsWith('/apple-icon')) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get(COOKIE)?.value
  if (cookie && await validSignature(cookie)) return NextResponse.next()

  const cronSecret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')
  if (
    cronSecret &&
    authorization === `Bearer ${cronSecret}` &&
    (pathname === '/api/worker' || pathname === '/api/discover')
  ) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ success: false, error: 'Autenticação necessária.' }, { status: 401 })
  }

  if (pathname === '/acesso') return NextResponse.next()

  return NextResponse.redirect(new URL('/acesso', request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}