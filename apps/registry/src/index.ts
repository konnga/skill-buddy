import { buildServer } from './server.js'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '0.0.0.0'
const dbPath = process.env.DB_PATH ?? './registry.db'
const adminToken = process.env.ADMIN_TOKEN ?? ''

if (!adminToken) {
  console.error('ADMIN_TOKEN env is required (bootstrap admin credential)')
  process.exit(1)
}

const app = buildServer({ dbPath, adminToken })

app
  .listen({ port, host })
  .then(() => console.log(`skills registry listening on ${host}:${port}, db=${dbPath}`))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
