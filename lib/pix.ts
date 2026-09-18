/*
 * ==========================================
 * MÓDULO PIX — PREPARAÇÃO E VALIDAÇÃO
 * ==========================================
 *
 * Regra central (igual ao resto do Gerente): o agente NUNCA envia
 * um Pix sozinho. `SENSITIVE_ACTION` em lib/execution-engine.ts já
 * trata "pix" como ação sensível que força `waiting_human`.
 *
 * Este módulo só automatiza o que é seguro automatizar:
 * - preencher o remetente com a conta autorizada já cadastrada;
 * - validar chave, valor e descrição do destinatário;
 * - montar a transferência pronta para conferência.
 *
 * A autorização final do envio (ou a confirmação de um recebimento)
 * sempre depende de uma ação humana explícita através do canal
 * oficial do banco/PSP — nunca de senha, PIN ou OTP capturados por
 * este sistema.
 */

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'

export type PixDirection = 'send' | 'receive'

export type AuthorizedAccount = {
  bankName?: string
  accountHolder?: string
  accountNumber?: string
  agency?: string
  pixKey?: string
}

export type PixTransferRequestInput = {
  direction: PixDirection
  recipientKey: string
  recipientName?: string
  amount: number
  description: string
}

export type PreparedPixTransfer = {
  direction: PixDirection
  recipientKey: string
  recipientKeyType: PixKeyType
  recipientName: string | null
  amount: number
  description: string
  senderAccountHolder: string
  senderBankName?: string
  senderAgency?: string
  senderAccountNumber?: string
  senderPixKey?: string
}

export type PixValidationResult =
  | { valid: true; prepared: PreparedPixTransfer }
  | { valid: false; errors: string[] }

export const DEFAULT_MAX_PIX_AMOUNT = 5000
export const MAX_PIX_DESCRIPTION_LENGTH = 140

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function isValidCpf(rawValue: string) {
  const value = onlyDigits(rawValue)
  if (value.length !== 11 || /^(\d)\1{10}$/.test(value)) return false

  const digits = value.split('').map(Number)
  const calc = (length: number) => {
    let sum = 0
    for (let i = 0; i < length; i += 1) {
      sum += digits[i] * (length + 1 - i)
    }
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }

  return calc(9) === digits[9] && calc(10) === digits[10]
}

function isValidCnpj(rawValue: string) {
  const value = onlyDigits(rawValue)
  if (value.length !== 14 || /^(\d)\1{13}$/.test(value)) return false

  const digits = value.split('').map(Number)
  const calc = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < length; i += 1) {
      sum += digits[i] * weights[i]
    }
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }

  return calc(12) === digits[12] && calc(13) === digits[13]
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+55\d{10,11}$/
const RANDOM_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/*
 * Detecta o tipo da chave Pix a partir do formato, sem tentar
 * adivinhar chaves inválidas — retorna null quando nenhum formato
 * reconhecido é encontrado.
 */
export function detectPixKeyType(rawKey: string): PixKeyType | null {
  const key = rawKey.trim()
  if (!key) return null

  if (RANDOM_KEY_PATTERN.test(key)) return 'random'
  if (EMAIL_PATTERN.test(key)) return 'email'
  if (PHONE_PATTERN.test(key)) return 'phone'

  const digits = onlyDigits(key)
  if (digits.length === 11 && isValidCpf(digits)) return 'cpf'
  if (digits.length === 14 && isValidCnpj(digits)) return 'cnpj'

  return null
}

export function isValidPixKey(rawKey: string): boolean {
  return detectPixKeyType(rawKey) !== null
}

export function validatePixAmount(amount: number, maxAmount = DEFAULT_MAX_PIX_AMOUNT): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'O valor do Pix precisa ser um número maior que zero.'
  }
  if (Number(amount.toFixed(2)) !== amount) {
    return 'O valor do Pix não pode ter mais de duas casas decimais.'
  }
  if (amount > maxAmount) {
    return `O valor do Pix excede o limite autorizado de ${maxAmount.toFixed(2)}.`
  }
  return null
}

export function validatePixDescription(description: string): string | null {
  const value = description.trim()
  if (!value) {
    return 'Informe uma descrição para o Pix.'
  }
  if (value.length > MAX_PIX_DESCRIPTION_LENGTH) {
    return `A descrição do Pix não pode ter mais de ${MAX_PIX_DESCRIPTION_LENGTH} caracteres.`
  }
  return null
}

/*
 * Monta e valida a transferência Pix usando a conta autorizada já
 * cadastrada como remetente. Nunca aceita senha, PIN, OTP ou
 * qualquer credencial de autenticação como entrada.
 */
export function preparePixTransfer(
  input: PixTransferRequestInput,
  account: AuthorizedAccount,
  options: { maxAmount?: number } = {},
): PixValidationResult {
  const errors: string[] = []
  const maxAmount = options.maxAmount ?? DEFAULT_MAX_PIX_AMOUNT

  const recipientKey = input.recipientKey?.trim() ?? ''
  const recipientKeyType = recipientKey ? detectPixKeyType(recipientKey) : null
  if (!recipientKey || !recipientKeyType) {
    errors.push('Chave Pix do destinatário inválida ou em formato não reconhecido.')
  }

  const amountError = validatePixAmount(Number(input.amount), maxAmount)
  if (amountError) errors.push(amountError)

  const descriptionError = validatePixDescription(input.description ?? '')
  if (descriptionError) errors.push(descriptionError)

  if (!account.accountHolder || !(account.pixKey || account.accountNumber)) {
    errors.push('Nenhuma conta autorizada com dados bancários cadastrados foi encontrada no perfil.')
  }

  if (input.direction === 'send' && !account.pixKey && !account.accountNumber) {
    errors.push('A conta autorizada não possui chave Pix nem conta cadastrada para debitar o envio.')
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return {
    valid: true,
    prepared: {
      direction: input.direction,
      recipientKey,
      recipientKeyType: recipientKeyType as PixKeyType,
      recipientName: input.recipientName?.trim() || null,
      amount: Number(Number(input.amount).toFixed(2)),
      description: input.description.trim(),
      senderAccountHolder: account.accountHolder as string,
      senderBankName: account.bankName,
      senderAgency: account.agency,
      senderAccountNumber: account.accountNumber,
      senderPixKey: account.pixKey,
    },
  }
}
