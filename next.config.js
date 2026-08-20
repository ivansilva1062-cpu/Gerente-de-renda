/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'playwright-core',
  ],

  outputFileTracingIncludes: {
    '/api/worker/**': [
      './node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json',
    ],
  },
}

module.exports = nextConfig
