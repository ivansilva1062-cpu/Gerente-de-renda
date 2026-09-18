/*
 * PERFIL OPERACIONAL DO GERENTE DE RENDA
 *
 * IMPORTANTE:
 * Este arquivo NÃO guarda os dados pessoais.
 * Os dados reais serão colocados nas variáveis
 * de ambiente da Vercel.
 */

export type OperatorProfile = {
  fullName?: string
  email?: string
  phone?: string
  birthDate?: string
  country?: string
  city?: string
  languages: string[]
  skills: string[]
  experience: string[]
  profession?: string
  preferences: string[]
  cpf?: string
  professional?: Record<string, string>
  formAnswers?: Record<string, string>
  banking?: {
    bankName?: string
    accountHolder?: string
    accountNumber?: string
    agency?: string
    pixKey?: string
  }

  address?: {
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    city?: string
    state?: string
    zipCode?: string
    country?: string
  }
}

function optional(name: string) {
  const value = process.env[name]?.trim()
  return value || undefined
}

function list(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function getOperatorProfile():
  OperatorProfile {
  return {
    fullName: optional('OPERATOR_NAME'),
    email: optional('OPERATOR_EMAIL'),
    phone: optional('OPERATOR_PHONE'),
    birthDate: optional('OPERATOR_BIRTH_DATE'),
    country: optional('OPERATOR_ADDRESS_COUNTRY'),
    city: optional('OPERATOR_ADDRESS_CITY'),
    languages: list('OPERATOR_LANGUAGES'),
    skills: list('OPERATOR_SKILLS'),
    experience: list('OPERATOR_EXPERIENCE'),
    profession: optional('OPERATOR_PROFESSION'),
    preferences: list('OPERATOR_PREFERENCES'),
    cpf: optional('OPERATOR_CPF'),
    professional: undefined,
    formAnswers: undefined,
    banking: undefined,
    address: {
      street: optional('OPERATOR_ADDRESS_STREET'),
      number: optional('OPERATOR_ADDRESS_NUMBER'),
      complement: optional('OPERATOR_ADDRESS_COMPLEMENT'),
      neighborhood: optional('OPERATOR_ADDRESS_NEIGHBORHOOD'),
      city: optional('OPERATOR_ADDRESS_CITY'),
      state: optional('OPERATOR_ADDRESS_STATE'),
      zipCode: optional('OPERATOR_ADDRESS_ZIP'),
      country: optional('OPERATOR_ADDRESS_COUNTRY'),
    },
  }
}
