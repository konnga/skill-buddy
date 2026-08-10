import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { audit, openDb, type Db } from './db.js'
import { authenticate, canPublish, canReadOrg, issueToken, type Actor } from './auth.js'
import { isSafeResourcePath } from './resources.js'
import { compareSemver, isSemver } from './versions.js'
import { sanitizeMcpDefinition } from './mcp.js'

export interface ServerOptions {
  dbPath: string
  adminToken: string
}

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
interface PublishBody {
  version: string
  description?: string
  tags?: string[]
  content: string
  resources?: Record<string, string>
}

interface PublishMcpBody {
  version: string
  description?: string
  definition: unknown
}

interface BundleRef {
  name: string
  version?: string
}

interface PublishBundleBody {
  version: string
  description?: string
  skills?: BundleRef[]
  mcpServers?: BundleRef[]
}

function bundleRefs(value: unknown, label: string): BundleRef[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`${label} entries must be objects`)
    }
    const candidate = entry as Record<string, unknown>
    if (
      Object.keys(candidate).some((key) => !['name', 'version'].includes(key)) ||
      typeof candidate.name !== 'string' ||
      !NAME_RE.test(candidate.name) ||
      (candidate.version !== undefined &&
        (typeof candidate.version !== 'string' || !isSemver(candidate.version)))
    ) {
      throw new Error(`${label} contains an invalid reference`)
    }
    return {
      name: candidate.name,
      ...(candidate.version ? { version: candidate.version as string } : {}),
    }
  })
}

function bundleSkillExists(db: Db, org: string, reference: BundleRef): boolean {
  return Boolean(
    reference.version
      ? db
          .prepare('SELECT 1 FROM skills WHERE org = ? AND name = ? AND version = ?')
          .get(org, reference.name, reference.version)
      : db.prepare('SELECT 1 FROM skills WHERE org = ? AND name = ?').get(org, reference.name),
  )
}

