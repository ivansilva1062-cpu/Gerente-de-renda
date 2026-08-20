/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  serverExternalPackages: [
    'playwright-core',
  ],

  outputFileTracingIncludes: {
    '/api/worker/**': [
      './node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json',
    ],
  },
}

export default nextConfig
