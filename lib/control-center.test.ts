import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canStartMoreActions,
  isCategoryBlocked,
  requiresManualApproval,
} from './control-center-rules.ts'

test('sem limite diário definido, o ciclo autônomo sempre pode iniciar mais ações', () => {
  assert.equal(canStartMoreActions({ dailyActionLimit: null }, 999), true)
})

test('limite diário de ações nunca é ultrapassado pelo ciclo autônomo', () => {
  assert.equal(canStartMoreActions({ dailyActionLimit: 5 }, 4), true)
  assert.equal(canStartMoreActions({ dailyActionLimit: 5 }, 5), false)
  assert.equal(canStartMoreActions({ dailyActionLimit: 5 }, 6), false)
})

test('categoria bloqueada pela Central de Controle nunca é elegível', () => {
  const settings = { blockedCategories: ['sales', 'affiliate'] }
  assert.equal(isCategoryBlocked(settings, 'sales'), true)
  assert.equal(isCategoryBlocked(settings, 'freelance'), false)
  assert.equal(isCategoryBlocked(settings, null), false)
  assert.equal(isCategoryBlocked(settings, undefined), false)
})

test('valor acima do limite de aprovação sempre exige confirmação humana', () => {
  assert.equal(requiresManualApproval({ requiresApprovalAboveUsd: 100 }, 150), true)
  assert.equal(requiresManualApproval({ requiresApprovalAboveUsd: 100 }, 100), false)
  assert.equal(requiresManualApproval({ requiresApprovalAboveUsd: null }, 999999), false)
})
