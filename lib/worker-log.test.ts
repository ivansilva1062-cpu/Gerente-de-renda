import assert from 'node:assert/strict'
import test from 'node:test'
import { logWorkerEvent } from './worker-log.ts'

function captureLogs(run: () => void) {
  const lines: string[] = []
  const original = console.log
  console.log = (line: string) => lines.push(line)
  try {
    run()
  } finally {
    console.log = original
  }
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>)
}

test('registra o evento e os dados seguros fornecidos', () => {
  const [entry] = captureLogs(() => {
    logWorkerEvent('CANDIDATES_FOUND', { candidatesFound: 12, eligible: 5 })
  })

  assert.equal(entry.event, 'CANDIDATES_FOUND')
  assert.equal(entry.candidatesFound, 12)
  assert.equal(entry.eligible, 5)
  assert.equal(typeof entry.at, 'string')
})

test('nunca inclui chaves com nome de segredo, mesmo se alguém passar por engano', () => {
  const [entry] = captureLogs(() => {
    logWorkerEvent('WORKER_AUTHORIZED', {
      via: 'cron_secret',
      CRON_SECRET: 'nunca-deveria-aparecer',
      cronSecret: 'nunca-deveria-aparecer',
      DATABASE_URL: 'nunca-deveria-aparecer',
      apiKey: 'nunca-deveria-aparecer',
      password: 'nunca-deveria-aparecer',
      cookie: 'nunca-deveria-aparecer',
    })
  })

  assert.equal(entry.via, 'cron_secret')
  assert.equal('CRON_SECRET' in entry, false)
  assert.equal('cronSecret' in entry, false)
  assert.equal('DATABASE_URL' in entry, false)
  assert.equal('apiKey' in entry, false)
  assert.equal('password' in entry, false)
  assert.equal('cookie' in entry, false)
})
