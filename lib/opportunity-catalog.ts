export const OPPORTUNITY_CATEGORIES = [
  'surveys',
  'testing',
  'microtasks',
  'freelance',
  'services',
  'affiliate',
  'sales',
  'content',
  'other',
] as const

export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number]

export type OpportunitySource = {
  key: string
  category: OpportunityCategory
  query: string
  description: string
}

export const OPPORTUNITY_SOURCES: OpportunitySource[] = [
  {
    key: 'paid-research',
    category: 'surveys',
    query: 'legitimate paid research studies participant sign up apply online',
    description: 'Pesquisas, estudos e entrevistas remuneradas.',
  },
  {
    key: 'website-app-testing',
    category: 'testing',
    query: 'paid website app testing become tester sign up',
    description: 'Testes de sites, aplicativos e usabilidade.',
  },
  {
    key: 'microtasks',
    category: 'microtasks',
    query: 'legitimate paid online microtasks apply now remote paid work',
    description: 'Microtarefas digitais com ação verificável.',
  },
  {
    key: 'freelance',
    category: 'freelance',
    query: 'remote freelance jobs apply now get paid legitimate',
    description: 'Projetos e trabalhos freelance.',
  },
  {
    key: 'services',
    category: 'services',
    query: 'legitimate paid service requests remote provider apply get paid',
    description: 'Solicitações de serviços e prestação profissional.',
  },
  {
    key: 'affiliate',
    category: 'affiliate',
    query: 'affiliate programs join apply become affiliate start earning',
    description: 'Programas oficiais de afiliados e indicação.',
  },
  {
    key: 'sales',
    category: 'sales',
    query: 'legitimate commission sales opportunities remote sell products apply',
    description: 'Vendas e comissões com fonte identificável.',
  },
  {
    key: 'content',
    category: 'content',
    query: 'legitimate creator publishing content monetization program apply get paid',
    description: 'Publicação, criação e monetização de conteúdo.',
  },
]