import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyExecutionAction } from './execution-adapters.ts'

const apiLikeOpportunity = {
  category: 'freelance',
  title: 'Integração via REST API oficial',
  description: 'Use nossa REST API para automatizar o envio de propostas.',
  url: 'https://partner.example.com/developer/docs',
}

test('nunca finge integração de API sem credencial/parceria autorizada', () => {
  const original = process.env.AUTHORIZED_API_INTEGRATIONS
  delete process.env.AUTHORIZED_API_INTEGRATIONS

  const result = classifyExecutionAction(apiLikeOpportunity)

  assert.equal(result.actionType, 'form')
  assert.equal(result.integrationAvailable, false)
  assert.match(result.pendingIntegrationNote ?? '', /nenhuma credencial\/parceria autorizada/i)

  if (original !== undefined) process.env.AUTHORIZED_API_INTEGRATIONS = original
})

test('reconhece integração real quando o domínio está autorizado explicitamente', () => {
  const original = process.env.AUTHORIZED_API_INTEGRATIONS
  process.env.AUTHORIZED_API_INTEGRATIONS = 'partner.example.com'

  const result = classifyExecutionAction(apiLikeOpportunity)

  assert.equal(result.actionType, 'api')
  assert.equal(result.integrationAvailable, true)
  assert.equal(result.pendingIntegrationNote, undefined)

  if (original === undefined) delete process.env.AUTHORIZED_API_INTEGRATIONS
  else process.env.AUTHORIZED_API_INTEGRATIONS = original
})

test('canais sem sinal de API seguem o padrão do canal sem marcar pendência', () => {
  const result = classifyExecutionAction({
    category: 'surveys',
    title: 'Pesquisa remunerada paga $5',
    description: 'Responda a pesquisa e receba o pagamento.',
    url: 'https://surveys.example.com/task/1',
  })

  assert.equal(result.actionType, 'form')
  assert.equal(result.integrationAvailable, true)
  assert.equal(result.pendingIntegrationNote, undefined)
})
