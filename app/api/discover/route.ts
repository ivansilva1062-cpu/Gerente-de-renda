import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/*
 * RADAR GLOBAL DE OPORTUNIDADES
 *
 * O radar mantém fontes legítimas de renda
 * e prepara o sistema para receber novas
 * oportunidades posteriormente.
 *
 * REGRAS:
 * - oportunidade não é dinheiro;
 * - estimativa não altera saldo;
 * - não usa senha, CPF, cartão ou 2FA;
 * - não responde testes/pesquisas em nome do usuário;
 * - não finge identidade;
 * - ganhos reais continuam exclusivamente em /api/earnings;
 * - o agente pode continuar pesquisando enquanto estiver ativo.
 */

type RadarSource = {
  id: string
  title: string
  source: string
  category:
    | 'microtasks'
    | 'freelance'
    | 'surveys'
    | 'content'
    | 'affiliate'
    | 'testing'
  confidence: number
  url: string
  language: 'pt' | 'en' | 'global'
  requiresSignup: boolean
  requiresUserAction: boolean
  automatedPreparation: boolean
}

/*
 * CATÁLOGO INICIAL
 *
 * Estas são fontes conhecidas.
 *
 * O próximo estágio poderá adicionar
 * novas fontes vindas de APIs de busca.
 */
const SOURCES: RadarSource[] = [
  {
    id: 'source-prolific',
    title: 'Prolific — estudos pagos',
    source: 'Prolific',
    category: 'surveys',
    confidence: 95,
    url:
      'https://www.prolific.com/participants-join-us',
    language: 'global',
    requiresSignup: true,
    requiresUserAction: true,
    automatedPreparation: true,
  },

  {
    id: 'source-usertesting',
    title:
      'UserTesting — testes de sites e aplicativos',
    source: 'UserTesting',
    category: 'testing',
    confidence: 95,
    url:
      'https://www.usertesting.com/get-paid-to-test',
    language: 'global',
    requiresSignup: true,
    requiresUserAction: true,
    automatedPreparation: true,
  },

  {
    id: 'source-clickworker',
    title:
      'Clickworker — microtarefas',
    source: 'Clickworker',
    category: 'microtasks',
    confidence: 90,
    url:
      'https://www.clickworker.com/clickworker/',
    language: 'global',
    requiresSignup: true,
    requiresUserAction: true,
    automatedPreparation: true,
  },

  {
    id: 'source-fiverr',
    title:
      'Fiverr — vender serviços',
    source: 'Fiverr',
    category: 'freelance',
    confidence: 90,
    url:
      'https://www.fiverr.com/',
    language: 'global',
    requiresSignup: true,
    requiresUserAction: true,
    automatedPreparation: true,
  },

  /*
   * CATEGORIAS PARA O RADAR FUTURO
   *
   * Não inventamos uma oportunidade específica.
   * São apenas categorias que o radar poderá
   * pesquisar quando conectarmos uma fonte de busca.
   */
]

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      estimated_value NUMERIC(12,2) NOT NULL DEFAULT 0,
      confidence INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new',
      url TEXT,
      requires_signup BOOLEAN NOT NULL DEFAULT TRUE,
      requires_user_action BOOLEAN NOT NULL DEFAULT TRUE,
      language TEXT NOT NULL DEFAULT 'global',
      automated_preparation BOOLEAN NOT NULL DEFAULT FALSE,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  /*
   * Compatibilidade com a tabela antiga.
   */
  await sql`
    ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS language TEXT
    NOT NULL DEFAULT 'global'
  `

  await sql`
    ALTER TABLE opportunities
    ADD COLUMN IF NOT EXISTS automated_preparation BOOLEAN
    NOT NULL DEFAULT FALSE
  `
}

/*
 * Registra ou atualiza fontes conhecidas.
 */
async function registerSources() {
  let discovered = 0

  for (const source of SOURCES) {
    const result = await sql`
      INSERT INTO opportunities (
        id,
        title,
        source,
        category,
        estimated_value,
        confidence,
        status,
        url,
        requires_signup,
        requires_user_action,
        language,
        automated_preparation,
        discovered_at
      )
      VALUES (
        ${source.id},
        ${source.title},
        ${source.source},
        ${source.category},
        0,
        ${source.confidence},
        'new',
        ${source.url},
        ${source.requiresSignup},
        ${source.requiresUserAction},
        ${source.language},
        ${source.automatedPreparation},
        NOW()
      )

      ON CONFLICT (id)
      DO UPDATE SET
        title =
          EXCLUDED.title,
        source =
          EXCLUDED.source,
        category =
          EXCLUDED.category,
        confidence =
          EXCLUDED.confidence,
        url =
          EXCLUDED.url,
        requires_signup =
          EXCLUDED.requires_signup,
        requires_user_action =
          EXCLUDED.requires_user_action,
        language =
          EXCLUDED.language,
        automated_preparation =
          EXCLUDED.automated_preparation

      RETURNING id
    `

    if (result.length > 0) {
      discovered += 1
    }
  }

  return discovered
}

/*
 * GET
 *
 * Executa uma varredura do catálogo.
 */
export async function GET() {
  try {
    await ensureTable()

    const discovered =
      await registerSources()

    const rows = await sql`
      SELECT
        id,
        title,
        source,
        category,
        estimated_value,
        confidence,
        status,
        url,
        requires_signup,
        requires_user_action,
        language,
        automated_preparation,
        discovered_at,
        created_at
      FROM opportunities
      ORDER BY
        confidence DESC,
        discovered_at DESC
      LIMIT 100
    `

    const opportunities =
      rows.map((row) => ({
        id:
          row.id,

        title:
          row.title,

        source:
          row.source,

        category:
          row.category,

        /*
         * IMPORTANTE:
         *
         * Zero não significa que a fonte
         * não paga.
         *
         * Significa somente que ainda
         * não temos um valor de ganho
         * confirmado para esta oportunidade.
         */
        estimatedValue:
          Number(
            row.estimated_value ?? 0,
          ),

        confidence:
          Number(
            row.confidence ?? 0,
          ),

        status:
          row.status,

        url:
          row.url ?? null,

        requiresSignup:
          Boolean(
            row.requires_signup,
          ),

        requiresUserAction:
          Boolean(
            row.requires_user_action,
          ),

        language:
          row.language ?? 'global',

        automatedPreparation:
          Boolean(
            row.automated_preparation,
          ),

        discoveredAt:
          row.discovered_at,

        createdAt:
          row.created_at,
      }))

    return NextResponse.json({
      success: true,

      /*
       * Fontes verificadas nesta rodada.
       */
      discovered,

      checked:
        SOURCES.length,

      total:
        opportunities.length,

      opportunities,

      radar: {
        active: true,

        languages: [
          'pt',
          'en',
          'global',
        ],

        categories: [
          'microtasks',
          'freelance',
          'surveys',
          'content',
          'affiliate',
          'testing',
        ],

        continuous:
          true,

        goalsStopAgent:
          false,

        onlyManualStop:
          true,

        estimatedValuesAreNotMoney:
          true,

        confirmedEarningsOnly:
          true,

        identityActionsRequireUser:
          true,
      },

      nextStage:
        'Conectar uma fonte legítima de pesquisa para descobrir novas oportunidades além do catálogo inicial.',
    })
  } catch (error) {
    console.error(
      'Erro no radar global:',
      error,
    )

    return NextResponse.json(
      {
        success: false,

        error:
          'Erro ao atualizar radar global',

        opportunities: [],
      },
      {
        status: 500,
      },
    )
  }
}
