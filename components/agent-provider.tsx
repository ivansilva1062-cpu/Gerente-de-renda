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
}

const AgentContext = createContext<AgentContextValue | null>(null)

const uid = () =>
  Math.random().toString(36).slice(2, 10)

/*
 * O valor abaixo é somente uma estimativa
 * apresentada nas oportunidades.
 *
 * NÃO representa dinheiro recebido.
 */
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
  /*
   * O agente começa trabalhando.
   *
   * IMPORTANTE:
   * ficar sem tarefa ativa NÃO significa parar.
   * Nesse momento ele continua procurando oportunidades.
   */
  const [status, setStatus] =
    useState<AgentStatus>('working')

  /*
   * SALDO REAL
   *
   * Começa sempre em zero.
   *
   * Não usamos valores iniciais fictícios.
   */
  const [today, setToday] =
    useState(0)

  const [total, setTotal] =
    useState(0)

  /*
   * OPORTUNIDADES
   *
   * O estimatedValue é apenas estimativa.
   * Não é dinheiro recebido.
   */
  const [opportunities, setOpportunities] =
    useState<Opportunity[]>(
      seedOpportunities,
    )

  /*
   * TAREFAS
   *
   * Mantemos as tarefas iniciais do projeto
   * para testar a interface.
   */
  const [tasks, setTasks] =
    useState<Task[]>(seedTasks)

  /*
   * Histórico de atividades começa vazio.
   */
  const [activity, setActivity] =
    useState<ActivityEvent[]>([])

  /*
   * Histórico financeiro começa vazio.
   *
   * Nenhum valor fictício entra aqui.
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
   * ESTA É A ÚNICA FUNÇÃO QUE PODE
   * ADICIONAR DINHEIRO AO SALDO.
   *
   * Encontrar oportunidade:
   * NÃO adiciona dinheiro.
   *
   * Iniciar tarefa:
   * NÃO adiciona dinheiro.
   *
   * Concluir tarefa:
   * NÃO adiciona dinheiro.
   *
   * Somente pagamento confirmado:
   * ADICIONA dinheiro.
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
          message:
            `Pagamento confirmado — ${description}`,
          amount: earned,
        })
      },
      [pushActivity],
    )

  /*
   * MOTOR DO AGENTE
   */
  const tick =
    useCallback(() => {
      /*
       * Só para quando o usuário apertar
       * "Parar atividades".
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
       * IMPORTANTE:
       * terminar uma tarefa NÃO gera dinheiro.
       */
      setTasks((prev) => {
        let completed: Task | null =
          null

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
          })

        if (completed) {
          const done =
            completed as Task

          pushActivity({
            kind: 'system',
            message:
              `Tarefa concluída: ${done.title}. Valor estimado: US$ ${done.estimatedValue.toFixed(2)}. Aguardando confirmação real do pagamento.`,
          })

          /*
           * NÃO adicionamos dinheiro aqui.
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
       * Por enquanto esta parte é somente
       * uma simulação local para testar o motor.
       *
       * Na próxima etapa substituiremos isso
       * por fontes reais.
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
       *
       * Uma tarefa pode precisar de
       * intervenção humana.
       *
       * Isso NÃO para o restante do agente.
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
   *
   * O agente verifica o estado a cada 3,5 segundos.
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
   * PARAR ATIVIDADES
   *
   * ÚNICA forma normal de pausar o agente.
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
   * CONTINUAR TRABALHANDO
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
   * REGRA PRINCIPAL DO AGENTE
   *
   * NÃO fazemos mais:
   *
   * if (!hasRunning)
   *   status = waiting
   *
   * Porque estar sem tarefas NÃO significa
   * que o agente parou.
   *
   * Se o usuário não apertou PARAR,
   * o agente continua TRABALHANDO,
   * procurando novas oportunidades.
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
