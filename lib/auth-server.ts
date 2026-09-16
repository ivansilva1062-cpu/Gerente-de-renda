import 'server-only'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { isoUint8Array } from '@simplewebauthn/server/helpers'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/types'
import { cookies } from 'next/headers'
import { sql } from './db'

export const AUTH_COOKIE = 'gerente_session'
export const AUTH_USER_ID = 'gerente-owner'
const CHALLENGE_TTL_MS = 5 * 60 * 1000
const SESSION_TTL_SECONDS = 8 * 60 * 60
const DEFAULT_IDLE_TIMEOUT_SECONDS = 15 * 60
const MIN_IDLE_TIMEOUT_SECONDS = 60
const MAX_IDLE_TIMEOUT_SECONDS = 24 * 60 * 60

function rpId() {
  return process.env.WEBAUTHN_RP_ID ?? 'localhost'
}

function origin() {
  return process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000'
}

function requestWebAuthnConfig(request: Request) {
  const requestOrigin = request.headers.get('origin')?.trim()

  if (requestOrigin) {
    const parsed = new URL(requestOrigin)
    return {
      origin: parsed.origin,
      rpID: parsed.hostname,
    }
  }

  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    .trim()

  const forwardedProto =
    request.headers
      .get('x-forwarded-proto')
      ?.split(',')[0]
      .trim() || 'https'

  if (forwardedHost) {
    const forwardedOrigin = `${forwardedProto}://${forwardedHost}`
    const parsed = new URL(forwardedOrigin)

    return {
      origin: parsed.origin,
      rpID: parsed.hostname,
    }
  }

  const parsed = new URL(request.url)

  return {
    origin: parsed.origin,
    rpID: parsed.hostname,
  }
}

function sessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET
  if (!secret) throw new Error('AUTH_SESSION_SECRET não configurado.')
  return secret
}

