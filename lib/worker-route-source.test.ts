import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

async function readWorkerRoute() {
  return readFile(resolve(root, 'app/api/worker/route.ts'), 'utf8')
}

test('falha do radar (descoberta) nunca impede o processamento da fila já existente', async () => {
  const source = await readWorkerRoute()

  /*
   * Bug real corrigido: antes, uma exceção de runDiscovery() (ex.:
   * falha externa da API de busca) interrompia a rota inteira ANTES
   * de chamar runContinuousCycle — deixando toda a fila já
   * queued/pending sem ser processada só porque o radar de NOVAS
   * oportunidades falhou. Agora runDiscovery precisa estar dentro de
   * um try/catch que não impede a chamada seguinte a
   * runContinuousCycle.
   */
  const radarBlockMatch = source.match(
    /if \(!opportunityId\) \{[\s\S]*?const cycle = await runContinuousCycle\(cycleStartedAt\)/,
  )
  assert.ok(radarBlockMatch, 'bloco do modo radar não encontrado em app/api/worker/route.ts')

  const radarBlock = radarBlockMatch[0]
  assert.match(radarBlock, /try \{\s*radar = await runDiscovery\(request\)/)
  assert.match(radarBlock, /catch \(error\) \{/)
  assert.match(radarBlock, /const cycle = await runContinuousCycle\(cycleStartedAt\)/)
})

test('nenhum timeout de claim travado fica hardcoded — usa a constante centralizada', async () => {
  const source = await readWorkerRoute()

  assert.equal(source.includes("INTERVAL '15 minutes'"), false)
  assert.match(source, /STALE_CLAIM_TIMEOUT_MINUTES/)
  assert.match(source, /import \{ [^}]*STALE_CLAIM_TIMEOUT_MINUTES[^}]* \} from '@\/lib\/worker-cycle'/)
})

test('claim de oportunidade usa UPDATE...WHERE...RETURNING atômico, nunca leitura seguida de escrita', async () => {
  const source = await readWorkerRoute()
  const claimFunction = source.match(/async function claimOpportunity[\s\S]*?\n}/)

  assert.ok(claimFunction, 'função claimOpportunity não encontrada')
  assert.match(claimFunction[0], /UPDATE opportunities/)
  assert.match(claimFunction[0], /RETURNING id/)
})

test('log estruturado do Worker nunca é montado a partir de variáveis de segredo por valor', async () => {
  const source = await readWorkerRoute()

  assert.match(source, /import \{ logWorkerEvent \} from '@\/lib\/worker-log'/)
  // Os logs de configuração só podem expor booleanos de presença, nunca o valor da env var.
  assert.match(source, /cronSecretConfigured: Boolean\(process\.env\.CRON_SECRET\)/)
  assert.match(source, /databaseConfigured: Boolean\(process\.env\.DATABASE_URL\)/)
  assert.match(source, /browserbaseApiKeyConfigured: Boolean\(process\.env\.BROWSERBASE_API_KEY\)/)
})
