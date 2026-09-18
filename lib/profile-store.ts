import 'server-only'

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

import { sql } from './db'
import type { OperatorProfile } from './operator-profile'

const PROFILE_ID = 'gerente-owner'

type StoredProfile = OperatorProfile & {
  banking?: OperatorProfile['banking']
}

function encryptionKey() {
  const secret = process.env.AUTH_SESSION_SECRET
  if (!secret) throw new Error('AUTH_SESSION_SECRET não configurado.')
  return createHash('sha256').update(secret).digest()
}

function encrypt(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

function decrypt(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split('.')
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Perfil armazenado inválido.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export async function ensureProfileTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS operator_profiles (
      id TEXT PRIMARY KEY,
      encrypted_profile TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

export async function saveOperatorProfile(profile: StoredProfile) {
  await ensureProfileTable()
  await sql`
    INSERT INTO operator_profiles (id, encrypted_profile, updated_at)
    VALUES (${PROFILE_ID}, ${encrypt(JSON.stringify(profile))}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      encrypted_profile = EXCLUDED.encrypted_profile,
      updated_at = NOW()
  `
}

export async function getStoredOperatorProfile() {
  await ensureProfileTable()
  const rows = await sql`
    SELECT encrypted_profile
    FROM operator_profiles
    WHERE id = ${PROFILE_ID}
    LIMIT 1
  `
  if (!rows[0]?.encrypted_profile) return null
  return JSON.parse(decrypt(String(rows[0].encrypted_profile))) as StoredProfile
}

function mask(value?: string) {
  if (!value) return undefined
  if (value.length <= 4) return '****'
  return `${'*'.repeat(Math.max(2, value.length - 4))}${value.slice(-4)}`
}

export function maskOperatorProfile(profile: StoredProfile | null) {
  if (!profile) return null
  return {
    ...profile,
    cpf: mask(profile.cpf),
    banking: profile.banking
      ? {
          ...profile.banking,
          accountNumber: mask(profile.banking.accountNumber),
          agency: mask(profile.banking.agency),
          pixKey: mask(profile.banking.pixKey),
        }
      : undefined,
  }
}
