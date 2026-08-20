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

/*
 * ==========================================
 * STATUS DA PREPARAÇÃO
 * ==========================================
 *
 * A preparação pode acontecer antes
 * da intervenção do usuário.
 *
 * Nunca significa que o pagamento
 * foi recebido.
 */
export type PreparationStatus =
  | 'not_started'
  | 'preparing'
  | 'ready'
  | 'requires_user'
  | 'completed'
  | 'failed'

export interface Opportunity {
  id: string

  title: string

  source: string

  category: OpportunityCategory

  /*
   * Valor estimado.
   *
   * NÃO representa dinheiro recebido.
   */
  estimatedValue: number

  /*
   * Confiança do radar.
   */
  confidence: number // 0-100

  status: OpportunityStatus

  /*
   * URL oficial da oportunidade.
   */
  url?: string | null

  /*
   * Indica se normalmente existe
   * necessidade de cadastro.
   */
  requiresSignup?: boolean

  /*
   * Indica se existe alguma etapa
   * que precisa da intervenção do usuário.
   *
   * Exemplos:
   * - CAPTCHA
   * - confirmação de identidade
   * - aprovação
   * - autenticação
   * - decisão que não pode ser automatizada
   */
  requiresUserAction?: boolean

  /*
   * Indica se o sistema pode preparar
   * automaticamente o fluxo.
   *
   * Isso NÃO significa que ele pode
   * concluir qualquer etapa sozinho.
   */
  automatedPreparation?: boolean

  /*
   * Estado atual da preparação.
   */
  preparationStatus?: PreparationStatus

  discoveredAt: string // ISO

  createdAt?: string
}

/*
 * ==========================================
 * TAREFAS
 * ==========================================
 */

export type TaskState =
  | 'running'
  | 'pending'
  | 'done'

export interface Task {
  id: string

  /*
   * Liga a tarefa à oportunidade
   * original.
   */
  opportunityId?: string

  title: string

  source: string

  state: TaskState

  /*
   * Valor estimado.
   *
   * NÃO é dinheiro confirmado.
   */
  estimatedValue: number

  progress: number // 0-100

  startedAt: string // ISO

  /*
   * URL da oportunidade.
   */
  actionUrl?: string

  /*
   * Cadastro necessário.
   */
  requiresSignup?: boolean

  /*
   * Ação humana necessária.
   */
  requiresUserAction?: boolean

  /*
   * Estado da preparação.
   */
  preparationStatus?: PreparationStatus

  /*
   * Motivo pelo qual a tarefa
   * precisa de intervenção.
   */
  pendingReason?: string

  /*
   * URL específica para a ação
   * que precisa ser feita pelo usuário.
   */
  pendingActionUrl?: string

  /*
   * Indica que a tarefa foi preparada
   * pelo sistema, mas ainda não significa
   * que foi concluída ou paga.
   */
  prepared?: boolean
}

/*
 * ==========================================
 * ATIVIDADES
 * ==========================================
 */

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

  /*
   * true somente para demonstrações/simulações.
   */
  demo?: boolean
}

/*
 * ==========================================
 * TRANSAÇÕES
 * ==========================================
 */

export interface Transaction {
  id: string

  description: string

  source: string

  amount: number

  at: string // ISO

  /*
   * Somente confirmed representa
   * dinheiro efetivamente confirmado.
   */
  status:
    | 'confirmed'
    | 'processing'

  /*
   * true somente para demonstração.
   */
  demo?: boolean
}

/*
 * ==========================================
 * INTEGRAÇÕES
 * ==========================================
 */

export interface Integration {
  key: string

  name: string

  description: string

  connected: boolean
}