function base64url(value: Uint8Array) {
  return Buffer.from(value).toString('base64url')
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function signSession(token: string) {
  return createHmac('sha256', sessionSecret()).update(token).digest('base64url')
}

function splitSession(value: string) {
  const separator = value.lastIndexOf('.')
  return separator > 0
    ? { token: value.slice(0, separator), signature: value.slice(separator + 1) }
    : null
}

export function isValidSessionCookie(value: string | undefined) {
  if (!value) return false
  const session = splitSession(value)
  if (!session || !sessionTokenIsFresh(session.token)) return false
  const { token, signature } = session
  const expected = signSession(token)
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export function sessionCookieValue(token: string) {
  return `${token}.${signSession(token)}`
}

export function sessionTokenIsFresh(token: string) {
  const expiresAt = Number(token.split('.')[1] ?? 0)
  return Number.isFinite(expiresAt) && expiresAt > Math.floor(Date.now() / 1000)
}

export async function ensureAuthTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      credential_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports JSONB,
      device_type TEXT,
      backed_up BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      challenge TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS auth_settings (
      id BOOLEAN PRIMARY KEY DEFAULT TRUE,
      idle_timeout_seconds INTEGER NOT NULL DEFAULT 900,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    INSERT INTO auth_settings (id)
    VALUES (TRUE)
    ON CONFLICT (id) DO NOTHING
  `
}

async function saveChallenge(kind: 'registration' | 'authentication', challenge: string) {
  const id = randomBytes(16).toString('hex')
  await sql`
    DELETE FROM webauthn_challenges
    WHERE kind = ${kind} OR expires_at <= NOW()
  `
  await sql`
    INSERT INTO webauthn_challenges (id, kind, challenge, expires_at)
    VALUES (${id}, ${kind}, ${challenge}, NOW() + INTERVAL '5 minutes')
  `
}

async function consumeChallenge(kind: 'registration' | 'authentication') {
  const rows = await sql`
    DELETE FROM webauthn_challenges
    WHERE kind = ${kind} AND expires_at > NOW()
    RETURNING challenge
  `
  return String(rows[0]?.challenge ?? '')
}

export async function hasCredential() {
  await ensureAuthTables()
  const rows = await sql`SELECT 1 FROM webauthn_credentials LIMIT 1`
  return rows.length > 0
}

export async function registrationOptions(request: Request) {
  await ensureAuthTables()

  const config = requestWebAuthnConfig(request)

  const credentials = await sql`
    SELECT credential_id, transports
    FROM webauthn_credentials
    WHERE user_id = ${AUTH_USER_ID}
  `

  const options = await generateRegistrationOptions({
    rpName: 'Gerente de Renda',
    rpID: config.rpID,
    userID: isoUint8Array.fromUTF8String(AUTH_USER_ID),
    userName: 'proprietario@gerente-de-renda',
    userDisplayName: 'Proprietário do Gerente de Renda',
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
    excludeCredentials: credentials.map((credential) => ({
      id: credential.credential_id,
      transports: Array.isArray(credential.transports) ? credential.transports : undefined,
    })),
  })

  await saveChallenge('registration', options.challenge)

  return options
}

export async function verifyRegistration(
  request: Request,
  response: RegistrationResponseJSON,
) {
  await ensureAuthTables()

  const config = requestWebAuthnConfig(request)

  const expectedChallenge = await consumeChallenge('registration')

  if (!expectedChallenge) {
    throw new Error('Desafio de cadastro expirado ou já utilizado.')
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('A passkey não foi verificada.')
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo

  await sql`
    INSERT INTO webauthn_credentials (
      credential_id, user_id, public_key, counter, transports, device_type, backed_up
    )
    VALUES (
      ${credential.id}, ${AUTH_USER_ID}, ${base64url(credential.publicKey)},
      ${credential.counter}, ${JSON.stringify(response.response.transports ?? [])},
      ${credentialDeviceType}, ${credentialBackedUp}
    )
    ON CONFLICT (credential_id) DO NOTHING
  `
}

export async function authenticationOptions(request: Request) {
  await ensureAuthTables()

  const config = requestWebAuthnConfig(request)

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: 'required',
    allowCredentials: [],
  })

  await saveChallenge('authentication', options.challenge)

  return options
}

export async function verifyAuthentication(
  request: Request,
  response: AuthenticationResponseJSON,
) {
  await ensureAuthTables()

  const config = requestWebAuthnConfig(request)

  const expectedChallenge = await consumeChallenge('authentication')

  if (!expectedChallenge) {
    throw new Error('Desafio de autenticação expirado ou já utilizado.')
  }

  const rows = await sql`
    SELECT credential_id, public_key, counter, transports
    FROM webauthn_credentials
    WHERE credential_id = ${response.id} AND user_id = ${AUTH_USER_ID}
    LIMIT 1
  `

  const credential = rows[0] as Record<string, unknown> | undefined

  if (!credential) {
    throw new Error('Passkey não cadastrada neste Gerente.')
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    credential: {
      id: String(credential.credential_id),
      publicKey: Buffer.from(String(credential.public_key), 'base64url'),
      counter: Number(credential.counter ?? 0),
      transports: Array.isArray(credential.transports) ? credential.transports : undefined,
    },
  })

  if (!verification.verified) {
    throw new Error('A autenticação da passkey falhou.')
  }

  await sql`
    UPDATE webauthn_credentials
    SET counter = ${verification.authenticationInfo.newCounter}, last_used_at = NOW()
    WHERE credential_id = ${response.id}
  `
}

export async function createSession() {
  await ensureAuthTables()

  const token = `${randomBytes(32).toString('base64url')}.${Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS}`

  await sql`
    INSERT INTO auth_sessions (token_hash, expires_at)
    VALUES (${tokenHash(token)}, NOW() + INTERVAL '8 hours')
  `

  return {
    value: sessionCookieValue(token),
    maxAge: SESSION_TTL_SECONDS,
  }
}

function clampIdleTimeout(value: number) {
  return Math.min(
    MAX_IDLE_TIMEOUT_SECONDS,
    Math.max(MIN_IDLE_TIMEOUT_SECONDS, Math.round(value)),
  )
}

export async function getIdleTimeoutSeconds() {
  await ensureAuthTables()

  const rows = await sql`
    SELECT idle_timeout_seconds
    FROM auth_settings
    WHERE id = TRUE
  `

  return clampIdleTimeout(
    Number(rows[0]?.idle_timeout_seconds ?? DEFAULT_IDLE_TIMEOUT_SECONDS),
  )
}

export async function updateIdleTimeoutSeconds(value: number) {
  const seconds = clampIdleTimeout(value)

  await ensureAuthTables()

  await sql`
    UPDATE auth_settings
    SET idle_timeout_seconds = ${seconds}, updated_at = NOW()
    WHERE id = TRUE
  `

  return seconds
}

export async function revokeSession(value: string | undefined) {
  if (!value || !isValidSessionCookie(value)) return

  const session = splitSession(value)

  if (session) {
    await sql`
      DELETE FROM auth_sessions
      WHERE token_hash = ${tokenHash(session.token)}
    `
  }
}

export async function sessionIsActive(value: string | undefined) {
  if (!value || !isValidSessionCookie(value)) return false

  const session = splitSession(value)

  if (!session) return false

  const idleTimeoutSeconds = await getIdleTimeoutSeconds()

  const rows = await sql`
    SELECT token_hash, last_seen_at, expires_at
    FROM auth_sessions
    WHERE token_hash = ${tokenHash(session.token)}
      AND expires_at > NOW()
      AND last_seen_at > NOW() - (${idleTimeoutSeconds} * INTERVAL '1 second')
    LIMIT 1
  `

  return rows.length > 0
}

export async function requestHasActiveSession() {
  return sessionIsActive((await cookies()).get(AUTH_COOKIE)?.value)
}

export async function sessionStatus(value: string | undefined) {
  const idleTimeoutSeconds = await getIdleTimeoutSeconds()

  if (!value || !isValidSessionCookie(value)) {
    return {
      active: false,
      idleTimeoutSeconds,
      lastSeenAt: null,
      expiresAt: null,
    }
  }

  const session = splitSession(value)

  if (!session) {
    return {
      active: false,
      idleTimeoutSeconds,
      lastSeenAt: null,
      expiresAt: null,
    }
  }

  const rows = await sql`
    SELECT last_seen_at, expires_at
    FROM auth_sessions
    WHERE token_hash = ${tokenHash(session.token)}
      AND expires_at > NOW()
      AND last_seen_at > NOW() - (${idleTimeoutSeconds} * INTERVAL '1 second')
    LIMIT 1
  `

  return {
    active: rows.length > 0,
    idleTimeoutSeconds,
    lastSeenAt: rows[0]?.last_seen_at ?? null,
    expiresAt: rows[0]?.expires_at ?? null,
  }
}

export async function touchSession(value: string | undefined) {
  if (!value || !isValidSessionCookie(value)) return false

  const session = splitSession(value)

  if (!session) return false

  const idleTimeoutSeconds = await getIdleTimeoutSeconds()

  const rows = await sql`
    UPDATE auth_sessions
    SET last_seen_at = NOW()
    WHERE token_hash = ${tokenHash(session.token)}
      AND expires_at > NOW()
      AND last_seen_at > NOW() - (${idleTimeoutSeconds} * INTERVAL '1 second')
    RETURNING token_hash
  `

  return rows.length > 0
}
