import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildNotificationBody,
  buildNotificationTitle,
  composeEventKey,
} from './notifications.ts'

test('gera chave estável para impedir duplicação de evento', () => {
  const keyA = composeEventKey('earning', 'earning-123')
  const keyB = composeEventKey('earning', 'earning-123')

  assert.equal(keyA, keyB)
  assert.match(keyA, /^earning:/)
})

test('monta texto financeiro somente para ganho confirmado', () => {
  const title = buildNotificationTitle({
    kind: 'earning',
    amount: 125.5,
    title: '💰 Ganho confirmado!',
  })
  const body = buildNotificationBody({
    kind: 'earning',
    amount: 125.5,
    source: 'Fundo de renda',
    at: '2026-09-18T12:00:00.000Z',
  })

  assert.equal(title, '💰 Ganho confirmado!')
  assert.match(body, /R\$\s*125,50/i)
  assert.match(body, /Fundo de renda/i)
  assert.match(body, /2026/i)
})

test('não gera texto de ganho para oportunidade em preparação', () => {
  const title = buildNotificationTitle({
    kind: 'opportunity_ready',
    amount: 0,
    title: '🚀 Oportunidade pronta',
  })
  const body = buildNotificationBody({
    kind: 'opportunity_ready',
    amount: 0,
    source: 'Renda recorrente',
    at: '2026-09-18T12:00:00.000Z',
  })

  assert.equal(title, '🚀 Oportunidade pronta')
  assert.match(body, /ainda não é ganho confirmado/i)
  assert.match(body, /R\$\s*0,00/i)
})
