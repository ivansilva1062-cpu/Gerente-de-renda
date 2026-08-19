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
  INITIAL_TODAY,
  INITIAL_TOTAL,
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

const discoveryPool: Array<Pick<Opportunity, 'title' | 'source' | 'category' | 'estimatedValue' | 'confidence'>> = [
  { title: 'Moderação de conteúdo (lote)', source: 'DataMark', category: 'microtasks', estimatedValue: 7.5, confidence: 84 },
  { title: 'Tradução curta PT→EN', source: 'FreelanceHub', category: 'freelance', estimatedValue: 18, confidence: 71 },
  { title: 'Pesquisa de opinião — fintech', source: 'SurveyLane', category: 'surveys', estimatedValue: 2.9, confidence: 90 },
  { title: 'Legendagem de vídeo (5 min)', source: 'ContentDesk', category: 'content', estimatedValue: 12, confidence: 77 },
  { title: 'Teste beta de aplicativo web', source: 'UserTrials', category: 'testing', estimatedValue: 20, confidence: 58 },
  { title: 'Indicação afiliada — curso online', source: 'PartnerNet', category: 'affiliate', estimatedValue: 34, confidence: 52 },
]

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AgentStatus>('working')
  const [today, setToday] = useState(INITIAL_TODAY)
  const [total, setTotal] = useState(INITIAL_TOTAL)
  const [opportunities, setOpportunities] = useState<Opportunity[]>(seedOpportunities)
  const [tasks, setTasks] = useState<Task[]>(seedTasks)
  const [activity, setActivity] = useState<ActivityEvent[]>(seedActivity)
  const [transactions, setTransactions] = useState<Transaction[]>(seedTransactions)
  const [integrations, setIntegrations] = useState<Integration[]>(seedIntegrations)

  const statusRef = useRef(status)
  statusRef.current = status

  const pushActivity = useCallback((event: Omit<ActivityEvent, 'id' | 'at'>) => {
    setActivity((prev) =>
      [{ id: uid(), at: new Date().toISOString(), ...event }, ...prev].slice(0, 60),
    )
  }, [])

  const tick = useCallback(() => {
    // O agente só evolui quando está trabalhando. Pendências NUNCA pausam o restante.
    if (statusRef.current !== 'working') return

    const roll = Math.random()

    // Avança tarefas em execução; conclui quando chega a 100%.
    setTasks((prev) => {
      let completed: Task | null = null
      const next = prev.map((task) => {
        if (task.state !== 'running') return task
        const inc = 6 + Math.random() * 14
        const progress = Math.min(100, task.progress + inc)
        if (progress >= 100 && !completed) {
          completed = { ...task, progress: 100, state: 'done' }
          return completed
        }
        return { ...task, progress }
      })

      if (completed) {
        const done = completed as Task
        const earned = Number(done.estimatedValue.toFixed(2))
        setToday((t) => Number((t + earned).toFixed(2)))
        setTotal((t) => Number((t + earned).toFixed(2)))
        setTransactions((tx) =>
          [
            {
              id: uid(),
              description: done.title,
              source: done.source,
              amount: earned,
              at: new Date().toISOString(),
              status: 'confirmed' as const,
            },
            ...tx,
          ].slice(0, 40),
        )
        pushActivity({
          kind: 'earning',
          message: `Tarefa concluída — ${done.title}`,
          amount: earned,
        })
        // Regra: mesmo ao ganhar/atingir meta, continua buscando trabalho.
        return next.filter((t) => t.id !== done.id)
      }

      return next
    })

    // Descoberta de novas oportunidades.
    if (roll > 0.55) {
      const template = discoveryPool[Math.floor(Math.random() * discoveryPool.length)]
      const op: Opportunity = {
        id: uid(),
        ...template,
        status: 'new',
        discoveredAt: new Date().toISOString(),
      }
      setOpportunities((prev) => [op, ...prev].slice(0, 40))
      pushActivity({
        kind: 'discovery',
        message: `Nova oportunidade encontrada em ${op.source}`,
      })
    }

    // Ocasionalmente promove uma oportunidade "new" a tarefa em execução.
    if (roll > 0.7) {
      setOpportunities((prev) => {
        const candidate = prev.find((o) => o.status === 'new')
        if (!candidate) return prev
        setTasks((tks) => [
          {
            id: uid(),
            title: candidate.title,
            source: candidate.source,
            state: 'running',
            estimatedValue: candidate.estimatedValue,
            progress: Math.random() * 20,
            startedAt: new Date().toISOString(),
          },
          ...tks,
        ])
        pushActivity({ kind: 'start', message: `Iniciada tarefa — ${candidate.title}` })
        return prev.map((o) =>
          o.id === candidate.id ? { ...o, status: 'running' } : o,
        )
      })
    }

    // Ocasionalmente uma tarefa exige intervenção humana (fica pendente),
    // mas o agente segue trabalhando nas demais.
    if (roll > 0.9) {
      setTasks((prev) => {
        const candidate = prev.find((t) => t.state === 'running')
        if (!candidate) return prev
        pushActivity({
          kind: 'pending',
          message: `Tarefa marcada como pendente — ${candidate.source}`,
        })
        return prev.map((t) =>
          t.id === candidate.id
            ? {
                ...t,
                state: 'pending',
                pendingReason:
                  'A plataforma exige uma ação manual (verificação ou confirmação) para prosseguir.',
                actionUrl: `https://example.com/tarefa/${t.id}`,
              }
            : t,
        )
      })
    }
  }, [pushActivity])

  useEffect(() => {
    const interval = setInterval(tick, 3500)
    return () => clearInterval(interval)
  }, [tick])

  const stop = useCallback(() => {
    setStatus('paused')
    pushActivity({ kind: 'system', message: 'Atividades pausadas pelo usuário' })
  }, [pushActivity])

  const resume = useCallback(() => {
    setStatus('working')
    pushActivity({ kind: 'system', message: 'Atividades retomadas — buscando oportunidades' })
  }, [pushActivity])

  const resolvePending = useCallback(
    (taskId: string) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId && t.state === 'pending'
            ? { ...t, state: 'running', pendingReason: undefined, actionUrl: undefined }
            : t,
        ),
      )
      const task = tasks.find((t) => t.id === taskId)
      pushActivity({
        kind: 'resolved',
        message: `Pendência resolvida — ${task?.title ?? 'tarefa'} retomada`,
      })
    },
    [pushActivity, tasks],
  )

  const startOpportunity = useCallback(
    (opportunityId: string) => {
      setOpportunities((prev) => {
        const op = prev.find((o) => o.id === opportunityId)
        if (!op) return prev
        setTasks((tks) => [
          {
            id: uid(),
            title: op.title,
            source: op.source,
            state: 'running',
            estimatedValue: op.estimatedValue,
            progress: 0,
            startedAt: new Date().toISOString(),
          },
          ...tks,
        ])
        pushActivity({ kind: 'start', message: `Iniciada tarefa — ${op.title}` })
        return prev.map((o) =>
          o.id === opportunityId ? { ...o, status: 'running' } : o,
        )
      })
    },
    [pushActivity],
  )

  const toggleIntegration = useCallback((key: string) => {
    setIntegrations((prev) =>
      prev.map((i) => (i.key === key ? { ...i, connected: !i.connected } : i)),
    )
  }, [])

  // Se todas as tarefas concluírem/pendências pararem o fluxo ativo,
  // o status vira "aguardando" (mas nunca por causa de pendências).
  const hasRunning = tasks.some((t) => t.state === 'running')
  useEffect(() => {
    if (status === 'paused') return
    setStatus(hasRunning ? 'working' : 'waiting')
  }, [hasRunning, status])

  const runningTasks = useMemo(() => tasks.filter((t) => t.state === 'running'), [tasks])
  const pendingTasks = useMemo(() => tasks.filter((t) => t.state === 'pending'), [tasks])

  const value: AgentContextValue = {
    status,
    today,
    total,
    dailyGoal: DAILY_GOAL,
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

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

export function useAgent() {
  const ctx = useContext(AgentContext)
  if (!ctx) throw new Error('useAgent deve ser usado dentro de AgentProvider')
  return ctx
}
