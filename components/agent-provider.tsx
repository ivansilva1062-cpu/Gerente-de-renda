'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type {
  ActivityEvent,
  AgentStatus,
  Integration,
  Opportunity,
  Task,
  Transaction,
} from '@/lib/types'

import {
  DAILY_GOAL,
  seedIntegrations,
} from '@/lib/mock-data'

interface AgentContextValue {
  status: AgentStatus
  today: number
  total: number
  dailyGoal: number
  opportunities: Opportunity[]
  tasks: Task[]
  activity: ActivityEvent[]
  transactions: Transaction[]
  integrations: Integration[]
  runningTasks: Task[]
  pendingTasks: Task[]
  stop: () => void
  resume: () => void
  resolvePending: (taskId: string) => void
  startOpportunity: (
    opportunityId: string,
  ) => void
  toggleIntegration: (
    key: string,
  ) => void
  registerConfirmedEarning: (
    amount: number,
    description: string,
    source: string,
  ) => Promise<void>
  refreshOpportunities: () => Promise<void>
}

const AgentContext =
  createContext<AgentContextValue | null>(
    null,
  )

const uid = () =>
  Math.random()
    .toString(36)
    .slice(2, 10)

type DatabaseEarning = {
  id: string
  description: string
  source: string
  amount: number | string
  created_at: string
}

type DiscoveryResponse = {
  success?: boolean
  discovered?: number
  rejected?: number
  total?: number
  searches?: number
  checked?: number
  message?: string
  error?: string
  opportunities?: Opportunity[]
}

/*
 * ==========================================
 * GERENTE DE RENDA
 * ==========================================
 *
 * REGRAS PRINCIPAIS
 *
 * 1. Começa trabalhando.
 * 2. Meta é apenas indicador.
 * 3. Atingir meta NÃO para o agente.
 * 4. Somente o usuário pode parar.
 * 5. Oportunidade NÃO é dinheiro.
 * 6. Tarefa concluída NÃO é pagamento.
 * 7. Somente /api/earnings confirma dinheiro.
 * 8. Pendência de uma tarefa não para as demais.
 * 9. O radar pode continuar descobrindo.
 * 10. Ações que exigem identidade humana
 *     não são fingidas pelo sistema.
 */
