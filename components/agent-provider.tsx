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
  startOpportunity: (opportunityId: string) => void
  toggleIntegration: (key: string) => void
  registerConfirmedEarning: (
    amount: number,
    description: string,
    source: string,
  ) => Promise<void>
  refreshOpportunities: () => Promise<void>
}

const AgentContext =
  createContext<AgentContextValue | null>(null)

const uid = () =>
  Math.random().toString(36).slice(2, 10)

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
  checked?: number
  message?: string
  error?: string
}

/*
 * PROVIDER PRINCIPAL
 *
 * REGRAS DO GERENTE:
 *
 * 1. O agente começa trabalhando.
 * 2. Metas são indicadores.
 * 3. Meta atingida NÃO para o agente.
 * 4. Somente o usuário pode mandar parar.
 * 5. Oportunidade NÃO é dinheiro.
 * 6. Tarefa concluída NÃO é pagamento.
 * 7. Somente /api/earnings confirma dinheiro.
 * 8. Pendência de uma tarefa não para as demais.
 * 9. Descoberta pode continuar automaticamente.
 * 10. Ações que exigem identidade humana não
 *     são fingidas pelo sistema.
 */
export function AgentProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [status, setStatus] =
    useState<AgentStatus>('working')

  const [today, setToday] =
    useState(0)

  const [total, setTotal] =
    useState(0)

  const [opportunities, setOpportunities] =
    useState<Opportunity[]>([])

  const [tasks, setTasks] =
    useState<Task[]>([])

  const [activity, setActivity] =
    useState<ActivityEvent[]>([])

  const [transactions, setTransactions] =
    useState<Transaction[]>([])

  const [integrations, setIntegrations] =
    useState<Integration[]>(
      seedIntegrations,
    )

  /*
   * Guarda o status mais recente.
   */
  const statusRef =
    useRef(status)

  statusRef.current =
    status

  /*
   * Evita várias descobertas simultâneas.
   */
  const discoveryRunningRef =
    useRef(false)

  /*
   * Registra atividade no painel.
   */
  const pushActivity =
    useCallback(
      (
        event: Omit<
          ActivityEvent,
          'id' | 'at'
        >,
      ) => {
        setActivity((prev) =>
          [
            {
              id: uid(),
              at:
                new Date().toISOString(),
              ...event,
            },
            ...prev,
          ].slice(0, 100),
        )
      },
      [],
    )

  /*
   * ============================
   * FINANCEIRO
   * ============================
   *
   * O saldo é exclusivamente
   * o que a API /api/earnings
   * considera confirmado.
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

          if (!response.ok) {
            throw new Error(
              'Falha ao consultar ganhos',
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

          setTotal(
            Number(
              data.total ?? 0,
            ),
          )

          const now =
            new Date()

          const todayValue =
            normalized
              .filter(
                (tx) => {
                  const date =
                    new Date(
                      tx.at,
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
                  tx,
                ) =>
                  sum +
                  tx.amount,
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
   * ============================
   * DESCOBERTA
   * ============================
   *
   * Chama /api/discover.
   *
   * IMPORTANTE:
   * A API precisa possuir uma fonte
   * legítima de descoberta.
   *
   * O provider não inventa oportunidades.
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

          if (!response.ok) {
            throw new Error(
              'Falha na descoberta',
            )
          }

          const data:
            DiscoveryResponse =
            await response.json()

          const discovered =
            Number(
              data.discovered ?? 0,
            )

          const checked =
            Number(
              data.checked ?? 0,
            )

          if (
            discovered > 0
          ) {
            pushActivity({
              kind:
                'discovery',
              message:
                `${discovered} nova(s) oportunidade(s) descoberta(s).`,
            })
          } else {
            pushActivity({
              kind:
                'discovery',
              message:
                `Radar verificado — ${checked} fonte(s) consultada(s).`,
            })
          }
        } catch (error) {
          console.error(
            'Erro no radar:',
            error,
          )
        } finally {
          discoveryRunningRef.current =
            false
        }
      },
      [pushActivity],
    )

  /*
   * ============================
   * CARREGAR OPORTUNIDADES
   * ============================
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

        try {
          const response =
            await fetch(
              '/api/opportunities',
              {
                method: 'GET',
                cache: 'no-store',
              },
            )

          if (
            response.status ===
            404
          ) {
            setOpportunities(
              [],
            )
            return
          }

          if (!response.ok) {
            throw new Error(
              'Falha ao consultar oportunidades',
            )
          }

          const data =
            await response.json()

          const incoming =
            Array.isArray(
              data.opportunities,
            )
              ? data.opportunities
              : []

          const valid =
            incoming.filter(
              (op: Opportunity) =>
                Boolean(
                  op.id &&
                  op.title &&
                  op.source &&
                  op.category &&
                  Number.isFinite(
                    Number(
                      op.estimatedValue,
                    ),
                  ),
                ),
            )

          setOpportunities(
            valid.slice(0, 100),
          )
        } catch (error) {
          console.error(
            'Erro ao consultar oportunidades:',
            error,
          )
        }
      },
      [],
    )

  /*
   * ============================
   * CICLO DO RADAR
   * ============================
   *
   * Descobre primeiro.
   * Depois recarrega a fila.
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

        if (
          statusRef.current !==
          'working'
        ) {
          return
        }

        await refreshOpportunities()
      },
      [
        discover,
        refreshOpportunities,
      ],
    )

  /*
   * ============================
   * GANHO CONFIRMADO
   * ============================
   *
   * ÚNICO caminho que altera
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
            'Valor de pagamento inválido',
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
              method:
                'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify(
                  {
                    id: uid(),
                    description,
                    source,
                    amount:
                      earned,
                  },
                ),
            },
          )

        if (!response.ok) {
          throw new Error(
            'Não foi possível registrar o pagamento',
          )
        }

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
   * ============================
   * INICIAR OPORTUNIDADE
   * ============================
   *
   * Isso NÃO significa pagamento.
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
          (prev) => {
            const opportunity =
              prev.find(
                (o) =>
                  o.id ===
                  opportunityId,
              )

            if (
              !opportunity
            ) {
              return prev
            }

            if (
              opportunity.status ===
              'running'
            ) {
              return prev
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
                    opportunity.estimatedValue,
                  ),
                progress: 0,
                startedAt:
                  new Date().toISOString(),

                /*
                 * URL fica disponível
                 * para a interface usar.
                 */
                actionUrl:
                  opportunity.url ??
                  undefined,
              }

            setTasks(
              (prevTasks) => [
                task,
                ...prevTasks,
              ],
            )

            pushActivity({
              kind:
                'start',
              message:
                `Oportunidade iniciada — ${opportunity.title}`,
            })

            return prev.map(
              (o) =>
                o.id ===
                opportunityId
                  ? {
                      ...o,
                      status:
                        'running',
                    }
                  : o,
            )
          },
        )
      },
      [pushActivity],
    )

  /*
   * ============================
   * PENDÊNCIA
   * ============================
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
          (prev) =>
            prev.map(
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
   * ============================
   * PARAR
   * ============================
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
   * ============================
   * RETOMAR
   * ============================
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

      void runDiscoveryCycle()
    }, [
      pushActivity,
      runDiscoveryCycle,
    ])

  /*
   * ============================
   * INTEGRAÇÕES
   * ============================
   */
  const toggleIntegration =
    useCallback(
      (key: string) => {
        setIntegrations(
          (prev) =>
            prev.map(
              (integration) =>
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
   * ============================
   * INÍCIO
   * ============================
   */
  useEffect(() => {
    void refreshEarnings()

    void runDiscoveryCycle()
  }, [
    refreshEarnings,
    runDiscoveryCycle,
  ])

  /*
   * ============================
   * ATUALIZA SALDO
   * ============================
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
   * ============================
   * RADAR CONTÍNUO
   * ============================
   *
   * A cada 5 minutos.
   *
   * Não para ao atingir meta.
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
   * ============================
   * REFRESH VISUAL
   * ============================
   *
   * Mantém a fila atualizada
   * a cada minuto.
   */
  useEffect(() => {
    const interval =
      setInterval(
        () => {
          if (
            statusRef.current ===
            'working'
          ) {
            void refreshOpportunities()
          }
        },
        60_000,
      )

    return () =>
      clearInterval(
        interval,
      )
  }, [
    refreshOpportunities,
  ])

  /*
   * ============================
   * TAREFAS EM EXECUÇÃO
   * ============================
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
   * ============================
   * TAREFAS PENDENTES
   * ============================
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
   * ============================
   * CONTEXT
   * ============================
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

  return (
    <AgentContext.Provider
      value={value}
    >
      {children}
    </AgentContext.Provider>
  )
}

/*
 * HOOK
 */
export function useAgent() {
  const ctx =
    useContext(
      AgentContext,
    )

  if (!ctx) {
    throw new Error(
      'useAgent deve ser usado dentro de AgentProvider',
    )
  }

  return ctx
}
