import { NextResponse } from 'next/server'

/*
 * WORKER DO GERENTE DE RENDA
 *
 * Esta rota é responsável por acionar o radar.
 *
 * IMPORTANTE:
 * - Não cria dinheiro.
 * - Não confirma pagamentos.
 * - Não usa identidade do usuário.
 * - Não executa cadastro automaticamente.
 * - Apenas aciona a descoberta de oportunidades.
 *
 * O pagamento real continua exclusivamente
 * em /api/earnings.
 */

export async function GET(
  request: Request,
) {
  try {
    /*
     * Segurança:
     *
     * Se CRON_SECRET existir, a rota exige
     * o mesmo segredo no Authorization.
     *
     * Isso permite usar a rota futuramente
     * com um Cron da Vercel sem deixá-la
     * aberta para qualquer pessoa.
     */
    const cronSecret =
      process.env.CRON_SECRET

    if (cronSecret) {
      const authorization =
        request.headers.get(
          'authorization',
        )

      if (
        authorization !==
        `Bearer ${cronSecret}`
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Não autorizado.',
          },
          {
            status: 401,
          },
        )
      }
    }

    /*
     * Descobre a origem do próprio site.
     *
     * Em produção:
     *
     * https://gerente-de-renda.vercel.app
     *
     * Em outros ambientes usamos
     * o host recebido pela requisição.
     */
    const url =
      new URL(request.url)

    const discoverUrl =
      `${url.origin}/api/discover`

    /*
     * Aciona o radar.
     */
    const response =
      await fetch(
        discoverUrl,
        {
          method: 'GET',
          cache: 'no-store',
        },
      )

    const data =
      await response.json()

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            'O radar não conseguiu executar.',
          radar:
            data,
        },
        {
          status:
            response.status,
        },
      )
    }

    /*
     * Retorno do worker.
     */
    return NextResponse.json({
      success: true,

      worker: {
        active: true,

        mode:
          'discovery',

        continuous:
          true,

        goalsStopAgent:
          false,

        onlyManualStop:
          true,

        confirmedEarningsOnly:
          true,
      },

      radar:
        data,
    })
  } catch (error) {
    console.error(
      'Erro no worker:',
      error,
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Erro interno no worker.',
      },
      {
        status: 500,
      },
    )
  }
}
