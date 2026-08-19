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

/*
 * TIPOS INTERNOS DA API DE GANHOS
 */
type DatabaseEarning = {
  id: string
  description: string
  source: string
  amount: number | string
  created_at: string
}

/*
 * PROVIDER PRINCIPAL
 *
 * IMPORTANTE:
 *
 * Esta versão NÃO cria oportunidades fictícias.
 *
 * Esta versão NÃO cria dinheiro fictício.
 *
 * Esta versão NÃO considera que uma tarefa concluída
 * seja automaticamente um pagamento.
 *
 * O dinheiro só entra depois de confirmação real
 * através da API /api/earnings.
 */
export function AgentProvider({
  children,
}: {
  children: React.ReactNode
}) {
  /*
   * STATUS
   *
   * O agente começa trabalhando.
   */
  const [status, setStatus] =
    useState<AgentStatus>('working')

  /*
   * SALDO
   *
   * Começa em zero.
   *
   * Será atualizado pelo banco.
   */
  const [today, setToday] =
    useState(0)

  const [total, setTotal] =
    useState(0)

  /*
   * OPORTUNIDADES
   *
   * Começa vazio.
   *
   * Nenhuma oportunidade é inventada
   * pelo navegador.
   */
  const [opportunities, setOpportunities] =
    useState<Opportunity[]>([])

  /*
   * TAREFAS
   *
   * Começa vazio.
   *
   * Só nasce uma tarefa quando uma
   * oportunidade real é iniciada.
   */
  const [tasks, setTasks] =
    useState<Task[]>([])

  /*
   * HISTÓRICO
   */
  const [activity, setActivity] =
    useState<ActivityEvent[]>([])

  /*
   * TRANSAÇÕES
   *
   * São carregadas do banco.
   */
  const [transactions, setTransactions] =
    useState<Transaction[]>([])

  /*
   * INTEGRAÇÕES
   */
  const [integrations, setIntegrations] =
    useState<Integration[]>(
      seedIntegrations,
    )

  /*
   * REFERÊNCIA DO STATUS
   *
   * Permite que o agente saiba se
   * o usuário apertou PARAR.
   */
  const statusRef =
    useRef(status)

  statusRef.current = status

  /*
   * REGISTRA ATIVIDADE
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
              at: new Date().toISOString(),
              ...event,
            },
            ...prev,
          ].slice(0, 60),
        )
      },
      [],
    )

  /*
   * CARREGA GANHOS DO BANCO
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

          const normalized: Transaction[] =
            rows.map(
              (
                earning: DatabaseEarning,
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
           * TOTAL DE HOJE
           */
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
   * CARREGA OPORTUNIDADES
   *
   * A fonte será o endpoint:
   *
   * /api/opportunities
   *
   * Se ainda não existir, o agente
   * simplesmente permanece sem
   * oportunidades.
   *
   * Isso é proposital para não
   * inventarmos dados.
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

          /*
           * Endpoint ainda não configurado.
           *
           * Não criamos oportunidades
           * falsas nesse caso.
           */
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

          /*
           * Mantém somente oportunidades
           * com estrutura básica válida.
           */
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
            valid.slice(0, 50),
          )

          if (
            valid.length > 0
          ) {
            pushActivity({
              kind:
                'discovery',
              message:
                `${valid.length} oportunidade(s) legítima(s) disponível(is).`,
            })
          }
        } catch (error) {
          console.error(
            'Erro ao consultar oportunidades:',
            error,
          )
        }
      },
      [pushActivity],
    )

  /*
   * REGISTRO DE PAGAMENTO CONFIRMADO
   *
   * ESTA É A ÚNICA FUNÇÃO QUE
   * ALTERA O SALDO.
   *
   * Ela envia o pagamento para
   * /api/earnings.
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

        const id =
          uid()

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
                    id,
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

        /*
         * Só atualiza o estado local
         * depois que a API respondeu
         * com sucesso.
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
   * INICIAR OPORTUNIDADE
   *
   * IMPORTANTE:
   *
   * Iniciar uma oportunidade NÃO
   * significa que dinheiro foi ganho.
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

            /*
             * Não permite iniciar
             * uma oportunidade já em execução.
             */
            if (
              opportunity.status ===
              'running'
            ) {
              return prev
            }

            const task: Task =
              {
                id:
                  uid(),
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
                progress:
                  0,
                startedAt:
                  new Date().toISOString(),
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
                `Tarefa iniciada — ${opportunity.title}`,
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
   * RESOLVER PENDÊNCIA
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
                      actionUrl:
                        undefined,
                    }
                  : item,
            ),
        )

        pushActivity({
          kind:
            'resolved',
          message:
            `Pendência resolvida — ${task.title} retomada.`,
        })
      },
      [
        pushActivity,
        tasks,
      ],
    )

  /*
   * PARAR
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
          'Atividades pausadas pelo usuário.',
      })
    }, [pushActivity])

  /*
   * CONTINUAR
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
          'Atividades retomadas.',
      })

      /*
       * Tenta consultar
       * oportunidades novamente.
       */
      void refreshOpportunities()
    }, [
      pushActivity,
      refreshOpportunities,
    ])

  /*
   * ALTERAR INTEGRAÇÃO
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
   * CARREGAMENTO INICIAL
   *
   * Primeiro carrega o banco.
   *
   * Depois tenta consultar
   * oportunidades reais.
   */
  useEffect(() => {
    void refreshEarnings()
    void refreshOpportunities()
  }, [
    refreshEarnings,
    refreshOpportunities,
  ])

  /*
   * ATUALIZA O FINANCEIRO
   *
   * A cada 30 segundos.
   *
   * Isso NÃO cria dinheiro.
   * Apenas consulta o banco.
   */
  useEffect(() => {
    const interval =
      setInterval(
        () => {
          void refreshEarnings()
        },
        30_000,
      )

    return () =>
      clearInterval(
        interval,
      )
  }, [refreshEarnings])

  /*
   * ATUALIZA OPORTUNIDADES
   *
   * A cada 60 segundos.
   *
   * Só consulta uma fonte.
   * Não inventa dados.
   */
  useEffect(() => {
    const interval =
      setInterval(
        () => {
          void refreshOpportunities()
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
   * TAREFAS EM EXECUÇÃO
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
   * TAREFAS PENDENTES
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
   * VALOR EM PROCESSAMENTO
   *
   * Não entra no saldo confirmado.
   */
  const processing =
    transactions
      .filter(
        (tx) =>
          tx.status ===
          'processing',
      )
      .reduce(
        (sum, tx) =>
          sum + tx.amount,
        0,
      )

  /*
   * LOG DE ESTADO
   */
  useEffect(() => {
    if (
      status ===
      'working'
    ) {
      return
    }

    if (
      status ===
      'paused'
    ) {
      return
    }
  }, [status])

  /*
   * VALOR FINAL DO CONTEXT
   */
  const value: AgentContextValue =
    {
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