export function AgentProvider({
  children,
}: {
  children: React.ReactNode
}) {
  /*
   * ==========================================
   * ESTADO PRINCIPAL
   * ==========================================
   */

  const [status, setStatus] =
    useState<AgentStatus>(
      'working',
    )

  const [today, setToday] =
    useState(0)

  const [total, setTotal] =
    useState(0)

  const [opportunities, setOpportunities] =
    useState<Opportunity[]>(
      [],
    )

  const [tasks, setTasks] =
    useState<Task[]>([])

  const [activity, setActivity] =
    useState<ActivityEvent[]>(
      [],
    )

  const [transactions, setTransactions] =
    useState<Transaction[]>(
      [],
    )

  const [integrations, setIntegrations] =
    useState<Integration[]>(
      seedIntegrations,
    )

  /*
   * ==========================================
   * STATUS REF
   * ==========================================
   *
   * Permite que os intervalos saibam
   * se o agente está trabalhando ou pausado.
   */
  const statusRef =
    useRef(status)

  statusRef.current =
    status

  /*
   * ==========================================
   * CONTROLE DO RADAR
   * ==========================================
   *
   * Impede duas pesquisas simultâneas.
   */
  const discoveryRunningRef =
    useRef(false)

  /*
   * ==========================================
   * ATIVIDADE
   * ==========================================
   */
  const pushActivity =
    useCallback(
      (
        event: Omit<
          ActivityEvent,
          'id' | 'at'
        >,
      ) => {
        setActivity(
          (previous) =>
            [
              {
                id: uid(),
                at:
                  new Date().toISOString(),
                ...event,
              },
              ...previous,
            ].slice(0, 100),
        )
      },
      [],
    )

  /*
   * ==========================================
   * FINANCEIRO
   * ==========================================
   *
   * O saldo verdadeiro vem exclusivamente
   * de /api/earnings.
   */
  const refreshEarnings =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              '/api/earnings',
              {
                method: 'GET',
                cache: 'no-store',
              },
            )

          if (
            !response.ok
          ) {
            throw new Error(
              'Falha ao consultar ganhos.',
            )
          }

          const data =
            await response.json()

          const rows =
            Array.isArray(
              data.earnings,
            )
              ? data.earnings
              : []

          const normalized:
            Transaction[] =
            rows.map(
              (
                earning:
                  DatabaseEarning,
              ) => ({
                id:
                  earning.id,

                description:
                  earning.description,

                source:
                  earning.source,

                amount:
                  Number(
                    earning.amount,
                  ),

                at:
                  earning.created_at,

                status:
                  'confirmed' as const,
              }),
            )

          setTransactions(
            normalized,
          )

          /*
           * TOTAL CONFIRMADO
           */
          setTotal(
            Number(
              data.total ?? 0,
            ),
          )

          /*
           * GANHO DE HOJE
           */
          const now =
            new Date()

          const todayValue =
            normalized
              .filter(
                (transaction) => {
                  const date =
                    new Date(
                      transaction.at,
                    )

                  return (
                    date.getFullYear() ===
                      now.getFullYear() &&
                    date.getMonth() ===
                      now.getMonth() &&
                    date.getDate() ===
                      now.getDate()
                  )
                },
              )
              .reduce(
                (
                  sum,
                  transaction,
                ) =>
                  sum +
                  transaction.amount,
                0,
              )

          setToday(
            Number(
              todayValue.toFixed(
                2,
              ),
            ),
          )
        } catch (error) {
          console.error(
            'Erro ao carregar ganhos:',
            error,
          )
        }
      },
      [],
    )

  /*
   * ==========================================
   * DESCOBERTA
   * ==========================================
   *
   * O /api/discover:
   *
   * - pesquisa no Tavily
   * - filtra conteúdo
   * - grava no banco
   * - retorna opportunities
   *
   * Portanto NÃO chamamos
   * /api/opportunities com GET.
   */
  const discover =
    useCallback(
      async () => {
        if (
          statusRef.current !==
          'working'
        ) {
          return
        }

        if (
          discoveryRunningRef.current
        ) {
          return
        }

        discoveryRunningRef.current =
          true

        try {
          const response =
            await fetch(
              '/api/discover',
              {
                method: 'GET',
                cache: 'no-store',
              },
            )

          if (
            !response.ok
          ) {
            throw new Error(
              'Falha na descoberta.',
            )
          }

          const data:
            DiscoveryResponse =
            await response.json()

          /*
           * ==================================
           * RECEBE AS OPORTUNIDADES DO RADAR
           * ==================================
           */
          const incoming =
            Array.isArray(
              data.opportunities,
            )
              ? data.opportunities
              : []

          /*
           * Validação defensiva.
           *
           * Não deixa registros quebrados
           * entrarem na interface.
           */
          const valid =
            incoming.filter(
              (
                opportunity,
              ) =>
                Boolean(
                  opportunity?.id &&
                  opportunity?.title &&
                  opportunity?.source &&
                  opportunity?.category &&
                  Number.isFinite(
                    Number(
                      opportunity?.estimatedValue ??
                        0,
                    ),
                  ),
                ),
            )

          /*
           * Mantém no máximo 100.
           */
          setOpportunities(
            valid.slice(0, 100),
          )

          /*
           * ==================================
           * ATIVIDADE DO RADAR
           * ==================================
           */
          const discovered =
            Number(
              data.discovered ?? 0,
            )

          const rejected =
            Number(
              data.rejected ?? 0,
            )

          const total =
            Number(
              data.total ??
                valid.length,
            )

          if (
            discovered > 0
          ) {
            pushActivity({
              kind:
                'discovery',

              message:
                `Radar encontrou ${discovered} nova(s) oportunidade(s).`,
            })
          } else {
            pushActivity({
              kind:
                'discovery',

              message:
                `Radar verificado — ${total} oportunidade(s) disponível(is), ${rejected} resultado(s) rejeitado(s).`,
            })
          }

          return data
        } catch (error) {
          console.error(
            'Erro no radar:',
            error,
          )

          pushActivity({
            kind:
              'system',

            message:
              'O radar encontrou uma falha temporária ao pesquisar novas oportunidades.',
          })

          return null
        } finally {
          discoveryRunningRef.current =
            false
        }
      },
      [pushActivity],
    )

  /*
   * ==========================================
   * ATUALIZAR OPORTUNIDADES
   * ==========================================
   *
   * IMPORTANTE:
   *
   * Não existe mais GET em
   * /api/opportunities.
   *
   * O próprio /api/discover
   * devolve o catálogo atualizado.
   */
  const refreshOpportunities =
    useCallback(
      async () => {
        if (
          statusRef.current !==
          'working'
        ) {
          return
        }

        await discover()
      },
      [discover],
    )

  /*
   * ==========================================
   * CICLO DO RADAR
   * ==========================================
   *
   * Um ciclo significa:
   *
   * 1. Consultar fontes.
   * 2. Filtrar.
   * 3. Salvar.
   * 4. Atualizar a tela.
   */
  const runDiscoveryCycle =
    useCallback(
      async () => {
        if (
          statusRef.current !==
          'working'
        ) {
          return
        }

        await discover()
      },
      [discover],
    )

  /*
   * ==========================================
   * PAGAMENTO CONFIRMADO
   * ==========================================
   *
   * Este é o ÚNICO caminho que altera
   * o saldo.
   */
  const registerConfirmedEarning =
    useCallback(
      async (
        amount: number,
        description: string,
        source: string,
      ) => {
        if (
          !Number.isFinite(
            amount,
          ) ||
          amount <= 0
        ) {
          throw new Error(
            'Valor de pagamento inválido.',
          )
        }

        const earned =
          Number(
            amount.toFixed(
              2,
            ),
          )

        const response =
          await fetch(
            '/api/earnings',
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  id: uid(),

                  description,

                  source,

                  amount:
                    earned,
                }),
            },
          )

        if (
          !response.ok
        ) {
          throw new Error(
            'Não foi possível registrar o pagamento.',
          )
        }

        /*
         * Recarrega o saldo verdadeiro.
         */
        await refreshEarnings()

        pushActivity({
          kind:
            'earning',

          message:
            `Pagamento confirmado — ${description}`,

          amount:
            earned,
        })
      },
      [
        pushActivity,
        refreshEarnings,
      ],
    )

  /*
   * ==========================================
   * INICIAR OPORTUNIDADE
   * ==========================================
   *
   * IMPORTANTE:
   *
   * Clicar em "Iniciar" NÃO significa
   * que recebemos dinheiro.
   */
  const startOpportunity =
    useCallback(
      (
        opportunityId: string,
      ) => {
        if (
          statusRef.current !==
          'working'
        ) {
          return
        }

        setOpportunities(
          (previous) => {
            const opportunity =
              previous.find(
                (item) =>
                  item.id ===
                  opportunityId,
              )

            if (
              !opportunity
            ) {
              return previous
            }

            /*
             * Não inicia duas vezes
             * a mesma oportunidade.
             */
            if (
              opportunity.status ===
              'running'
            ) {
              return previous
            }

            const task:
              Task = {
              id: uid(),

              title:
                opportunity.title,

              source:
                opportunity.source,

              state:
                'running',

              estimatedValue:
                Number(
                  opportunity.estimatedValue ??
                    0,
                ),

              progress:
                0,

              startedAt:
                new Date().toISOString(),

              actionUrl:
                opportunity.url ??
                undefined,
            }

            /*
             * Coloca a tarefa na fila.
             */
            setTasks(
              (previousTasks) => [
                task,
                ...previousTasks,
              ],
            )

            pushActivity({
              kind:
                'start',

              message:
                `Oportunidade iniciada — ${opportunity.title}`,
            })

            /*
             * Marca a oportunidade
             * como em execução.
             */
            return previous.map(
              (item) =>
                item.id ===
                opportunityId
                  ? {
                      ...item,
                      status:
                        'running',
                    }
                  : item,
            )
          },
        )
      },
      [pushActivity],
    )

  /*
   * ==========================================
   * RESOLVER PENDÊNCIA
   * ==========================================
   *
   * Uma pendência não para o restante
   * do agente.
   */
  const resolvePending =
    useCallback(
      (
        taskId: string,
      ) => {
        const task =
          tasks.find(
            (item) =>
              item.id ===
              taskId,
          )

        if (
          !task ||
          task.state !==
            'pending'
        ) {
          return
        }

        setTasks(
          (previous) =>
            previous.map(
              (item) =>
                item.id ===
                  taskId
                  ? {
                      ...item,

                      state:
                        'running',

                      pendingReason:
                        undefined,
                    }
                  : item,
            ),
        )

        pushActivity({
          kind:
            'resolved',

          message:
            `Pendência retomada — ${task.title}.`,
        })
      },
      [
        pushActivity,
        tasks,
      ],
    )

  /*
   * ==========================================
   * PARAR
   * ==========================================
   *
   * SOMENTE o usuário chama isso.
   */
  const stop =
    useCallback(() => {
      setStatus(
        'paused',
      )

      pushActivity({
        kind:
          'system',

        message:
          'Gerente de Renda pausado pelo usuário.',
      })
    }, [pushActivity])

  /*
   * ==========================================
   * RETOMAR
   * ==========================================
   */
  const resume =
    useCallback(() => {
      setStatus(
        'working',
      )

      pushActivity({
        kind:
          'system',

        message:
          'Gerente de Renda retomado.',
      })

      /*
       * Pesquisa imediatamente
       * ao retomar.
       */
      void runDiscoveryCycle()
    }, [
      pushActivity,
      runDiscoveryCycle,
    ])

  /*
   * ==========================================
   * INTEGRAÇÕES
   * ==========================================
   */
  const toggleIntegration =
    useCallback(
      (
        key: string,
      ) => {
        setIntegrations(
          (previous) =>
            previous.map(
              (
                integration,
              ) =>
                integration.key ===
                key
                  ? {
                      ...integration,

                      connected:
                        !integration.connected,
                    }
                  : integration,
            ),
        )
      },
      [],
    )

  /*
   * ==========================================
   * PRIMEIRA EXECUÇÃO
   * ==========================================
   *
   * Quando o aplicativo abre:
   *
   * 1. Carrega saldo.
   * 2. Executa radar.
   */
  useEffect(() => {
    void refreshEarnings()

    void runDiscoveryCycle()
  }, [
    refreshEarnings,
    runDiscoveryCycle,
  ])

  /*
   * ==========================================
   * ATUALIZAÇÃO DO SALDO
   * ==========================================
   *
   * A cada 30 segundos.
   *
   * Isso NÃO altera o status do agente.
   */
  useEffect(() => {
    const interval =
      setInterval(
        () => {
          if (
            statusRef.current ===
            'working'
          ) {
            void refreshEarnings()
          }
        },
        30_000,
      )

    return () =>
      clearInterval(
        interval,
      )
  }, [refreshEarnings])

  /*
   * ==========================================
   * RADAR CONTÍNUO
   * ==========================================
   *
   * A cada 5 minutos.
   *
   * Meta atingida NÃO interfere.
   */
  useEffect(() => {
    const interval =
      setInterval(
        () => {
          if (
            statusRef.current ===
            'working'
          ) {
            void runDiscoveryCycle()
          }
        },
        5 * 60_000,
      )

    return () =>
      clearInterval(
        interval,
      )
  }, [runDiscoveryCycle])

  /*
   * ==========================================
   * REFRESH VISUAL
   * ==========================================
   *
   * A cada minuto.
   *
   * Como o radar já retorna a lista,
   * podemos simplesmente atualizar
   * através do /api/discover.
   *
   * Para não disparar Tavily a cada minuto,
   * NÃO fazemos nova descoberta aqui.
   *
   * O radar completo acontece a cada 5 min.
   */
  useEffect(() => {
    const interval =
      setInterval(
        () => {
          if (
            statusRef.current ===
            'working'
          ) {
            /*
             * Apenas mantém o saldo
             * atualizado aqui.
             *
             * O catálogo é atualizado
             * pelo radar de 5 minutos.
             */
          }
        },
        60_000,
      )

    return () =>
      clearInterval(
        interval,
      )
  }, [])

  /*
   * ==========================================
   * TAREFAS EM EXECUÇÃO
   * ==========================================
   */
  const runningTasks =
    useMemo(
      () =>
        tasks.filter(
          (task) =>
            task.state ===
            'running',
        ),
      [tasks],
    )

  /*
   * ==========================================
   * TAREFAS PENDENTES
   * ==========================================
   */
  const pendingTasks =
    useMemo(
      () =>
        tasks.filter(
          (task) =>
            task.state ===
            'pending',
        ),
      [tasks],
    )

  /*
   * ==========================================
   * CONTEXT
   * ==========================================
   */
  const value:
    AgentContextValue = {
    status,

    today,

    total,

    dailyGoal:
      DAILY_GOAL,

    opportunities,

    tasks,

    activity,

    transactions,

    integrations,

    runningTasks,

    pendingTasks,

    stop,

    resume,

    resolvePending,

    startOpportunity,

    toggleIntegration,

    registerConfirmedEarning,

    refreshOpportunities,
  }

  /*
   * ==========================================
   * PROVIDER
   * ==========================================
   */
  return (
    <AgentContext.Provider
      value={value}
    >
      {children}
    </AgentContext.Provider>
  )
}

/*
 * ==========================================
 * HOOK
 * ==========================================
 */
export function useAgent() {
  const context =
    useContext(
      AgentContext,
    )

  if (!context) {
    throw new Error(
      'useAgent deve ser usado dentro de AgentProvider',
    )
  }

  return context
}
