import type { ActivityKind, OpportunityCategory, OpportunityStatus } from './types'

export const categoryLabel: Record<OpportunityCategory, string> = {
  microtasks: 'Microtarefas',
  freelance: 'Freelance',
  surveys: 'Pesquisas',
  content: 'Conteúdo',
  affiliate: 'Afiliados',
  testing: 'Testes',
}

export const opportunityStatusLabel: Record<OpportunityStatus, string> = {
  new: 'Nova',
  queued: 'Na fila',
  running: 'Em execução',
  done: 'Concluída',
  pending: 'Pendente',
}

export const activityLabel: Record<ActivityKind, string> = {
  discovery: 'Descoberta',
  start: 'Início',
  progress: 'Progresso',
  earning: 'Ganho',
  pending: 'Pendência',
  resolved: 'Resolvida',
  system: 'Sistema',
}