function bundleMcpServerExists(db: Db, org: string, reference: BundleRef): boolean {
  const base = `SELECT 1
    FROM mcp_servers AS server
    JOIN mcp_server_versions AS version ON version.server_id = server.id
    WHERE server.org = ? AND server.name = ?`
  return Boolean(
    reference.version
      ? db.prepare(`${base} AND version.version = ?`).get(org, reference.name, reference.version)
      : db.prepare(base).get(org, reference.name),
  )
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
        `SELECT id, org, name, description, tags, version, created_at AS createdAt
         FROM skills
         ORDER BY org, name`,
      )
      .all() as {
        id: number
        org: string
        name: string
        description: string
        tags: string
        version: string
        createdAt: number
      }[]
    const latestBySkill = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (!canReadOrg(actor, row.org)) continue
      const key = `${row.org}/${row.name}`
      const current = latestBySkill.get(key)
      if (!current || compareSemver(row.version, current.version) > 0) {
        latestBySkill.set(key, row)
      }
    }
    const visible = [...latestBySkill.values()]
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
    type SkillRow = {
      id: number
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
    const row = version
      ? (db
          .prepare('SELECT * FROM skills WHERE org = ? AND name = ? AND version = ?')
          .get(org, name, version) as SkillRow | undefined)
      : (db.prepare('SELECT * FROM skills WHERE org = ? AND name = ?').all(org, name) as SkillRow[])
          .sort((left, right) => compareSemver(right.version, left.version))[0]
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
    const versions = db
      .prepare(
        'SELECT version, published_by AS publishedBy, created_at AS createdAt FROM skills WHERE org = ? AND name = ? ORDER BY id DESC',
      )
      .all(org, name) as { version: string; publishedBy: string; createdAt: number }[]
    return versions.sort((left, right) => compareSemver(right.version, left.version))
  })

  app.post('/api/skills/:org/:name', async (req, reply) => {
    const actor = actorOf(req)
    const { org, name } = req.params as { org: string; name: string }
    if (!actor || !canPublish(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    if (!NAME_RE.test(name)) return reply.code(400).send({ error: 'invalid skill name' })
    const orgExists = db.prepare('SELECT 1 FROM orgs WHERE name = ?').get(org)
    if (!orgExists) return reply.code(404).send({ error: 'org not found' })
    const body = req.body as PublishBody
    if (!body?.version || !isSemver(body.version)) {
      return reply.code(400).send({ error: 'semver version required (x.y.z)' })
    }
    if (typeof body.content !== 'string' || body.content.length === 0) {
      return reply.code(400).send({ error: 'content required' })
    }
    const invalidResources =
      body.resources !== undefined &&
      (typeof body.resources !== 'object' ||
        body.resources === null ||
        Array.isArray(body.resources) ||
        Object.entries(body.resources).some(
          ([resourcePath, content]) =>
            !isSafeResourcePath(resourcePath) || typeof content !== 'string',
        ))
    if (invalidResources) {
      return reply.code(400).send({ error: 'invalid resource path' })
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

  /* ---------- MCP servers ---------- */

  app.get('/api/mcp-servers', async (req, reply) => {
    const actor = actorOf(req)
    if (!actor) return reply.code(401).send({ error: 'unauthorized' })
    const { q } = req.query as { q?: string }
    const rows = db
      .prepare(
        `SELECT s.org, s.name, v.version, v.description, v.definition,
                v.required_secrets AS requiredSecrets, v.created_at AS createdAt
         FROM mcp_servers s
         JOIN mcp_server_versions v ON v.server_id = s.id
         ORDER BY s.org, s.name`,
      )
      .all() as {
        org: string
        name: string
        version: string
        description: string
        definition: string
        requiredSecrets: string
        createdAt: number
      }[]
    const latest = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (!canReadOrg(actor, row.org)) continue
      const key = `${row.org}/${row.name}`
      const current = latest.get(key)
      if (!current || compareSemver(row.version, current.version) > 0) latest.set(key, row)
    }
    const needle = q?.trim().toLowerCase()
    return [...latest.values()]
      .filter(
        (row) =>
          !needle ||
          row.name.includes(needle) ||
          row.description.toLowerCase().includes(needle),
      )
      .map((row) => ({
        org: row.org,
        name: row.name,
        version: row.version,
        description: row.description,
        transport: (
          JSON.parse(row.definition) as { transport: { kind: string } }
        ).transport.kind,
        requiredSecrets: JSON.parse(row.requiredSecrets) as string[],
        createdAt: row.createdAt,
      }))
  })

  app.get('/api/mcp-servers/:org/:name', async (req, reply) => {
    const actor = actorOf(req)
    const { org, name } = req.params as { org: string; name: string }
    if (!actor || !canReadOrg(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    const { version } = req.query as { version?: string }
    type McpRow = {
      org: string
      name: string
      version: string
      description: string
      definition: string
      required_secrets: string
      published_by: string
      created_at: number
    }
    const rows = db
      .prepare(
        `SELECT s.org, s.name, v.version, v.description, v.definition, v.required_secrets,
                v.published_by, v.created_at
         FROM mcp_servers s JOIN mcp_server_versions v ON v.server_id = s.id
         WHERE s.org = ? AND s.name = ?`,
      )
      .all(org, name) as McpRow[]
    const row = version
      ? rows.find((candidate) => candidate.version === version)
      : rows.sort((left, right) => compareSemver(right.version, left.version))[0]
    if (!row) return reply.code(404).send({ error: 'not found' })
    audit(db, {
      actor: actor.name,
      org,
      action: 'mcp.download',
      subject: `${org}/${name}@${row.version}`,
    })
    return {
      org: row.org,
      name: row.name,
      version: row.version,
      description: row.description,
      definition: JSON.parse(row.definition),
      requiredSecrets: JSON.parse(row.required_secrets),
      publishedBy: row.published_by,
      createdAt: row.created_at,
    }
  })

  app.get('/api/mcp-servers/:org/:name/versions', async (req, reply) => {
    const actor = actorOf(req)
    const { org, name } = req.params as { org: string; name: string }
    if (!actor || !canReadOrg(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    const rows = db
      .prepare(
        `SELECT v.version, v.published_by AS publishedBy, v.created_at AS createdAt
         FROM mcp_servers s JOIN mcp_server_versions v ON v.server_id = s.id
         WHERE s.org = ? AND s.name = ?`,
      )
      .all(org, name) as { version: string; publishedBy: string; createdAt: number }[]
    return rows.sort((left, right) => compareSemver(right.version, left.version))
  })

  app.post('/api/mcp-servers/:org/:name', async (req, reply) => {
    const actor = actorOf(req)
    const { org, name } = req.params as { org: string; name: string }
    if (!actor || !canPublish(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    if (!NAME_RE.test(name)) return reply.code(400).send({ error: 'invalid MCP server name' })
    if (!db.prepare('SELECT 1 FROM orgs WHERE name = ?').get(org)) {
      return reply.code(404).send({ error: 'org not found' })
    }
    const body = req.body as PublishMcpBody
    if (!body?.version || !isSemver(body.version)) {
      return reply.code(400).send({ error: 'semver version required (x.y.z)' })
    }
    let definition
    try {
      definition = sanitizeMcpDefinition(body.definition, name)
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) })
    }
    const createdAt = Date.now()
    try {
      db.transaction(() => {
        db.prepare(
          'INSERT OR IGNORE INTO mcp_servers (org, name, created_at) VALUES (?, ?, ?)',
        ).run(org, name, createdAt)
        const server = db
          .prepare('SELECT id FROM mcp_servers WHERE org = ? AND name = ?')
          .get(org, name) as { id: number }
        db.prepare(
          `INSERT INTO mcp_server_versions
           (server_id, version, description, definition, required_secrets, published_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          server.id,
          body.version,
          body.description ?? definition.description ?? '',
          JSON.stringify(definition),
          JSON.stringify(definition.requiredSecrets),
          actor.name,
          createdAt,
        )
      })()
    } catch {
      return reply.code(409).send({ error: `version ${body.version} already published` })
    }
    audit(db, {
      actor: actor.name,
      org,
      action: 'mcp.publish',
      subject: `${org}/${name}@${body.version}`,
    })
    return reply.code(201).send({ org, name, version: body.version })
  })

  /* ---------- bundles ---------- */

  app.get('/api/bundles', async (req, reply) => {
    const actor = actorOf(req)
    if (!actor) return reply.code(401).send({ error: 'unauthorized' })
    const rows = db.prepare('SELECT * FROM bundles ORDER BY org, name').all() as {
      org: string
      name: string
      version: string
      description: string
      skills: string
      mcp_servers: string
      published_by: string
      created_at: number
    }[]
    const latest = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (!canReadOrg(actor, row.org)) continue
      const key = `${row.org}/${row.name}`
      const current = latest.get(key)
      if (!current || compareSemver(row.version, current.version) > 0) latest.set(key, row)
    }
    return [...latest.values()].map((row) => ({
      org: row.org,
      name: row.name,
      version: row.version,
      description: row.description,
      skills: JSON.parse(row.skills),
      mcpServers: JSON.parse(row.mcp_servers),
      publishedBy: row.published_by,
      createdAt: row.created_at,
    }))
  })

  app.get('/api/bundles/:org/:name', async (req, reply) => {
    const actor = actorOf(req)
    const { org, name } = req.params as { org: string; name: string }
    if (!actor || !canReadOrg(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    const { version } = req.query as { version?: string }
    const rows = db.prepare('SELECT * FROM bundles WHERE org = ? AND name = ?').all(org, name) as {
      org: string
      name: string
      version: string
      description: string
      skills: string
      mcp_servers: string
      published_by: string
      created_at: number
    }[]
    const row = version
      ? rows.find((candidate) => candidate.version === version)
      : rows.sort((left, right) => compareSemver(right.version, left.version))[0]
    if (!row) return reply.code(404).send({ error: 'not found' })
    return {
      org: row.org,
      name: row.name,
      version: row.version,
      description: row.description,
      skills: JSON.parse(row.skills),
      mcpServers: JSON.parse(row.mcp_servers),
      publishedBy: row.published_by,
      createdAt: row.created_at,
    }
  })

  app.post('/api/bundles/:org/:name', async (req, reply) => {
    const actor = actorOf(req)
    const { org, name } = req.params as { org: string; name: string }
    if (!actor || !canPublish(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    if (!NAME_RE.test(name)) return reply.code(400).send({ error: 'invalid bundle name' })
    if (!db.prepare('SELECT 1 FROM orgs WHERE name = ?').get(org)) {
      return reply.code(404).send({ error: 'org not found' })
    }
    const body = req.body as PublishBundleBody
    if (!body?.version || !isSemver(body.version)) {
      return reply.code(400).send({ error: 'semver version required (x.y.z)' })
    }
    let skills: BundleRef[]
    let mcpServers: BundleRef[]
    try {
      skills = bundleRefs(body.skills, 'skills')
      mcpServers = bundleRefs(body.mcpServers, 'mcpServers')
      if (skills.length + mcpServers.length === 0) throw new Error('bundle cannot be empty')
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) })
    }
    const missingSkill = skills.find((reference) => !bundleSkillExists(db, org, reference))
    if (missingSkill) {
      return reply.code(400).send({
        error: `skill reference not found: ${missingSkill.name}${missingSkill.version ? `@${missingSkill.version}` : ''}`,
      })
    }
    const missingMcpServer = mcpServers.find(
      (reference) => !bundleMcpServerExists(db, org, reference),
    )
    if (missingMcpServer) {
      return reply.code(400).send({
        error: `MCP server reference not found: ${missingMcpServer.name}${missingMcpServer.version ? `@${missingMcpServer.version}` : ''}`,
      })
    }
    try {
      db.prepare(
        `INSERT INTO bundles
         (org, name, version, description, skills, mcp_servers, published_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        org,
        name,
        body.version,
        body.description ?? '',
        JSON.stringify(skills),
        JSON.stringify(mcpServers),
        actor.name,
        Date.now(),
      )
    } catch {
      return reply.code(409).send({ error: `version ${body.version} already published` })
    }
    audit(db, {
      actor: actor.name,
      org,
      action: 'bundle.publish',
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

  app.get('/api/orgs/:org/required-mcp-servers', async (req, reply) => {
    const actor = actorOf(req)
    const { org } = req.params as { org: string }
    if (!actor || !canReadOrg(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    const rows = db
      .prepare('SELECT mcp_server_name AS name FROM required_mcp_servers WHERE org = ?')
      .all(org) as { name: string }[]
    return rows.map((row) => row.name)
  })

  app.put('/api/orgs/:org/required-mcp-servers', async (req, reply) => {
    const actor = actorOf(req)
    const { org } = req.params as { org: string }
    if (!actor || !canPublish(actor, org)) return reply.code(403).send({ error: 'forbidden' })
    const { mcpServers } = req.body as { mcpServers?: string[] }
    if (
      !Array.isArray(mcpServers) ||
      mcpServers.some((name) => typeof name !== 'string' || !NAME_RE.test(name))
    ) {
      return reply.code(400).send({ error: 'mcpServers must contain valid names' })
    }
    const del = db.prepare('DELETE FROM required_mcp_servers WHERE org = ?')
    const insert = db.prepare(
      'INSERT INTO required_mcp_servers (org, mcp_server_name) VALUES (?, ?)',
    )
    db.transaction(() => {
      del.run(org)
      for (const name of mcpServers) insert.run(org, name)
    })()
    audit(db, {
      actor: actor.name,
      org,
      action: 'policy.required-mcp.set',
      subject: mcpServers.join(','),
    })
    return { org, mcpServers }
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
