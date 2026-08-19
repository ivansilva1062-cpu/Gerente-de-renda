export type AgentStatus = 'working' | 'waiting' | 'paused'

export type OpportunityCategory =
  | 'microtasks'
  | 'freelance'
  | 'surveys'
  | 'content'
  | 'affiliate'
  | 'testing'

export type OpportunityStatus = 'new' | 'queued' | 'running' | 'done' | 'pending'

export interface Opportunity {
  id: string
  title: string
  source: string
  category: OpportunityCategory
  estimatedValue: number
  confidence: number // 0-100
  status: OpportunityStatus
  discoveredAt: string // ISO
}

export type TaskState = 'running' | 'pending' | 'done'

export interface Task {
  id: string
  title: string
  source: string
  state: TaskState
  estimatedValue: number
  progress: number // 0-100
  startedAt: string // ISO
  // present when state === 'pending'
  pendingReason?: string
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
  /** true quando o evento provém da simulação (não é resultado real) */
  demo?: boolean
}

export interface Transaction {
  id: string
  description: string
  source: string
  amount: number
  at: string // ISO
  status: 'confirmed' | 'processing'
  /** true quando a entrada provém da simulação (não é dinheiro real) */
  demo?: boolean
}

export interface Integration {
  key: string
  name: string
  description: string
  connected: boolean
}
