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
  NotificationItem,
  Opportunity,
  Task,
  Transaction,
} from '@/lib/types'

import {
  DAILY_GOAL,
  seedIntegrations,
} from '@/lib/mock-data'
import {
  assessOpportunity,
} from '@/lib/manager-modules'

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
  notifications: NotificationItem[]
  unreadNotifications: number

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

  refreshNotifications: () => Promise<void>
  markNotificationAsRead: (id: string) => Promise<void>
  clearReadNotifications: () => Promise<void>
  enableNotifications: () => Promise<boolean>

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

const evaluateManagerModules = (
  opportunity: Pick<
    Opportunity,
    | 'title'
    | 'url'
    | 'source'
    | 'category'
    | 'estimatedValue'
    | 'confidence'
  >,
) =>
  assessOpportunity({
    title: opportunity.title,
    url: opportunity.url ?? '',
    description: `${opportunity.source} ${opportunity.category}`,
    estimatedValue:
      Number(
        opportunity.estimatedValue ?? 0,
      ),
    category: opportunity.category,
    confidence: opportunity.confidence,
  })

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

  const [notifications, setNotifications] =
    useState<NotificationItem[]>([])

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

          const priorityRank = {
            high: 3,
            medium: 2,
            low: 1,
          } as const

          const sorted =
            [...valid].sort(
              (
                a,
                b,
              ) => {
                const aAssessment = assessOpportunity({
                  title: a.title,
                  url: a.url ?? '',
                  description: `${a.source} ${a.category}`,
                  estimatedValue: a.estimatedValue,
                  category: a.category,
                  confidence: a.confidence,
                })
                const bAssessment = assessOpportunity({
                  title: b.title,
                  url: b.url ?? '',
                  description: `${b.source} ${b.category}`,
                  estimatedValue: b.estimatedValue,
                  category: b.category,
                  confidence: b.confidence,
                })

                return (
                  (b.managerScore ?? bAssessment.score) -
                  (a.managerScore ?? aAssessment.score) ||
                  priorityRank[b.managerPriority ?? bAssessment.priority] -
                  priorityRank[a.managerPriority ?? aAssessment.priority]
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

          setWorkerCycle((previous) => ({
            ...previous,
            lastExecutionAt: new Date().toISOString(),
            nextExecutionAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          }))

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
   * ESTADO REAL VINDO DO BANCO
   * ==========================================
   *
   * O Worker (Cron ou início manual) roda inteiramente no servidor
   * e persiste cada execução em execution_runs. Esta sincronização
   * garante que nenhuma tarefa "suma" da interface: mesmo que o
   * usuário feche e reabra o navegador, o estado real (queued,
   * running, waiting_human, waiting_external, completed, failed)
   * volta a aparecer, porque vem do banco — não da memória do React.
   */
  const syncExecutionsFromServer =
    useCallback(
      async () => {
        try {
          const response = await fetch('/api/execution', { cache: 'no-store' })
          if (!response.ok) return

          const data = await response.json() as {
            history?: Array<{
              execution_id: string
              opportunity_id: string | null
              title: string | null
              source: string | null
              state: string
              attempt: number
              error: string | null
              evidence: string | null
              intervention: { reason?: string } | null
              started_at: string
            }>
          }

          const rows = Array.isArray(data.history) ? data.history : []
          if (rows.length === 0) return

          setTasks((previous) => {
            const byKey = new Map(
              previous.map((task) => [task.opportunityId ?? task.id, task]),
            )

            for (const row of rows) {
              const key = row.opportunity_id ?? row.execution_id
              const existing = byKey.get(key)

              const state: Task['state'] =
                row.state === 'completed'
                  ? 'done'
                  : row.state === 'running' || row.state === 'queued'
                    ? 'running'
                    : 'pending'

              const preparationStatus =
                row.state === 'completed'
                  ? 'completed'
                  : row.state === 'waiting_human'
                    ? 'requires_user'
                    : row.state === 'waiting_external'
                      ? 'ready'
                      : row.state === 'failed' || row.state === 'blocked'
                        ? 'failed'
                        : 'preparing'

              byKey.set(key, {
                id: existing?.id ?? row.execution_id,
                opportunityId: row.opportunity_id ?? existing?.opportunityId,
                title: row.title ?? existing?.title ?? 'Oportunidade',
                source: row.source ?? existing?.source ?? '—',
                managerModules: existing?.managerModules,
                state,
                estimatedValue: existing?.estimatedValue ?? 0,
                progress:
                  state === 'done'
                    ? 100
                    : state === 'running'
                      ? Math.max(existing?.progress ?? 0, 40)
                      : Math.max(existing?.progress ?? 0, 20),
                startedAt: existing?.startedAt ?? row.started_at,
                actionUrl: existing?.actionUrl,
                requiresUserAction: row.state === 'waiting_human',
                preparationStatus,
                pendingReason:
                  row.error ??
                  row.intervention?.reason ??
                  (row.attempt > 1 ? `Nova tentativa automática (tentativa ${row.attempt}).` : existing?.pendingReason),
                prepared: existing?.prepared,
              })
            }

            return Array.from(byKey.values())
          })
        } catch (error) {
          console.error('Erro ao sincronizar execuções do servidor:', error)
        }
      },
      [],
    )

  /*
   * ==========================================
   * ATUALIZAR OPORTUNIDADES
   * ==========================================
   */

  const refreshNotifications =
    useCallback(
      async () => {
        try {
          const response = await fetch('/api/notifications', { cache: 'no-store' })
          if (!response.ok) throw new Error('Falha ao consultar notificações.')
          const data = await response.json() as { notifications?: NotificationItem[] }
          setNotifications(Array.isArray(data.notifications) ? data.notifications : [])
        } catch (error) {
          console.error('Erro ao carregar notificações:', error)
          setNotifications([])
        }
      },
      [],
    )

  const markNotificationAsRead =
    useCallback(
      async (id: string) => {
        if (!id) return
        try {
          const response = await fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, action: 'mark-read' }),
          })
          if (response.ok) {
            setNotifications((previous) => previous.map((item) => item.id === id ? { ...item, read: true } : item))
          }
        } catch (error) {
          console.error('Erro ao marcar notificação como lida:', error)
        }
      },
      [],
    )

  const clearReadNotifications =
    useCallback(
      async () => {
        try {
          const response = await fetch('/api/notifications', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'clear-read' }),
          })
          if (response.ok) {
            setNotifications((previous) => previous.filter((item) => !item.read))
          }
        } catch (error) {
          console.error('Erro ao limpar notificações lidas:', error)
        }
      },
      [],
    )

  const enableNotifications =
    useCallback(
      async () => {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
          if (typeof window !== 'undefined') {
            window.alert('Este navegador não suporta notificações push do iPhone/iOS. No iPhone, use o PWA em tela cheia e habilite "Permitir notificações" no menu do Safari/Share.')
          }
          return false
        }

        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          return false
        }

        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: undefined,
        })

        const response = await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'subscribe',
            endpoint: subscription.endpoint,
            keys: {
              p256dh: btoa(String.fromCharCode(...Array.from(new Uint8Array(subscription.getKey('p256dh') ?? new Uint8Array())))),
              auth: btoa(String.fromCharCode(...Array.from(new Uint8Array(subscription.getKey('auth') ?? new Uint8Array())))),
            },
            userAgent: navigator.userAgent,
          }),
        })

        if (!response.ok) {
          console.error('Falha ao registrar subscription no servidor.')
          return false
        }

        await refreshNotifications()
        return true
      },
      [refreshNotifications],
    )

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
   * O estado real da tarefa é sempre decidido
   * pelo Execution Engine (execution.state)
   * devolvido pelo /api/worker — nunca por
   * suposições locais como "tem cadastro,
   * então é pendente". Isso evita que uma
   * oportunidade já preparada/executada pelo
   * agente fique presa artificialmente como
   * "Aguardando cadastro".
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

        if (!opportunity.url) {
          setTasks((previous) =>
            previous.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    state: 'pending',
                    progress: 10,
                    requiresUserAction: false,
                    preparationStatus: 'failed',
                    pendingReason: 'A oportunidade não possui uma URL de ação disponível.',
                  }
                : task,
            ),
          )

          updateOpportunityStatus(opportunity.id, 'pending')
          pushActivity({
            kind: 'pending',
            message: `Monitorando — ${opportunity.title}: não existe URL disponível.`,
          })
          return
        }

        /*
         * Timeout de segurança: uma oportunidade travada
         * não pode consumir o ciclo inteiro do agente nem
         * ficar presa em "Executando" para sempre.
         *
         * Precisa ser maior que `maxDuration` (60s) da rota
         * /api/worker: com 45s o front abortava (e mostrava
         * "Worker indisponível") em inspeções que abrem sessão
         * no Browserbase e navegam a página — o próprio backend
         * documenta que isso pode levar 30-40s+ por oportunidade
         * e ainda estava dentro do prazo do servidor.
         */
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 65_000)

        try {
          const response = await fetch(
            `/api/worker?opportunityId=${encodeURIComponent(opportunity.id)}`,
            {
              method: 'GET',
              cache: 'no-store',
              signal: controller.signal,
            },
          )

          if (!response.ok) {
            throw new Error(`O Worker respondeu com status ${response.status}.`)
          }

          const data = await response.json() as {
            result?: {
              execution?: { state?: string; error?: string; intervention?: { reason?: string } }
              nextAction?: string
            }
          }

          const execution = data.result?.execution
          const state = execution?.state

          if (state === 'waiting_human') {
            setTasks((previous) =>
              previous.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      state: 'pending',
                      progress: 60,
                      requiresUserAction: true,
                      preparationStatus: 'requires_user',
                      pendingReason:
                        execution?.intervention?.reason ??
                        'A fonte oficial exige uma ação humana antes de continuar.',
                    }
                  : task,
              ),
            )

            updateOpportunityStatus(opportunity.id, 'pending')
            pushActivity({
              kind: 'pending',
              message: `Aguardando você — ${opportunity.title}.`,
            })
            return
          }

          if (state === 'waiting_external') {
            setTasks((previous) =>
              previous.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      state: 'pending',
                      progress: 75,
                      requiresUserAction: false,
                      preparationStatus: 'ready',
                      pendingReason:
                        'A etapa disponível já foi enviada pelo agente; agora depende do processamento da própria plataforma.',
                    }
                  : task,
              ),
            )

            updateOpportunityStatus(opportunity.id, 'pending')
            pushActivity({
              kind: 'pending',
              message: `Aguardando processamento externo — ${opportunity.title}.`,
            })
            return
          }

          if (state === 'completed') {
            setTasks((previous) =>
              previous.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      state: 'done',
                      progress: 100,
                      requiresUserAction: false,
                      preparationStatus: 'completed',
                      pendingReason: undefined,
                    }
                  : task,
              ),
            )

            updateOpportunityStatus(opportunity.id, 'done')
            pushActivity({
              kind: 'resolved',
              message: `Preparação concluída sem ação humana — ${opportunity.title}.`,
            })
            return
          }

          /*
           * blocked ou failed: não há evidência de conclusão,
           * então a oportunidade volta para monitoramento e
           * pode ser retentada automaticamente pelo Worker,
           * sem travar as demais oportunidades.
           */
          setTasks((previous) =>
            previous.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    state: 'pending',
                    progress: Math.max(task.progress, 20),
                    requiresUserAction: false,
                    preparationStatus: 'failed',
                    pendingReason:
                      execution?.error ?? 'O agente vai tentar novamente automaticamente.',
                  }
                : task,
            ),
          )

          updateOpportunityStatus(opportunity.id, 'pending')
          pushActivity({
            kind: 'system',
            message:
              state === 'blocked'
                ? `Gerente bloqueou a oportunidade — ${opportunity.title}.`
                : `Falha isolada — ${opportunity.title}. Nova tentativa automática no próximo ciclo.`,
          })
        } catch (error) {
          const timedOut = error instanceof DOMException && error.name === 'AbortError'
          console.error('Worker indisponível ou expirou:', error)

          setTasks((previous) =>
            previous.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    state: 'pending',
                    progress: Math.max(task.progress, 15),
                    requiresUserAction: false,
                    preparationStatus: 'failed',
                    pendingReason: timedOut
                      ? 'O Worker excedeu o tempo limite; nova tentativa automática em breve.'
                      : 'O Worker está indisponível; nova tentativa automática em breve.',
                  }
                : task,
            ),
          )

          updateOpportunityStatus(opportunity.id, 'pending')
          pushActivity({
            kind: 'system',
            message: timedOut
              ? `Tempo esgotado ao consultar o Worker — ${opportunity.title}.`
              : `Worker indisponível — ${opportunity.title}.`,
          })
        } finally {
          clearTimeout(timeoutId)
        }
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

        const assessment =
          evaluateManagerModules(
            opportunity,
          )

        if (assessment.blocked) {
          taskRunningRef.current.delete(
            opportunityId,
          )

          updateOpportunityStatus(
            opportunityId,
            'pending',
          )

          pushActivity({
            kind: 'pending',
            message: `Risco bloqueou a oportunidade — ${opportunity.title}.`,
          })

          return
        }

        const task:
          Task = {
          id:
            taskId,

          title:
            opportunity.title,

          source:
            opportunity.source,

          managerModules: assessment.modules,

          state:
            assessment.requiresHumanAction
              ? 'pending'
              : 'running',

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

          requiresUserAction:
            assessment.requiresHumanAction,

          preparationStatus:
            assessment.requiresHumanAction
              ? 'requires_user'
              : 'preparing',

          pendingReason:
            assessment.requiresHumanAction
              ? 'Ação humana necessária antes de prosseguir com segurança.'
              : undefined,

          prepared:
            assessment.route === 'prepare',
        }

        if (assessment.requiresHumanAction) {
          pushActivity({
            kind:
              'pending',

            message:
              `Avaliador encaminhou para ação humana — ${opportunity.title}.`,
          })
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
          assessment.requiresHumanAction
            ? 'pending'
            : 'running',
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

        if (!assessment.requiresHumanAction) {
          void processOpportunity(
            opportunity,
            taskId,
          ).finally(() => {
            taskRunningRef.current.delete(
              opportunityId,
            )
          })
        } else {
          taskRunningRef.current.delete(
            opportunityId,
          )
        }
      },
      [
        evaluateManagerModules,
        opportunities,
        processOpportunity,
        pushActivity,
        updateOpportunityStatus,
      ],
    )

  /*
   * ==========================================
   * AUTONOMIA REAL (Cron + /api/worker)
   * ==========================================
   *
   * O frontend NÃO é mais responsável por disparar sozinho várias
   * oportunidades em paralelo a cada render — isso fazia o "worker"
   * depender da aba do navegador ficar aberta. Quem sustenta a
   * operação contínua agora é o Cron da Vercel (vercel.json) batendo
   * em /api/worker, que roda runContinuousCycle -> runWorkerCycle ->
   * inspectOpportunity inteiramente no servidor, com fila persistida
   * no banco (execution_runs) e retry com backoff — funciona mesmo
   * com o navegador fechado. O usuário ainda pode iniciar qualquer
   * oportunidade manualmente (startOpportunity), mas o preenchimento
   * automático da fila de 3 vagas é responsabilidade do Worker/Cron.
   */

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
   * PRIMEIRA EXECUÇÃO
   * ==========================================
   */

  useEffect(() => {
    void refreshEarnings()
    void refreshNotifications()
    void runDiscoveryCycle()
  }, [
    refreshEarnings,
    refreshNotifications,
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
   * SINCRONIZAÇÃO COM O WORKER REAL
   * ==========================================
   *
   * A cada 20 segundos, e imediatamente ao montar. Isso é apenas
   * LEITURA do estado que o Worker (Cron ou execução manual) já
   * persistiu no servidor — nenhuma execução é disparada por este
   * intervalo, diferente do antigo ciclo de auto-fila do cliente.
   */

  useEffect(() => {
    void syncExecutionsFromServer()

    const interval = setInterval(() => {
      void syncExecutionsFromServer()
    }, 20_000)

    return () => clearInterval(interval)
  }, [syncExecutionsFromServer])

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  )

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
    notifications,
    unreadNotifications,

    stop,

    resume,

    resolvePending,

    startOpportunity,

    toggleIntegration,

    registerConfirmedEarning,

    refreshNotifications,
    markNotificationAsRead,
    clearReadNotifications,
    enableNotifications,

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
