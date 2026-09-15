import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

async function read(relativePath: string) {
  return readFile(resolve(root, relativePath), 'utf8')
}

test('mantém o contrato instalável da PWA para iPhone', async () => {
  const manifest = JSON.parse(await read('public/manifest.webmanifest')) as {
    name?: string
    short_name?: string
    start_url?: string
    scope?: string
    display?: string
    icons?: Array<{ src?: string; sizes?: string; type?: string }>
  }
  const layout = await read('app/layout.tsx')
  const register = await read('components/pwa-register.tsx')

  assert.equal(manifest.name, 'Gerente de Renda')
  assert.equal(manifest.short_name, 'Gerente')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.icons?.some((icon) => icon.src === '/apple-icon.png' && icon.type === 'image/png'))
  assert.match(layout, /appleWebApp:\s*\{[\s\S]*capable: true/)
  assert.match(layout, /manifest: ['"]\/manifest\.webmanifest['"]/) 
  assert.match(register, /serviceWorker\.register\(['"]\/sw\.js['"]/) 
  await read('public/apple-icon.png')
  await read('public/icon.svg')
})

test('não permite cache local de sessão, APIs ou respostas financeiras', async () => {
  const serviceWorker = await read('public/sw.js')

  assert.match(serviceWorker, /Network-only service worker/)
  assert.doesNotMatch(serviceWorker, /caches\.open|cache\.put|CacheStorage/)
  assert.match(serviceWorker, /fetch\(event\.request\)/)
})

test('mantém Passkey, sessão HttpOnly e expiração no servidor', async () => {
  const authServer = await read('lib/auth-server.ts')
  const authRoute = await read('app/api/auth/route.ts')

  assert.match(authServer, /createHmac\('sha256', sessionSecret\(\)\)/)
  assert.ok(authServer.includes('sessionTokenIsFresh('))
  assert.match(authServer, /timingSafeEqual\(/)
  assert.match(authServer, /CHALLENGE_TTL_MS|INTERVAL '5 minutes'/)
  assert.match(authServer, /verifyRegistrationResponse/)
  assert.match(authServer, /verifyAuthenticationResponse/)
  assert.ok(authServer.includes('last_seen_at > NOW()'))
  assert.ok(authServer.includes('idleTimeoutSeconds'))
  assert.match(authServer, /revokeSession\(/)
  assert.match(authRoute, /httpOnly: true/)
  assert.match(authRoute, /sameSite: 'strict'/)
  assert.match(authRoute, /registration-options/)
  assert.match(authRoute, /authentication-options/)
  assert.match(authRoute, /action === 'block'/)
})

test('mantém acesso protegido no middleware e nas APIs privadas', async () => {
  const middleware = await read('middleware.ts')
  const earnings = await read('app/api/earnings/route.ts')
  const execution = await read('app/api/execution/route.ts')
  const worker = await read('app/api/worker/route.ts')

  assert.match(middleware, /requestHasActiveSession|validSignature/)
  assert.match(middleware, /Autenticação necessária/)
  assert.match(middleware, /redirect\(new URL\('\/acesso'/)
  assert.match(earnings, /requestHasActiveSession\(\)/)
  assert.match(execution, /requestHasActiveSession\(\)/)
  assert.match(worker, /requestHasActiveSession\(\)/)
})