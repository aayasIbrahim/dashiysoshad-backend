import 'dotenv/config'
import { env } from 'node:process'
import { defineConfig } from 'prisma/config'

const databaseUrl = env.DATABASE_URL

if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set')
}

export default defineConfig({
    schema: 'prisma/schema',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: databaseUrl,
    },
})
