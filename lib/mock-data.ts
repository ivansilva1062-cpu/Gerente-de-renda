import type {
  ActivityEvent,
  Integration,
  Opportunity,
  Task,
  Transaction,
} from './types'

const now = Date.now()
const min = 60_000

export const DAILY_GOAL = 120 // indicador, nunca limite
export const INITIAL_TODAY = 78.4
export const INITIAL_TOTAL = 4192.75

export const seedOpportunities: Opportunity[] = [
  {
    id: 'op-1',
    title: 'Transcrição de áudio (12 min)',
    source: 'TaskPool US',
    category: 'microtasks',
    estimatedValue: 6.5,
    confidence: 92,
    status: 'running',
    discoveredAt: new Date(now - 4 * min).toISOString(),
  },
  {
    id: 'op-2',
    title: 'Revisão de artigo técnico em inglês',
    source: 'FreelanceHub',
    category: 'freelance',
    estimatedValue: 42,
    confidence: 74,
    status: 'queued',
    discoveredAt: new Date(now - 9 * min).toISOString(),
  },
  {
    id: 'op-3',
    title: 'Pesquisa de mercado — consumidores EUA',
    source: 'SurveyLane',
    category: 'surveys',
    estimatedValue: 3.2,
    confidence: 88,
    status: 'new',
    discoveredAt: new Date(now - 12 * min).toISOString(),
  },
  {
    id: 'op-4',
    title: 'Teste de usabilidade de app (guiado)',
    source: 'UserTrials',
    category: 'testing',
    estimatedValue: 15,
    confidence: 61,
    status: 'pending',
    discoveredAt: new Date(now - 21 * min).toISOString(),
  },
  {
    id: 'op-5',
    title: 'Redação de 3 descrições de produto',
    source: 'ContentDesk',
    category: 'content',
    estimatedValue: 27.5,
    confidence: 80,
    status: 'new',
    discoveredAt: new Date(now - 33 * min).toISOString(),
  },
  {
    id: 'op-6',
    title: 'Indicação afiliada — ferramenta SaaS',
    source: 'PartnerNet',
    category: 'affiliate',
    estimatedValue: 55,
    confidence: 47,
    status: 'new',
    discoveredAt: new Date(now - 48 * min).toISOString(),
  },
]

export const seedTasks: Task[] = [
  {
    id: 'tk-1',
    title: 'Transcrição de áudio (12 min)',
    source: 'TaskPool US',
    state: 'running',
    estimatedValue: 6.5,
    progress: 64,
    startedAt: new Date(now - 3 * min).toISOString(),
  },
  {
    id: 'tk-2',
    title: 'Categorização de imagens (lote 220)',
    source: 'DataMark',
    state: 'running',
    estimatedValue: 9.8,
    progress: 38,
    startedAt: new Date(now - 6 * min).toISOString(),
  },
  {
    id: 'tk-3',
    title: 'Teste de usabilidade de app (guiado)',
    source: 'UserTrials',
    state: 'pending',
    estimatedValue: 15,
    progress: 20,
    startedAt: new Date(now - 18 * min).toISOString(),
    pendingReason:
      'A plataforma exige verificação por código enviado ao seu e-mail para liberar o teste.',
    actionUrl: 'https://example.com/tarefa/usertrials-verificacao',
  },
  {
    id: 'tk-4',
    title: 'Saque de saldo acumulado',
    source: 'FreelanceHub',
    state: 'pending',
    estimatedValue: 84,
    progress: 90,
    startedAt: new Date(now - 55 * min).toISOString(),
    pendingReason:
      'Confirmação de identidade (2FA) necessária para autorizar a transferência.',
    actionUrl: 'https://example.com/tarefa/freelancehub-saque',
  },
]

export const seedActivity: ActivityEvent[] = [
  {
    id: 'ac-1',
    kind: 'earning',
    message: 'Tarefa concluída — Pesquisa rápida SurveyLane',
    amount: 3.2,
    at: new Date(now - 2 * min).toISOString(),
  },
  {
    id: 'ac-2',
    kind: 'discovery',
    message: 'Nova oportunidade encontrada em FreelanceHub',
    at: new Date(now - 5 * min).toISOString(),
  },
  {
    id: 'ac-3',
    kind: 'pending',
    message: 'Tarefa marcada como pendente — UserTrials (verificação)',
    at: new Date(now - 18 * min).toISOString(),
  },
  {
    id: 'ac-4',
    kind: 'start',
    message: 'Iniciada transcrição de áudio (TaskPool US)',
    at: new Date(now - 3 * min).toISOString(),
  },
  {
    id: 'ac-5',
    kind: 'earning',
    message: 'Tarefa concluída — Categorização de imagens',
    amount: 8.5,
    at: new Date(now - 24 * min).toISOString(),
  },
  {
    id: 'ac-6',
    kind: 'system',
    message: 'Agente iniciado e monitorando 6 fontes',
    at: new Date(now - 60 * min).toISOString(),
  },
]

export const seedTransactions: Transaction[] = [
  {
    id: 'tx-1',
    description: 'Pesquisa rápida',
    source: 'SurveyLane',
    amount: 3.2,
    at: new Date(now - 2 * min).toISOString(),
    status: 'confirmed',
  },
  {
    id: 'tx-2',
    description: 'Categorização de imagens',
    source: 'DataMark',
    amount: 8.5,
    at: new Date(now - 24 * min).toISOString(),
    status: 'confirmed',
  },
  {
    id: 'tx-3',
    description: 'Microtarefas agrupadas',
    source: 'TaskPool US',
    amount: 21.4,
    at: new Date(now - 3 * 60 * min).toISOString(),
    status: 'confirmed',
  },
  {
    id: 'tx-4',
    description: 'Revisão de conteúdo',
    source: 'ContentDesk',
    amount: 45.25,
    at: new Date(now - 26 * 60 * min).toISOString(),
    status: 'processing',
  },
]

export const seedIntegrations: Integration[] = [
  {
    key: 'ai-agent',
    name: 'Agente de IA',
    description: 'Motor de decisão que encontra e executa oportunidades.',
    connected: false,
  },
  {
    key: 'web-search',
    name: 'Pesquisa na internet',
    description: 'Descoberta de novas fontes e oportunidades em tempo real.',
    connected: false,
  },
  {
    key: 'browser',
    name: 'Navegador automatizado isolado',
    description: 'Ambiente sandbox para executar tarefas com segurança.',
    connected: false,
  },
  {
    key: 'database',
    name: 'Banco de dados',
    description: 'Persistência de oportunidades, tarefas e histórico.',
    connected: false,
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    description: 'Notificações de pendências e ganhos importantes.',
    connected: false,
  },
  {
    key: 'auth',
    name: 'Autenticação',
    description: 'Acesso privado protegido por login e 2FA.',
    connected: false,
  },
]

// Série para gráfico dos últimos 14 dias (mock)
export const seedEarningsSeries = [
  62, 41, 88, 73, 95, 110, 54, 130, 78, 102, 66, 121, 90, INITIAL_TODAY,
].map((amount, i, arr) => ({
  day: `D-${arr.length - 1 - i}`,
  amount,
}))
