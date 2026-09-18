import 'server-only'

import { sql } from './db'
import type { PreparedPixTransfer } from './pix'

export type PixTransferStatus = 'waiting_human' | 'completed' | 'failed'

export type PixTransferRecord = {
  id: string
  direction: string
  recipientKey: string
  recipientKeyType: string
  recipientName: string | null
  amount: number
  description: string
  senderAccountHolder: string
  status: PixTransferStatus
  transactionId: string | null
  receipt: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export async function ensurePixTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS pix_transfers (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL,
      recipient_key TEXT NOT NULL,
      recipient_key_type TEXT NOT NULL,
      recipient_name TEXT,
      amount NUMERIC(12,2) NOT NULL,
      description TEXT NOT NULL,
      sender_account_holder TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting_human',
      transaction_id TEXT,
      receipt TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
}

/*
 * A preparação é sempre criada como `waiting_human`: o Gerente
 * monta e valida a transferência, mas somente a pessoa dona da
 * conta autoriza o envio (ou confirma o recebimento) pelo canal
 * oficial do banco/PSP.
 */
export async function createPreparedPixTransfer(id: string, prepared: PreparedPixTransfer) {
  await ensurePixTable()

  const rows = await sql`
    INSERT INTO pix_transfers (
      id, direction, recipient_key, recipient_key_type, recipient_name,
      amount, description, sender_account_holder, status
    )
    VALUES (
      ${id}, ${prepared.direction}, ${prepared.recipientKey}, ${prepared.recipientKeyType},
      ${prepared.recipientName}, ${prepared.amount}, ${prepared.description},
      ${prepared.senderAccountHolder}, 'waiting_human'
    )
    RETURNING
      id, direction, recipient_key, recipient_key_type, recipient_name,
      amount, description, sender_account_holder, status,
      transaction_id, receipt, error, created_at, updated_at
  `

  return mapRow(rows[0])
}

export async function getPixTransfer(id: string) {
  await ensurePixTable()
  const rows = await sql`
    SELECT
      id, direction, recipient_key, recipient_key_type, recipient_name,
      amount, description, sender_account_holder, status,
      transaction_id, receipt, error, created_at, updated_at
    FROM pix_transfers
    WHERE id = ${id}
    LIMIT 1
  `
  return rows[0] ? mapRow(rows[0]) : null
}

/*
 * Confirma o resultado já obtido pelo canal oficial: transactionId
 * e comprovante vêm do banco/PSP (ou são informados manualmente
 * pelo dono da conta), nunca de uma tentativa do agente de efetuar
 * o pagamento sozinho.
 */
export async function confirmPixTransfer(
  id: string,
  result: { status: 'completed' | 'failed'; transactionId?: string; receipt?: string; error?: string },
) {
  await ensurePixTable()
  const rows = await sql`
    UPDATE pix_transfers
    SET
      status = ${result.status},
      transaction_id = ${result.transactionId ?? null},
      receipt = ${result.receipt ?? null},
      error = ${result.error ?? null},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING
      id, direction, recipient_key, recipient_key_type, recipient_name,
      amount, description, sender_account_holder, status,
      transaction_id, receipt, error, created_at, updated_at
  `
  return rows[0] ? mapRow(rows[0]) : null
}

export async function listPixTransfers(limit = 100) {
  await ensurePixTable()
  const rows = await sql`
    SELECT
      id, direction, recipient_key, recipient_key_type, recipient_name,
      amount, description, sender_account_holder, status,
      transaction_id, receipt, error, created_at, updated_at
    FROM pix_transfers
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows.map(mapRow)
}

function mapRow(row: Record<string, unknown>): PixTransferRecord {
  return {
    id: String(row.id),
    direction: String(row.direction),
    recipientKey: String(row.recipient_key),
    recipientKeyType: String(row.recipient_key_type),
    recipientName: row.recipient_name ? String(row.recipient_name) : null,
    amount: Number(row.amount),
    description: String(row.description),
    senderAccountHolder: String(row.sender_account_holder),
    status: String(row.status) as PixTransferStatus,
    transactionId: row.transaction_id ? String(row.transaction_id) : null,
    receipt: row.receipt ? String(row.receipt) : null,
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}
