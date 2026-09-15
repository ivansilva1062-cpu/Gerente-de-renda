import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessOpportunity,
  financeiro,
  isInformationalContent,
  rankOpportunities,
} from './manager-modules.ts'
import { OPPORTUNITY_CATEGORIES, OPPORTUNITY_SOURCES } from './opportunity-catalog.ts'

test('mantém conteúdo informativo fora do catálogo acionável', () => {
  assert.equal(
    isInformationalContent({
      title: 'Best ways to make money online',
      url: 'https://source.example.com/guide',
      description: 'A guide with tips and comparisons.',
    }),
    true,
  )
})

test('bloqueia fluxo sensível e registra intervenção humana', () => {
  const assessment = assessOpportunity({
    title: 'Paid survey apply now',
    url: 'https://research.example.com/apply',
    description: 'Get paid $20 per survey after identity verification and login.',
    source: 'research.example.com',
    category: 'surveys',
    estimatedValue: 20,
    confidence: 90,
  })

  assert.equal(assessment.blocked, true)
  assert.equal(assessment.requiresHumanAction, true)
  assert.equal(assessment.route, 'blocked')
  assert.equal(assessment.comparison.riskScore, 10)
})

test('prioriza retorno verificável com menor risco relativo', () => {
  const ranked = rankOpportunities([
    {
      title: 'Paid microtask apply now',
      url: 'https://tasks.example.com/apply',
      description: 'Get paid $8 per task. Start earning now.',
      source: 'tasks.example.com',
      category: 'microtasks',
      estimatedValue: 8,
      confidence: 85,
    },
    {
      title: 'High reward task apply now',
      url: 'https://risky.example.com/apply',
      description: 'Get paid $100, but pay to apply and connect your wallet.',
      source: 'risky.example.com',
      category: 'other',
      estimatedValue: 100,
      confidence: 95,
    },
  ])

  assert.equal(ranked[0]?.input.source, 'tasks.example.com')
  assert.equal(ranked[1]?.assessment.blocked, true)
})

test('mantém estimativa separada de ganho confirmado', () => {
  const result = financeiro({
    title: 'Paid freelance job apply now',
    url: 'https://work.example.com/apply',
    description: 'Get paid per project.',
    estimatedValue: 500,
  })

  assert.equal(result.approved, true)
  assert.match(result.reason, /não altera o saldo de ganhos/)
})

test('catálogo cobre todos os nichos multimercado', () => {
  assert.deepEqual(
    OPPORTUNITY_CATEGORIES,
    ['surveys', 'testing', 'microtasks', 'freelance', 'services', 'affiliate', 'sales', 'content', 'other'],
  )
  assert.equal(OPPORTUNITY_SOURCES.length, 8)
})
