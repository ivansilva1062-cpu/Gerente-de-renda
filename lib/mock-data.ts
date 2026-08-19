import type {
  ActivityEvent,
  Integration,
  Opportunity,
  Task,
  Transaction,
} from './types'

const now = Date.now()
const min = 60_000

// Meta usada somente como indicador visual.
// Nunca faz o agente parar.
export const DAILY_GOAL = 120

// Não existem valores financeiros fictícios.
// O saldo real começa em zero.
export const INITIAL_TODAY = 0
export const INITIAL_TOTAL = 0

/*
 * Oportunidades iniciais.
 *
 * O estimatedValue é apenas uma ESTIMATIVA da oportunidade.
 * Não representa dinheiro recebido.
 *
 * O pagamento só deve entrar no saldo quando houver
 * confirmação real.
 */
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

/*
 * Tarefas iniciais.
 *
 * Também são apenas tarefas de demonstração do funcionamento
 * do agente. Concluir uma tarefa NÃO gera dinheiro automaticamente.
 */
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
    actionUrl: undefined,
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
    actionUrl: undefined,
  },
]

/*
 * HISTÓRICO
 *
 * Começa vazio.
 *
 * Não vamos mostrar "ganhos" que nunca aconteceram.
 */
export const seedActivity: ActivityEvent[] = []

/*
 * TRANSAÇÕES
 *
 * Começa vazio.
 *
 * Uma transação só deve aparecer aqui quando houver
 * confirmação real de pagamento.
 */
export const seedTransactions: Transaction[] = []

/*
 * INTEGRAÇÕES
 */
export const seedIntegrations: Integration[] = [
  {
    key: 'ai-agent',
    name: 'Agente de IA',
    description:
      'Motor de decisão que encontra e executa oportunidades.',
    connected: false,
  },
  {
    key: 'web-search',
    name: 'Pesquisa na internet',
    description:
      'Descoberta de novas fontes e oportunidades em tempo real.',
    connected: false,
  },
  {
    key: 'browser',
    name: 'Navegador automatizado isolado',
    description:
      'Ambiente sandbox para executar tarefas com segurança.',
    connected: false,
  },
  {
    key: 'database',
    name: 'Banco de dados',
    description:
      'Persistência de oportunidades, tarefas e histórico.',
    connected: false,
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    description:
      'Notificações de pendências e ganhos importantes.',
    connected: false,
  },
  {
    key: 'auth',
    name: 'Autenticação',
    description:
      'Acesso privado protegido por login e 2FA.',
    connected: false,
  },
]

/*
 * GRÁFICO
 *
 * Também não mostramos ganhos fictícios.
 * Até existirem ganhos confirmados, a série permanece em zero.
 */
export const seedEarningsSeries = Array.from(
  { length: 14 },
  (_, i) => ({
    day: `D-${13 - i}`,
    amount: 0,
  }),
)
