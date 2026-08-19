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
  seedOpportunities,
  seedTasks,
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
}

const AgentContext =
  createContext<AgentContextValue | null>(null)

const uid = () =>
  Math.random().toString(36).slice(2, 10)

const discoveryPool: Array<
  Pick<
    Opportunity,
    'title' | 'source' | 'category' | 'estimatedValue' | 'confidence'
  >
> = [
  {
    title: 'Moderação de conteúdo (lote)',
    source: 'DataMark',
    category: 'microtasks',
    estimatedValue: 7.5,
    confidence: 84,
  },
  {
    title: 'Tradução curta PT→EN',
    source: 'FreelanceHub',
    category: 'freelance',
    estimatedValue: 18,
    confidence: 71,
  },
  {
    title: 'Pesquisa de opinião — fintech',
    source: 'SurveyLane',
    category: 'surveys',
    estimatedValue: 2.9,
    confidence: 90,
  },
  {
    title: 'Legendagem de vídeo (5 min)',
    source: 'ContentDesk',
    category: 'content',
    estimatedValue: 12,
    confidence: 77,
  },
  {
    title: 'Teste beta de aplicativo web',
    source: 'UserTrials',
    category: 'testing',
    estimatedValue: 20,
    confidence: 58,
  },
  {
    title: 'Indicação afiliada — curso online',
    source: 'PartnerNet',
    category: 'affiliate',
    estimatedValue: 34,
    confidence: 52,
  },
]

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
    useState<Opportunity[]>(
      seedOpportunities,
    )

  const [tasks, setTasks] =
    useState<Task[]>(seedTasks)

  const [activity, setActivity] =
    useState<ActivityEvent[]>([])

  const [transactions, setTransactions] =
    useState<Transaction[]>([])

  const [integrations, setIntegrations] =
    useState<Integration[]>(
      seedIntegrations,
    )

  const statusRef =
    useRef(status)

  statusRef.current = status

  /*
   * CARREGA O FINANCEIRO DO BANCO
   *
   * Quando o site abre ou é atualizado,
   * consulta /api/earnings.
   *
   * O saldo não fica mais preso somente
   * ao estado temporário do navegador.
   */
  useEffect(() => {
    let cancelled = false

    const loadFinancialData =
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
              'Não foi possível carregar o financeiro',
            )
          }

          const data =
            await response.json()

          if (cancelled) {
            return
          }

          const realTotal =
            Number(
              data.total ?? 0,
            )

          setTotal(
            Number(
              realTotal.toFixed(2),
            ),
          )

          const earnings =
            Array.isArray(
              data.earnings,
            )
              ? data.earnings
              : []

          /*
           * Calcula somente os pagamentos
           * realizados hoje.
           */
          const now =
            new Date()

          const startOfToday =
            new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
            )

          const todayTotal =
            earnings.reduce(
              (
                sum: number,
                earning: {
                  amount:
                    | number
                    | string
                  created_at: string
                },
              ) => {
                const date =
                  new Date(
                    earning.created_at,
                  )

                if (
                  date >=
                  startOfToday
                ) {
                  return (
                    sum +
                    Number(
                      earning.amount,
                    )
                  )
                }

                return sum
              },
              0,
            )

          setToday(
            Number(
              todayTotal.toFixed(2),
            ),
          )

          /*
           * Reconstrói as transações
           * salvas no banco.
           */
          setTransactions(
            earnings.map(
              (
                earning: {
                  id: string
                  description: string
                  source: string
                  amount:
                    | number
                    | string
                  created_at: string
                },
              ) => ({
                id: earning.id,
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
            ),
          )
        } catch (error) {
          console.error(
            'Erro ao carregar saldo real:',
            error,
          )
        }
      }

    loadFinancialData()

    return () => {
      cancelled = true
    }
  }, [])

  /*
   * REGISTRO DE ATIVIDADE
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
   * REGISTRO DE PAGAMENTO CONFIRMADO
   *
   * Esta é a única função que adiciona
   * dinheiro ao saldo.
   */
  const registerConfirmedEarning =
    useCallback(
      async (
        amount: number,
        description: string,
        source: string,
      ) => {
        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return
        }

        const earned =
          Number(
            amount.toFixed(2),
          )

        try {
          const response =
            await fetch(
              '/api/earnings',
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json',
                },
                body: JSON.stringify({
                  id: uid(),
                  description,
                  source,
                  amount: earned,
                }),
              },
            )

          if (!response.ok) {
            throw new Error(
              'Falha ao registrar pagamento',
            )
          }

          /*
           * Só altera o painel depois
           * que a API confirmou o registro.
           */
          setToday((value) =>
            Number(
              (
                value +
                earned
              ).toFixed(2),
            ),
          )

          setTotal((value) =>
            Number(
              (
                value +
                earned
              ).toFixed(2),
            ),
          )

          setTransactions(
            (prev) =>
              [
                {
                  id: uid(),
                  description,
                  source,
                  amount: earned,
                  at: new Date().toISOString(),
                  status:
                    'confirmed' as const,
                },
                ...prev,
              ].slice(0, 40),
          )

          pushActivity({
            kind: 'earning',
            message:
              `Pagamento confirmado — ${description}`,
            amount: earned,
          })
        } catch (error) {
          console.error(
            'Erro ao registrar pagamento:',
            error,
          )
        }
      },
      [pushActivity],
    )

  /*
   * MOTOR DO AGENTE
   */
  const tick =
    useCallback(() => {
      if (
        statusRef.current !==
        'working'
      ) {
        return
      }

      const roll =
        Math.random()

      /*
       * AVANÇA TAREFAS
       *
       * Concluir tarefa NÃO gera dinheiro.
       */
      setTasks((prev) => {
        let completed:
          | Task
          | null = null

        const next =
          prev.map((task) => {
            if (
              task.state !==
              'running'
            ) {
              return task
            }

            const inc =
              6 +
              Math.random() *
                14

            const progress =
              Math.min(
                100,
                task.progress +
                  inc,
              )

            if (
              progress >= 100 &&
              !completed
            ) {
              completed = {
                ...task,
                progress: 100,
                state: 'done',
              }

              return completed
            }

            return {
              ...task,
              progress,
            }
          })

        if (completed) {
          const done =
            completed as Task

          pushActivity({
            kind: 'system',
            message:
              `Tarefa concluída: ${done.title}. Valor estimado: US$ ${done.estimatedValue.toFixed(2)}. Aguardando confirmação real do pagamento.`,
          })

          return next.filter(
            (task) =>
              task.id !==
              done.id,
          )
        }

        return next
      })

      /*
       * DESCOBERTA DE OPORTUNIDADES
       *
       * Ainda é simulação local.
       */
      if (roll > 0.55) {
        const template =
          discoveryPool[
            Math.floor(
              Math.random() *
                discoveryPool.length,
            )
          ]

        const op: Opportunity = {
          id: uid(),
          ...template,
          status: 'new',
          discoveredAt:
            new Date().toISOString(),
        }

        setOpportunities(
          (prev) =>
            [op, ...prev].slice(
              0,
              40,
            ),
        )

        pushActivity({
          kind: 'discovery',
          message:
            `Nova oportunidade encontrada em ${op.source}. Valor estimado: US$ ${op.estimatedValue.toFixed(2)}`,
        })
      }

      /*
       * INICIA UMA OPORTUNIDADE
       */
      if (roll > 0.7) {
        setOpportunities(
          (prev) => {
            const candidate =
              prev.find(
                (o) =>
                  o.status ===
                  'new',
              )

            if (!candidate) {
              return prev
            }

            setTasks(
              (tks) => [
                {
                  id: uid(),
                  title:
                    candidate.title,
                  source:
                    candidate.source,
                  state:
                    'running',
                  estimatedValue:
                    candidate.estimatedValue,
                  progress:
                    Math.random() *
                    20,
                  startedAt:
                    new Date().toISOString(),
                },
                ...tks,
              ],
            )

            pushActivity({
              kind: 'start',
              message:
                `Iniciada tarefa — ${candidate.title}`,
            })

            return prev.map(
              (o) =>
                o.id ===
                candidate.id
                  ? {
                      ...o,
                      status:
                        'running',
                    }
                  : o,
            )
          },
        )
      }

      /*
       * PENDÊNCIA
       */
      if (roll > 0.9) {
        setTasks((prev) => {
          const candidate =
            prev.find(
              (t) =>
                t.state ===
                'running',
            )

          if (!candidate) {
            return prev
          }

          pushActivity({
            kind: 'pending',
            message:
              `Tarefa marcada como pendente — ${candidate.source}`,
          })

          return prev.map(
            (t) =>
              t.id ===
                candidate.id
                ? {
                    ...t,
                    state:
                      'pending',
                    pendingReason:
                      'A plataforma exige uma ação manual (verificação ou confirmação) para prosseguir.',
                    actionUrl:
                      undefined,
                  }
                : t,
          )
        })
      }
    }, [pushActivity])

  /*
   * EXECUÇÃO CONTÍNUA
   */
  useEffect(() => {
    const interval =
      setInterval(
        tick,
        3500,
      )

    return () =>
      clearInterval(
        interval,
      )
  }, [tick])

  /*
   * PARAR
   */
  const stop =
    useCallback(() => {
      setStatus('paused')

      pushActivity({
        kind: 'system',
        message:
          'Atividades pausadas pelo usuário',
      })
    }, [pushActivity])

  /*
   * CONTINUAR
   */
  const resume =
    useCallback(() => {
      setStatus('working')

      pushActivity({
        kind: 'system',
        message:
          'Atividades retomadas — buscando oportunidades',
      })
    }, [pushActivity])

  /*
   * RESOLVER PENDÊNCIA
   */
  const resolvePending =
    useCallback(
      (taskId: string) => {
        const task =
          tasks.find(
            (t) =>
              t.id ===
              taskId,
          )

        setTasks((prev) =>
          prev.map(
            (t) =>
              t.id === taskId &&
              t.state ===
                'pending'
                ? {
                    ...t,
                    state:
                      'running',
                    pendingReason:
                      undefined,
                    actionUrl:
                      undefined,
                  }
                : t,
          ),
        )

        pushActivity({
          kind: 'resolved',
          message:
            `Pendência resolvida — ${task?.title ?? 'tarefa'} retomada`,
        })
      },
      [pushActivity, tasks],
    )

  /*
   * INICIAR OPORTUNIDADE
   */
  const startOpportunity =
    useCallback(
      (opportunityId: string) => {
        setOpportunities(
          (prev) => {
            const op =
              prev.find(
                (o) =>
                  o.id ===
                  opportunityId,
              )

            if (!op) {
              return prev
            }

            setTasks(
              (tks) => [
                {
                  id: uid(),
                  title:
                    op.title,
                  source:
                    op.source,
                  state:
                    'running',
                  estimatedValue:
                    op.estimatedValue,
                  progress: 0,
                  startedAt:
                    new Date().toISOString(),
                },
                ...tks,
              ],
            )

            pushActivity({
              kind: 'start',
              message:
                `Iniciada tarefa — ${op.title}`,
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
   * INTEGRAÇÕES
   */
  const toggleIntegration =
    useCallback(
      (key: string) => {
        setIntegrations(
          (prev) =>
            prev.map(
              (i) =>
                i.key === key
                  ? {
                      ...i,
                      connected:
                        !i.connected,
                    }
                  : i,
            ),
        )
      },
      [],
    )

  /*
   * REGRA PRINCIPAL
   */
  useEffect(() => {
    if (
      status !== 'paused' &&
      status !== 'working'
    ) {
      setStatus('working')
    }
  }, [status])

  const runningTasks =
    useMemo(
      () =>
        tasks.filter(
          (t) =>
            t.state ===
            'running',
        ),
      [tasks],
    )

  const pendingTasks =
    useMemo(
      () =>
        tasks.filter(
          (t) =>
            t.state ===
            'pending',
        ),
      [tasks],
    )

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
    }

  return (
    <AgentContext.Provider
      value={value}
    >
      {children}
    </AgentContext.Provider>
  )
}

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
