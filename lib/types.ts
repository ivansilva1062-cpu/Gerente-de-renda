export type AgentStatus =
  | 'working'
  | 'waiting'
  | 'paused'

export type OpportunityCategory =
  | 'microtasks'
  | 'freelance'
  | 'surveys'
  | 'content'
  | 'affiliate'
  | 'testing'

export type OpportunityStatus =
  | 'new'
  | 'queued'
  | 'running'
  | 'done'
  | 'pending'

export interface Opportunity {
  id: string
  title: string
  source: string
  category: OpportunityCategory

  /*
   * Valor estimado.
   *
   * IMPORTANTE:
   * Não representa dinheiro recebido.
   */
  estimatedValue: number

  confidence: number // 0-100

  status: OpportunityStatus

  /*
   * Endereço da oportunidade real.
   *
   * Exemplo:
   * https://www.prolific.com/...
   *
   * O sistema pode usar essa URL
   * para encaminhar o usuário à fonte.
   */
  url?: string | null

  /*
   * Indica se o usuário precisa
   * criar uma conta antes de continuar.
   */
  requiresSignup?: boolean

  /*
   * Indica que a oportunidade
   * exige uma ação humana.
   *
   * Isso evita o sistema fingir
   * que executou uma tarefa.
   */
  requiresUserAction?: boolean

  discoveredAt: string // ISO

  /*
   * Data de criação no banco.
   *
   * Opcional para manter compatibilidade
   * com oportunidades antigas.
   */
  createdAt?: string
}

export type TaskState =
  | 'running'
  | 'pending'
  | 'done'

export interface Task {
  id: string
  title: string
  source: string
  state: TaskState

  /*
   * Valor estimado da tarefa.
   *
   * NÃO é dinheiro confirmado.
   */
  estimatedValue: number

  progress: number // 0-100

  startedAt: string // ISO

  /*
   * Present when state === 'pending'
   */
  pendingReason?: string

  /*
   * URL para ação humana,
   * quando necessário.
   */
  actionUrl?: string
}

export type ActivityKind =
  | 'discovery'
  | 'start'
  | 'progress'
  | 'earning'
  | 'pending'
  | 'resolved'
  | 'system'

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  message: string
  amount?: number
  at: string // ISO

  /**
   * true quando o evento provém
   * da simulação.
   *
   * Eventos reais devem ser false
   * ou não possuir este campo.
   */
  demo?: boolean
}

export interface Transaction {
  id: string
  description: string
  source: string
  amount: number
  at: string // ISO

  /*
   * Somente 'confirmed' deve
   * representar dinheiro recebido.
   */
  status:
    | 'confirmed'
    | 'processing'

  /**
   * true quando a entrada provém
   * da simulação.
   *
   * Nunca deve ser tratada como
   * dinheiro real.
   */
  demo?: boolean
}

export interface Integration {
  key: string
  name: string
  description: string
  connected: boolean
}
