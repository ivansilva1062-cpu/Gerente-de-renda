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
  seedActivity,
  seedIntegrations,
  seedOpportunities,
  seedTasks,
  seedTransactions,
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
}

const AgentContext = createContext<AgentContextValue | null>(null)

const uid = () => Math.random().toString(36).slice(2, 10)

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

  /*
   * IMPORTANTE:
   * Os valores começam em ZERO.
   *
   * Não usamos mais INITIAL_TODAY ou INITIAL_TOTAL,
   * pois aqueles valores eram fictícios.
   */
  const [today, setToday] =
    useState(0)

  const [total, setTotal] =
    useState(0)

  /*
   * As oportunidades continuam podendo ter um
   * estimatedValue, mas esse valor é apenas uma
   * estimativa. NÃO é dinheiro recebido.
   */
  const [opportunities, setOpportunities] =
    useState<Opportunity[]>(
      seedOpportunities,
    )

  const [tasks, setTasks] =
    useState<Task[]>(seedTasks)

  const [activity, setActivity] =
    useState<ActivityEvent[]>([])

  /*
   * Não carregamos transações fictícias.
   *
   * O histórico financeiro começa vazio.
   */
  const [transactions, setTransactions] =
    useState<Transaction[]>([])

  const [integrations, setIntegrations] =
    useState<Integration[]>(
      seedIntegrations,
    )

  const statusRef =
    useRef(status)

  statusRef.current = status

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
   * Registra um ganho REAL confirmado.
   *
   * Esta função é a única responsável por
   * adicionar dinheiro ao saldo.
   *
   * Uma oportunidade encontrada ou uma tarefa
   * concluída NÃO adiciona dinheiro automaticamente.
   */
  const registerConfirmedEarning =
    useCallback(
      (
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
          Number(amount.toFixed(2))

        setToday((value) =>
          Number(
            (value + earned).toFixed(2),
          ),
        )

        setTotal((value) =>
          Number(
            (value + earned).toFixed(2),
          ),
        )

        setTransactions((prev) =>
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
          message: `Pagamento confirmado — ${description}`,
          amount: earned,
        })
      },
      [pushActivity],
    )

  const tick =
    useCallback(() => {
      /*
       * O agente só evolui quando está trabalhando.
       *
       * Pendências de uma tarefa não param
       * as outras atividades.
       */
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
       * Atenção:
       * concluir uma tarefa NÃO significa
       * receber dinheiro.
       *
       * O valor continua sendo apenas estimado.
       */
      setTasks((prev) => {
        let completed: Task | null =
          null

        const next = prev.map(
          (task) => {
            if (
              task.state !==
              'running'
            ) {
              return task
            }

            const inc =
              6 +
              Math.random() * 14

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
          },
        )

        if (completed) {
          const done =
            completed as Task

          pushActivity({
            kind: 'system',
            message:
              `Tarefa concluída: ${done.title}. Valor estimado: US$ ${done.estimatedValue.toFixed(2)}. Aguardando confirmação real do pagamento.`,
          })

          /*
           * NÃO fazemos:
           *
           * setToday(...)
           * setTotal(...)
           *
           * porque concluir a tarefa não prova
           * que houve pagamento.
           */

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
       * IMPORTANTE:
       * Esta lista ainda é uma simulação/local.
       * Ela NÃO representa sites que garantem pagamento.
       *
       * A próxima etapa será substituir este
       * mecanismo por fontes reais e autorizadas.
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
          message: `Nova oportunidade encontrada em ${op.source}. Valor estimado: US$ ${op.estimatedValue.toFixed(2)}`,
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
              message: `Iniciada tarefa — ${candidate.title}`,
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
       *
       * O agente não tenta burlar CAPTCHA,
       * 2FA, confirmação bancária ou identidade.
       *
       * Quando uma plataforma exigir
       * intervenção humana, a tarefa fica
       * pendente.
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
            message: `Tarefa marcada como pendente — ${candidate.source}`,
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
                    actionUrl: undefined,
                  }
                : t,
          )
        })
      }
    }, [pushActivity])

  /*
   * MOTOR CONTÍNUO
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
          message: `Pendência resolvida — ${task?.title ?? 'tarefa'} retomada`,
        })
      },
      [pushActivity, tasks],
    )

  /*
   * INICIAR OPORTUNIDADE MANUALMENTE
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
              message: `Iniciada tarefa — ${op.title}`,
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
   * Se não existem tarefas rodando,
   * o agente fica aguardando.
   *
   * Atingir a meta NÃO altera esse status.
   */
  const hasRunning =
    tasks.some(
      (t) =>
        t.state ===
        'running',
    )

  useEffect(() => {
    if (
      status === 'paused'
    ) {
      return
    }

    setStatus(
      hasRunning
        ? 'working'
        : 'waiting',
    )
  }, [
    hasRunning,
    status,
  ])

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
