import { neon } from '@neondatabase/serverless'

export const sql = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : (async () => {
      throw new Error('DATABASE_URL não configurada')
    }) as ReturnType<typeof neon>
