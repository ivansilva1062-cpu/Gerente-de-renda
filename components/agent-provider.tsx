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

  resolvePending: (
    taskId: string,
  ) => void

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
 * 10. Ações humanas não são fingidas.
 * 11. O sistema não inventa pagamentos.
 * 12. O sistema não inventa conclusões.
 */
export function AgentProvider({
  children,
}: {
  children: React.ReactNode
}) {
  /*
   * ==========================================
   * ESTADOS
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
   */

  const statusRef =
    useRef(status)

  statusRef.current =
    status

  /*
   * ==========================================
   * CONTROLE DO RADAR
   * ==========================================
   */

  const discoveryRunningRef =
    useRef(false)

  /*
   * ==========================================
   * CONTROLE DAS TAREFAS
   * ==========================================
   *
   * Evita iniciar a mesma oportunidade
   * várias vezes ao mesmo tempo.
   */

  const taskRunningRef =
    useRef<Set<string>>(
      new Set(),
    )

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
           * SOMENTE dinheiro confirmado.
           */

          setTotal(
            Number(
              data.total ?? 0,
            ),
          )

          /*
           * GANHOS DE HOJE
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
   * - pesquisa fontes
   * - filtra resultados
   * - salva oportunidades
   * - devolve catálogo
   */

  const discover =
    useCallback(
      async () => {
        if (
          statusRef.current !==
          'working'
        ) {
          return null
        }

        if (
          discoveryRunningRef.current
        ) {
          return null
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
           * RECEBE O CATÁLOGO
           * ==================================
           */

          const incoming =
            Array.isArray(
              data.opportunities,
            )
              ? data.opportunities
              : []

          /*
           * ==================================
           * VALIDAÇÃO
           * ==================================
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
           * ==================================
           * ORDENAÇÃO
           * ==================================
           *
           * Primeiro:
           * oportunidades acionáveis.
           *
           * Depois:
           * demais resultados.
           *
           * Em caso de empate:
           * maior confiança primeiro.
           */

          const sorted =
            [...valid].sort(
              (
                a,
                b,
              ) => {
                const aAction =
                  a.requiresUserAction
                    ? 1
                    : 0

                const bAction =
                  b.requiresUserAction
                    ? 1
                    : 0

                if (
                  aAction !==
                  bAction
                ) {
                  return (
                    bAction -
                    aAction
                  )
                }

                return (
                  Number(
                    b.confidence ??
                      0,
                  ) -
                  Number(
                    a.confidence ??
                      0,
                  )
                )
              },
            )

          /*
           * Mantém no máximo 100.
           */

          setOpportunities(
            sorted.slice(
              0,
              100,
            ),
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
                sorted.length,
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
   * ÚNICO caminho que altera o saldo.
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
   * MARCAR OPORTUNIDADE
   * ==========================================
   */

  const updateOpportunityStatus =
    useCallback(
      (
        opportunityId: string,
        nextStatus:
          | Opportunity['status'],
      ) => {
        setOpportunities(
          (previous) =>
            previous.map(
              (item) =>
                item.id ===
                  opportunityId
                  ? {
                      ...item,
                      status:
                        nextStatus,
                    }
                  : item,
            ),
        )
      },
      [],
    )

  /*
   * ==========================================
   * WORKER DA OPORTUNIDADE
   * ==========================================
   *
   * IMPORTANTE:
   *
   * O Worker não finge que acessou
   * uma plataforma como se fosse o usuário.
   *
   * Ele:
   *
   * 1. recebe a oportunidade;
   * 2. cria a tarefa;
   * 3. verifica se existe ação humana;
   * 4. coloca em pendência quando necessário;
   * 5. registra o estado;
   * 6. deixa o restante do sistema continuar.
   */

  const processOpportunity =
    useCallback(
      async (
        opportunity: Opportunity,
        taskId: string,
      ) => {
        if (
          statusRef.current !==
          'working'
        ) {
          return
        }

        /*
         * Pequena pausa para garantir
         * que a criação da tarefa
         * apareça visualmente antes
         * da análise.
         *
         * NÃO é simulação de trabalho.
         */
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              250,
            ),
        )

        if (
          statusRef.current !==
          'working'
        ) {
          return
        }

        /*
         * ==================================
         * VERIFICAÇÃO DE URL
         * ==================================
         */

        if (
          !opportunity.url
        ) {
          setTasks(
            (previous) =>
              previous.map(
                (task) =>
                  task.id ===
                    taskId
                    ? {
                        ...task,
                        state:
                          'pending',
                        progress:
                          10,
                        pendingReason:
                          'A oportunidade não possui uma URL de ação disponível.',
                      }
                    : task,
              ),
          )

          updateOpportunityStatus(
            opportunity.id,
            'pending',
          )

          pushActivity({
            kind:
              'pending',

            message:
              `Aguardando ação — ${opportunity.title}: não existe URL disponível.`,
          })

          return
        }

        /*
         * ==================================
         * AÇÃO HUMANA
         * ==================================
         *
         * A maioria das plataformas
         * legítimas exige cadastro,
         * login, identidade ou alguma
         * decisão do usuário.
         *
         * Nesses casos NÃO fingimos.
         */

        if (
          opportunity.requiresUserAction ||
          opportunity.requiresSignup
        ) {
          setTasks(
            (previous) =>
              previous.map(
                (task) =>
                  task.id ===
                    taskId
                    ? {
                        ...task,

                        state:
                          'pending',

                        progress:
                          25,

                        pendingReason:
                          opportunity.requiresSignup
                            ? 'É necessário cadastro ou ação do usuário para continuar.'
                            : 'É necessária uma ação do usuário para continuar.',
                      }
                    : task,
              ),
          )

          updateOpportunityStatus(
            opportunity.id,
            'pending',
          )

          pushActivity({
            kind:
              'pending',

            message:
              opportunity.requiresSignup
                ? `Aguardando cadastro — ${opportunity.title}.`
                : `Aguardando ação do Ivan — ${opportunity.title}.`,
          })

          return
        }

        /*
         * ==================================
         * SEM AÇÃO HUMANA DECLARADA
         * ==================================
         *
         * Ainda assim não vamos marcar
         * como concluída automaticamente.
         *
         * O sistema não possui confirmação
         * externa de execução.
         */

        setTasks(
          (previous) =>
            previous.map(
              (task) =>
                task.id ===
                  taskId
                  ? {
                      ...task,

                      state:
                        'pending',

                      progress:
                        40,

                      pendingReason:
                        'Aguardando confirmação da execução pela fonte oficial.',
                    }
                  : task,
            ),
        )

        updateOpportunityStatus(
          opportunity.id,
          'pending',
        )

        pushActivity({
          kind:
            'pending',

          message:
            `Aguardando confirmação externa — ${opportunity.title}.`,
        })
      },
      [
        pushActivity,
        updateOpportunityStatus,
      ],
    )

  /*
   * ==========================================
   * INICIAR OPORTUNIDADE
   * ==========================================
   *
   * Este é o ponto que agora realmente
   * aciona o Worker.
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

        /*
         * Procura a oportunidade
         * atual.
         */

        const opportunity =
          opportunities.find(
            (item) =>
              item.id ===
              opportunityId,
          )

        if (
          !opportunity
        ) {
          pushActivity({
            kind:
              'system',

            message:
              'Não foi possível iniciar: oportunidade não encontrada.',
          })

          return
        }

        /*
         * Não permite iniciar
         * novamente uma tarefa já
         * em execução.
         */

        if (
          opportunity.status ===
            'running' ||
          opportunity.status ===
            'done'
        ) {
          return
        }

        /*
         * Evita duplicação.
         */

        if (
          taskRunningRef.current.has(
            opportunityId,
          )
        ) {
          return
        }

        taskRunningRef.current.add(
          opportunityId,
        )

        /*
         * Cria a tarefa.
         */

        const taskId =
          uid()

        const task:
          Task = {
          id:
            taskId,

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
         * Coloca na fila.
         */

        setTasks(
          (previous) => [
            task,
            ...previous,
          ],
        )

        /*
         * Marca oportunidade
         * como executando.
         */

        updateOpportunityStatus(
          opportunityId,
          'running',
        )

        /*
         * Registra atividade.
         */

        pushActivity({
          kind:
            'start',

          message:
            `Oportunidade iniciada — ${opportunity.title}`,
        })

        /*
         * Executa o Worker.
         */

        void processOpportunity(
          opportunity,
          taskId,
        ).finally(() => {
          taskRunningRef.current.delete(
            opportunityId,
          )
        })
      },
      [
        opportunities,
        processOpportunity,
        pushActivity,
        updateOpportunityStatus,
      ],
    )

  /*
   * ==========================================
   * RESOLVER PENDÊNCIA
   * ==========================================
   *
   * A tarefa volta para execução.
   *
   * Não marcamos como concluída.
   * Não registramos dinheiro.
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

        /*
         * Retorna a tarefa
         * para execução.
         */

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

                      progress:
                        Math.max(
                          item.progress,
                          50,
                        ),

                      pendingReason:
                        undefined,
                    }
                  : item,
            ),
        )

        /*
         * Procura oportunidade
         * correspondente.
         */

        const opportunity =
          opportunities.find(
            (item) =>
              item.title ===
                task.title &&
              item.source ===
                task.source,
          )

        if (
          opportunity
        ) {
          updateOpportunityStatus(
            opportunity.id,
            'running',
          )

          /*
           * Reprocessa a etapa.
           */

          if (
            !taskRunningRef.current.has(
              opportunity.id,
            )
          ) {
            taskRunningRef.current.add(
              opportunity.id,
            )

            void processOpportunity(
              opportunity,
              task.id,
            ).finally(() => {
              taskRunningRef.current.delete(
                opportunity.id,
              )
            })
          }
        }

        pushActivity({
          kind:
            'resolved',

          message:
            `Pendência retomada — ${task.title}.`,
        })
      },
      [
        opportunities,
        processOpportunity,
        pushActivity,
        tasks,
        updateOpportunityStatus,
      ],
    )

  /*
   * ==========================================
   * PARAR
   * ==========================================
   *
   * SOMENTE o usuário chama.
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
       * Pesquisa imediatamente.
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
   * META NÃO PARA.
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
