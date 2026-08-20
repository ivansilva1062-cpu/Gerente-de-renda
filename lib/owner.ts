/*
 * PERFIL DO PROPRIETÁRIO
 *
 * Dados pessoais NÃO ficam neste arquivo.
 *
 * O sistema deve receber dados privados
 * através das variáveis de ambiente da Vercel.
 */

export const ownerProfile = {
  name:
    process.env.OWNER_NAME ?? 'Proprietário',

  email:
    process.env.OWNER_EMAIL ?? '',

  country:
    process.env.OWNER_COUNTRY ?? 'Brasil',

  currency:
    process.env.OWNER_CURRENCY ?? 'USD',

  payment: {
    pix:
      process.env.OWNER_PIX ?? '',
  },

  agent: {
    language: 'pt-BR',

    /*
     * As metas são apenas indicadores.
     * Nunca são motivo para parar o agente.
     */
    keepWorkingAfterGoal: true,

    /*
     * O agente só para quando
     * o proprietário solicitar.
     */
    stopOnlyWhenOwnerRequests: true,
  },
}
