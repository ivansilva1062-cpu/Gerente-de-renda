/*
 * DADOS DO PROPRIETÁRIO
 *
 * Cadastro central do Gerente de Renda.
 *
 * IMPORTANTE:
 * Nunca coloque aqui:
 * - senhas
 * - CPF
 * - RG
 * - cartão
 * - CVV
 * - códigos 2FA
 * - documentos
 */

export const ownerProfile = {
  name: 'Ivan',
  email: 'ivansilva1062@gmail.com',
  country: 'Brasil',
  currency: 'USD',

  /*
   * DADOS DE RECEBIMENTO
   *
   * O Pix é apenas o destino cadastrado.
   * Não significa que houve recebimento.
   */
  payment: {
    pix: '11714839966',
  },

  /*
   * PREFERÊNCIAS DO AGENTE
   */
  agent: {
    language: 'pt-BR',

    // Atingir uma meta NÃO faz o agente parar.
    keepWorkingAfterGoal: true,

    // Só parar quando Ivan mandar explicitamente.
    stopOnlyByOwnerCommand: true,
  },

  /*
   * REGRAS DE SEGURANÇA
   */
  security: {
    neverExposeSecrets: true,
    neverStorePasswordsInSourceCode: true,
    neverStoreCardDataInSourceCode: true,

    // Ações envolvendo identidade precisam de aprovação humana.
    requireHumanApprovalForIdentitySensitiveActions: true,

    // Ações financeiras precisam de aprovação humana.
    requireHumanApprovalForFinancialActions: true,
  },
} as const

export type OwnerProfile =
  typeof ownerProfile
