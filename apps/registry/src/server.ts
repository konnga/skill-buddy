import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { audit, openDb, type Db } from './db.js'
import { authenticate, canPublish, canReadOrg, issueToken, type Actor } from './auth.js'

export interface ServerOptions {
  dbPath: string
  adminToken: string
}

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const VERSION_RE = /^\d+\.\d+\.\d+$/

interface PublishBody {
  version: string
  description?: string
  tags?: string[]
  content: string
  resources?: Record<string, string>
}

export function buildServer(options: ServerOptions): FastifyInstance & { db: Db } {
  const db = openDb(options.dbPath)
  const app = Fastify({ logger: false }) as unknown as FastifyInstance & { db: Db }
  app.db = db

  const actorOf = (req: FastifyRequest): Actor | null =>
    authenticate(db, options.adminToken, req.headers.authorization)

  app.get('/healthz', async () => ({ ok: true }))

  /* ---------- orgs ---------- */

  app.post('/api/orgs', async (req, reply) => {
    const actor = actorOf(req)
    if (actor?.role !== 'admin') return reply.code(403).send({ error: 'admin only' })
    const { name, displayName } = req.body as { name?: string; displayName?: string }
    if (!name || !NAME_RE.test(name)) return reply.code(400).send({ error: 'invalid org name' })
    try {
      db.prepare('INSERT INTO orgs (name, display_name, created_at) VALUES (?, ?, ?)').run(
        name,
        displayName ?? name,
        Date.now(),
      )
    } catch {
      return reply.code(409).send({ error: 'org exists' })
    }
    audit(db, { actor: actor.name, org: name, action: 'org.create', subject: name })
    return { name }
  })

  app.get('/api/orgs', async (req, reply) => {
    const actor = actorOf(req)
    if (!actor) return reply.code(401).send({ error: 'unauthorized' })
    const rows = db.prepare('SELECT name, display_name AS displayName FROM orgs').all() as {
      name: string
    }[]
    return actor.role === 'admin' ? rows : rows.filter((r) => r.name === actor.org)
  })

  app.post('/api/orgs/:org/tokens', async (req, reply) => {
    const actor = actorOf(req)
    const { org } = req.params as { org: string }
    if (!actor || !canPublish(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    const { name, role } = req.body as { name?: string; role?: 'owner' | 'member' }
    if (!name || !['owner', 'member'].includes(role ?? '')) {
      return reply.code(400).send({ error: 'name and role (owner|member) required' })
    }
    const orgExists = db.prepare('SELECT 1 FROM orgs WHERE name = ?').get(org)
    if (!orgExists) return reply.code(404).send({ error: 'org not found' })
    const token = issueToken(db, org, name, role!)
    audit(db, { actor: actor.name, org, action: 'token.issue', subject: `${name}:${role}` })
    return { token }
  })

  /* ---------- skills ---------- */

  app.get('/api/skills', async (req, reply) => {
    const actor = actorOf(req)
    if (!actor) return reply.code(401).send({ error: 'unauthorized' })
    const { q } = req.query as { q?: string }
    const rows = db
      .prepare(
        `SELECT s.org, s.name, s.description, s.tags, s.version, s.created_at AS createdAt
         FROM skills s
         JOIN (SELECT org, name, MAX(id) AS id FROM skills GROUP BY org, name) latest
           ON s.id = latest.id
         ORDER BY s.org, s.name`,
      )
      .all() as { org: string; name: string; description: string; tags: string }[]
    const visible = rows.filter((r) => canReadOrg(actor, r.org))
    const needle = q?.toLowerCase().trim()
    const result = needle
      ? visible.filter(
          (r) =>
            r.name.includes(needle) ||
            r.description.toLowerCase().includes(needle) ||
            r.tags.toLowerCase().includes(needle),
        )
      : visible
    return result.map((r) => ({ ...r, tags: JSON.parse(r.tags) as string[] }))
  })

  app.get('/api/skills/:org/:name', async (req, reply) => {
    const actor = actorOf(req)
    const { org, name } = req.params as { org: string; name: string }
    if (!actor || !canReadOrg(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    const { version } = req.query as { version?: string }
    const row = (
      version
        ? db
            .prepare('SELECT * FROM skills WHERE org = ? AND name = ? AND version = ?')
            .get(org, name, version)
        : db
            .prepare('SELECT * FROM skills WHERE org = ? AND name = ? ORDER BY id DESC LIMIT 1')
            .get(org, name)
    ) as
      | {
          org: string
          name: string
          version: string
          description: string
          tags: string
          content: string
          resources: string | null
          published_by: string
          created_at: number
        }
      | undefined
    if (!row) return reply.code(404).send({ error: 'not found' })
    audit(db, {
      actor: actor.name,
      org,
      action: 'skill.download',
      subject: `${org}/${name}@${row.version}`,
    })
    return {
      org: row.org,
      name: row.name,
      version: row.version,
      description: row.description,
      tags: JSON.parse(row.tags) as string[],
      content: row.content,
      resources: row.resources ? (JSON.parse(row.resources) as Record<string, string>) : undefined,
      publishedBy: row.published_by,
      createdAt: row.created_at,
    }
  })

  app.get('/api/skills/:org/:name/versions', async (req, reply) => {
    const actor = actorOf(req)
    const { org, name } = req.params as { org: string; name: string }
    if (!actor || !canReadOrg(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    return db
      .prepare(
        'SELECT version, published_by AS publishedBy, created_at AS createdAt FROM skills WHERE org = ? AND name = ? ORDER BY id DESC',
      )
      .all(org, name)
  })

  app.post('/api/skills/:org/:name', async (req, reply) => {
    const actor = actorOf(req)
    const { org, name } = req.params as { org: string; name: string }
    if (!actor || !canPublish(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    if (!NAME_RE.test(name)) return reply.code(400).send({ error: 'invalid skill name' })
    const orgExists = db.prepare('SELECT 1 FROM orgs WHERE name = ?').get(org)
    if (!orgExists) return reply.code(404).send({ error: 'org not found' })
    const body = req.body as PublishBody
    if (!body?.version || !VERSION_RE.test(body.version)) {
      return reply.code(400).send({ error: 'semver version required (x.y.z)' })
    }
    if (typeof body.content !== 'string' || body.content.length === 0) {
      return reply.code(400).send({ error: 'content required' })
    }
    try {
      db.prepare(
        `INSERT INTO skills (org, name, version, description, tags, content, resources, published_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        org,
        name,
        body.version,
        body.description ?? '',
        JSON.stringify(body.tags ?? []),
        body.content,
        body.resources ? JSON.stringify(body.resources) : null,
        actor.name,
        Date.now(),
      )
    } catch {
      return reply.code(409).send({ error: `version ${body.version} already published` })
    }
    audit(db, {
      actor: actor.name,
      org,
      action: 'skill.publish',
      subject: `${org}/${name}@${body.version}`,
    })
    return reply.code(201).send({ org, name, version: body.version })
  })

  /* ---------- policy (required skills) ---------- */

  app.get('/api/orgs/:org/required', async (req, reply) => {
    const actor = actorOf(req)
    const { org } = req.params as { org: string }
    if (!actor || !canReadOrg(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    const rows = db
      .prepare('SELECT skill_name AS name FROM required_skills WHERE org = ?')
      .all(org) as { name: string }[]
    return rows.map((r) => r.name)
  })

  app.put('/api/orgs/:org/required', async (req, reply) => {
    const actor = actorOf(req)
    const { org } = req.params as { org: string }
    if (!actor || !canPublish(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    const { skills } = req.body as { skills?: string[] }
    if (!Array.isArray(skills)) return reply.code(400).send({ error: 'skills array required' })
    const del = db.prepare('DELETE FROM required_skills WHERE org = ?')
    const ins = db.prepare('INSERT INTO required_skills (org, skill_name) VALUES (?, ?)')
    db.transaction(() => {
      del.run(org)
      for (const s of skills) ins.run(org, s)
    })()
    audit(db, { actor: actor.name, org, action: 'policy.required.set', subject: skills.join(',') })
    return { org, skills }
  })

  /* ---------- audit ---------- */

  app.get('/api/audit', async (req, reply) => {
    const actor = actorOf(req)
    if (!actor) return reply.code(401).send({ error: 'unauthorized' })
    if (actor.role === 'member') return reply.code(403).send({ error: 'owner or admin only' })
    const { org, limit } = req.query as { org?: string; limit?: string }
    const scope = actor.role === 'admin' ? org : actor.org
    const n = Math.min(Number(limit) || 200, 1000)
    const rows = scope
      ? db
          .prepare('SELECT * FROM audit WHERE org = ? ORDER BY id DESC LIMIT ?')
          .all(scope, n)
      : db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(n)
    return rows
  })

  return app
}
