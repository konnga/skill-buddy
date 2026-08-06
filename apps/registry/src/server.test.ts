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

  it('versions are immutable; latest wins; history listed', async () => {
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
    expect((await publish('1.1.0', 'v2')).statusCode).toBe(201)

    const latest = await app.inject({
      method: 'GET',
      url: '/api/skills/acme/s',
      headers: auth(owner),
    })
    expect(latest.json().version).toBe('1.1.0')

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
    expect(versions.json().map((v: { version: string }) => v.version)).toEqual(['1.1.0', '1.0.0'])
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
