import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildServer } from './server.js'

const ADMIN = 'admin-secret'
let app: ReturnType<typeof buildServer>

const auth = (token: string) => ({ authorization: `Bearer ${token}` })

async function setupOrgWithTokens(): Promise<{ owner: string; member: string }> {
  await app.inject({
    method: 'POST',
    url: '/api/orgs',
    headers: auth(ADMIN),
    payload: { name: 'acme' },
  })
  const ownerRes = await app.inject({
    method: 'POST',
    url: '/api/orgs/acme/tokens',
    headers: auth(ADMIN),
    payload: { name: 'lead', role: 'owner' },
  })
  const memberRes = await app.inject({
    method: 'POST',
    url: '/api/orgs/acme/tokens',
    headers: auth(ADMIN),
    payload: { name: 'dev', role: 'member' },
  })
  return { owner: ownerRes.json().token, member: memberRes.json().token }
}

beforeEach(() => {
  app = buildServer({ dbPath: ':memory:', adminToken: ADMIN })
})

afterEach(async () => {
  await app.close()
})

describe('registry server', () => {
  it('healthz is public', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' })
    expect(res.statusCode).toBe(200)
  })

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/skills' })
    expect(res.statusCode).toBe(401)
  })

  it('only admin can create orgs', async () => {
    const { member } = await setupOrgWithTokens()
    const res = await app.inject({
      method: 'POST',
      url: '/api/orgs',
      headers: auth(member),
      payload: { name: 'other' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('publish requires owner; member can read', async () => {
    const { owner, member } = await setupOrgWithTokens()
    const payload = { version: '1.0.0', description: 'd', tags: ['x'], content: '# Hi' }

    const denied = await app.inject({
      method: 'POST',
      url: '/api/skills/acme/my-skill',
      headers: auth(member),
      payload,
    })
    expect(denied.statusCode).toBe(403)

    const ok = await app.inject({
      method: 'POST',
      url: '/api/skills/acme/my-skill',
      headers: auth(owner),
      payload,
    })
    expect(ok.statusCode).toBe(201)

    const got = await app.inject({
      method: 'GET',
      url: '/api/skills/acme/my-skill',
      headers: auth(member),
    })
    expect(got.statusCode).toBe(200)
    expect(got.json().content).toBe('# Hi')
    expect(got.json().version).toBe('1.0.0')
  })

  it('versions are immutable; semantic latest wins even when published out of order', async () => {
    const { owner } = await setupOrgWithTokens()
    const publish = (version: string, content: string) =>
      app.inject({
        method: 'POST',
        url: '/api/skills/acme/s',
        headers: auth(owner),
        payload: { version, content },
      })
    expect((await publish('1.0.0', 'v1')).statusCode).toBe(201)
    expect((await publish('1.0.0', 'dup')).statusCode).toBe(409)
    expect((await publish('10.0.0', 'v10')).statusCode).toBe(201)
    expect((await publish('2.0.0', 'v2')).statusCode).toBe(201)

    const latest = await app.inject({
      method: 'GET',
      url: '/api/skills/acme/s',
      headers: auth(owner),
    })
    expect(latest.json().version).toBe('10.0.0')

    const pinned = await app.inject({
      method: 'GET',
      url: '/api/skills/acme/s?version=1.0.0',
      headers: auth(owner),
    })
    expect(pinned.json().content).toBe('v1')

    const versions = await app.inject({
      method: 'GET',
      url: '/api/skills/acme/s/versions',
      headers: auth(owner),
    })
    expect(versions.json().map((v: { version: string }) => v.version)).toEqual([
      '10.0.0',
      '2.0.0',
      '1.0.0',
    ])

    const search = await app.inject({ method: 'GET', url: '/api/skills', headers: auth(owner) })
    expect(search.json()[0].version).toBe('10.0.0')
  })

  it('org isolation: tokens cannot read other orgs', async () => {
    const { owner } = await setupOrgWithTokens()
    await app.inject({
      method: 'POST',
      url: '/api/orgs',
      headers: auth(ADMIN),
      payload: { name: 'rival' },
    })
    const rivalToken = (
      await app.inject({
        method: 'POST',
        url: '/api/orgs/rival/tokens',
        headers: auth(ADMIN),
        payload: { name: 'spy', role: 'owner' },
      })
    ).json().token
    await app.inject({
      method: 'POST',
      url: '/api/skills/acme/secret',
      headers: auth(owner),
      payload: { version: '1.0.0', content: 'top secret' },
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/skills/acme/secret',
      headers: auth(rivalToken),
    })
    expect(res.statusCode).toBe(403)

    const list = await app.inject({ method: 'GET', url: '/api/skills', headers: auth(rivalToken) })
    expect(list.json()).toHaveLength(0)
  })

  it('search filters by name/description/tags', async () => {
    const { owner } = await setupOrgWithTokens()
    await app.inject({
      method: 'POST',
      url: '/api/skills/acme/commit-style',
      headers: auth(owner),
      payload: { version: '1.0.0', content: 'x', description: 'git commits', tags: ['git'] },
    })
    await app.inject({
      method: 'POST',
      url: '/api/skills/acme/deploy',
      headers: auth(owner),
      payload: { version: '1.0.0', content: 'x', description: 'ship it' },
    })
    const res = await app.inject({ method: 'GET', url: '/api/skills?q=git', headers: auth(owner) })
    expect(res.json().map((s: { name: string }) => s.name)).toEqual(['commit-style'])
  })

  it('rejects resource paths that can escape or replace the Skill package', async () => {
    const { owner } = await setupOrgWithTokens()
    for (const resourcePath of ['../secret.txt', '/tmp/secret.txt', 'SKILL.md']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/skills/acme/unsafe-resources',
        headers: auth(owner),
        payload: {
          version: '1.0.0',
          content: 'x',
          resources: { [resourcePath]: 'unsafe' },
        },
      })
      expect(response.statusCode).toBe(400)
    }
  })

  it('rejects versions with leading zeroes', async () => {
    const { owner } = await setupOrgWithTokens()
    const response = await app.inject({
      method: 'POST',
      url: '/api/skills/acme/invalid-version',
      headers: auth(owner),
      payload: { version: '01.0.0', content: 'x' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('required-skills policy round-trips; member can read but not set', async () => {
    const { owner, member } = await setupOrgWithTokens()
    const denied = await app.inject({
      method: 'PUT',
      url: '/api/orgs/acme/required',
      headers: auth(member),
      payload: { skills: ['a'] },
    })
    expect(denied.statusCode).toBe(403)

    await app.inject({
      method: 'PUT',
      url: '/api/orgs/acme/required',
      headers: auth(owner),
      payload: { skills: ['security-rules', 'commit-style'] },
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/orgs/acme/required',
      headers: auth(member),
    })
    expect([...res.json()].sort()).toEqual(['commit-style', 'security-rules'])
  })

  it('publishes immutable MCP versions and returns the semantic latest version', async () => {
    const { owner, member } = await setupOrgWithTokens()
    const definition = {
      name: 'github',
      transport: {
        kind: 'stdio',
        command: 'docker',
        args: ['run', 'github-mcp'],
        env: { GITHUB_TOKEN: { kind: 'env', name: 'GITHUB_TOKEN' } },
      },
      requiredSecrets: [],
    }
    const publish = (version: string) =>
      app.inject({
        method: 'POST',
        url: '/api/mcp-servers/acme/github',
        headers: auth(owner),
        payload: { version, description: 'GitHub tools', definition },
      })

    expect((await publish('1.0.0')).statusCode).toBe(201)
    expect((await publish('1.0.0')).statusCode).toBe(409)
    expect((await publish('10.0.0')).statusCode).toBe(201)
    expect((await publish('2.0.0')).statusCode).toBe(201)

    const latest = await app.inject({
      method: 'GET',
      url: '/api/mcp-servers/acme/github',
      headers: auth(member),
    })
    expect(latest.json()).toMatchObject({
      version: '10.0.0',
      requiredSecrets: ['GITHUB_TOKEN'],
      definition: {
        transport: { env: { GITHUB_TOKEN: { kind: 'env', name: 'GITHUB_TOKEN' } } },
      },
    })

    const versions = await app.inject({
      method: 'GET',
      url: '/api/mcp-servers/acme/github/versions',
      headers: auth(member),
    })
    expect(versions.json().map((item: { version: string }) => item.version)).toEqual([
      '10.0.0',
      '2.0.0',
      '1.0.0',
    ])
  })

  it('rejects every MCP payload shape that could persist a secret', async () => {
    const { owner } = await setupOrgWithTokens()
    const publish = (definition: unknown) =>
      app.inject({
        method: 'POST',
        url: '/api/mcp-servers/acme/unsafe',
        headers: auth(owner),
        payload: { version: '1.0.0', definition },
      })
    const candidates = [
      {
        name: 'unsafe',
        transport: {
          kind: 'stdio',
          command: 'node',
          args: [],
          env: { TOKEN: { kind: 'literal', value: 'plain-secret' } },
        },
        requiredSecrets: [],
      },
      {
        name: 'unsafe',
        transport: { kind: 'stdio', command: 'node', args: ['--token=plain-secret'], env: {} },
        requiredSecrets: [],
      },
      {
        name: 'unsafe',
        transport: {
          kind: 'streamable-http',
          url: 'https://mcp.example.com?token=plain-secret',
          headers: {},
        },
        requiredSecrets: [],
      },
      {
        name: 'unsafe',
        transport: { kind: 'stdio', command: 'node', args: [], env: {} },
        requiredSecrets: [],
        metadata: { token: 'plain-secret' },
      },
    ]

    for (const definition of candidates) {
      expect((await publish(definition)).statusCode).toBe(400)
    }
    expect(
      app.db.prepare('SELECT COUNT(*) AS count FROM mcp_server_versions').get(),
    ).toEqual({ count: 0 })
  })

  it('normalizes secret reference state and never stores local authentication state', async () => {
    const { owner } = await setupOrgWithTokens()
    const response = await app.inject({
      method: 'POST',
      url: '/api/mcp-servers/acme/database',
      headers: auth(owner),
      payload: {
        version: '1.0.0',
        definition: {
          name: 'database',
          transport: {
            kind: 'stdio',
            command: 'db-mcp',
            args: [],
            env: { DATABASE_URL: { kind: 'secret', key: 'DATABASE_URL', state: 'configured' } },
          },
          requiredSecrets: [],
        },
      },
    })
    expect(response.statusCode).toBe(201)
    const stored = app.db
      .prepare('SELECT definition FROM mcp_server_versions')
      .get() as { definition: string }
    expect(stored.definition).not.toContain('configured')
    expect(JSON.parse(stored.definition)).toMatchObject({
      transport: {
        env: { DATABASE_URL: { kind: 'secret', key: 'DATABASE_URL', state: 'unknown' } },
      },
    })
  })

  it('required MCP policy round-trips and remains owner-controlled', async () => {
    const { owner, member } = await setupOrgWithTokens()
    const denied = await app.inject({
      method: 'PUT',
      url: '/api/orgs/acme/required-mcp-servers',
      headers: auth(member),
      payload: { mcpServers: ['github'] },
    })
    expect(denied.statusCode).toBe(403)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/orgs/acme/required-mcp-servers',
          headers: auth(owner),
          payload: { mcpServers: ['github', 'database'] },
        })
      ).statusCode,
    ).toBe(200)
    const response = await app.inject({
      method: 'GET',
      url: '/api/orgs/acme/required-mcp-servers',
      headers: auth(member),
    })
    expect([...response.json()].sort()).toEqual(['database', 'github'])
  })

  it('bundle versions can reference Skills and MCP servers together', async () => {
    const { owner, member } = await setupOrgWithTokens()
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/skills/acme/commit-style',
          headers: auth(owner),
          payload: { version: '1.0.0', content: '# Commit style' },
        })
      ).statusCode,
    ).toBe(201)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/mcp-servers/acme/github',
          headers: auth(owner),
          payload: {
            version: '1.0.0',
            definition: {
              name: 'github',
              transport: {
                kind: 'stdio',
                command: 'github-mcp-server',
                args: [],
                env: { GITHUB_TOKEN: { kind: 'env', name: 'GITHUB_TOKEN' } },
              },
              requiredSecrets: ['GITHUB_TOKEN'],
            },
          },
        })
      ).statusCode,
    ).toBe(201)
    const response = await app.inject({
      method: 'POST',
      url: '/api/bundles/acme/developer-kit',
      headers: auth(owner),
      payload: {
        version: '1.0.0',
        description: 'Team developer setup',
        skills: [{ name: 'commit-style', version: '1.0.0' }],
        mcpServers: [{ name: 'github' }],
      },
    })
    expect(response.statusCode).toBe(201)

    const bundle = await app.inject({
      method: 'GET',
      url: '/api/bundles/acme/developer-kit',
      headers: auth(member),
    })
    expect(bundle.json()).toMatchObject({
      skills: [{ name: 'commit-style', version: '1.0.0' }],
      mcpServers: [{ name: 'github' }],
    })
  })

  it('rejects bundles that reference missing resources or versions', async () => {
    const { owner } = await setupOrgWithTokens()
    const missingSkill = await app.inject({
      method: 'POST',
      url: '/api/bundles/acme/missing-skill',
      headers: auth(owner),
      payload: { version: '1.0.0', skills: [{ name: 'unknown' }] },
    })
    expect(missingSkill.statusCode).toBe(400)
    expect(missingSkill.json().error).toContain('skill reference not found')

    await app.inject({
      method: 'POST',
      url: '/api/mcp-servers/acme/github',
      headers: auth(owner),
      payload: {
        version: '1.0.0',
        definition: {
          name: 'github',
          transport: { kind: 'stdio', command: 'github-mcp-server', args: [], env: {} },
          requiredSecrets: [],
        },
      },
    })
    const missingVersion = await app.inject({
      method: 'POST',
      url: '/api/bundles/acme/missing-version',
      headers: auth(owner),
      payload: { version: '1.0.0', mcpServers: [{ name: 'github', version: '2.0.0' }] },
    })
    expect(missingVersion.statusCode).toBe(400)
    expect(missingVersion.json().error).toContain('github@2.0.0')
  })

  it('audit records publish/download; member cannot read audit', async () => {
    const { owner, member } = await setupOrgWithTokens()
    await app.inject({
      method: 'POST',
      url: '/api/skills/acme/s',
      headers: auth(owner),
      payload: { version: '1.0.0', content: 'x' },
    })
    await app.inject({ method: 'GET', url: '/api/skills/acme/s', headers: auth(member) })

    const denied = await app.inject({ method: 'GET', url: '/api/audit', headers: auth(member) })
    expect(denied.statusCode).toBe(403)

    const res = await app.inject({ method: 'GET', url: '/api/audit', headers: auth(owner) })
    const actions = res.json().map((a: { action: string }) => a.action)
    expect(actions).toContain('skill.publish')
    expect(actions).toContain('skill.download')
  })
})
