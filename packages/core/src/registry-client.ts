import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Skill } from './types.js'

export interface RegistrySkillSummary {
  org: string
  name: string
  description: string
  tags: string[]
  version: string
  createdAt: number
}

export interface RegistrySkill extends RegistrySkillSummary {
  content: string
  /** relative path -> file content (utf8) */
  resources?: Record<string, string>
  publishedBy: string
}

export class RegistryError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Typed client for the skills registry HTTP API. Resources travel
 * inline as utf8 strings (registry stores them as JSON); toSkill()
 * materializes them to temp files so adapters can copy them.
 */
export class RegistryClient {
  constructor(
    readonly baseUrl: string,
    readonly token: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        ...init?.headers,
      },
    })
    if (!res.ok) {
      let message = res.statusText
      try {
        message = ((await res.json()) as { error?: string }).error ?? message
      } catch {
        /* keep statusText */
      }
      throw new RegistryError(res.status, message)
    }
    return (await res.json()) as T
  }

  health(): Promise<{ ok: boolean }> {
    return this.request('/healthz')
  }

  listOrgs(): Promise<{ name: string; displayName: string }[]> {
    return this.request('/api/orgs')
  }

  search(q?: string): Promise<RegistrySkillSummary[]> {
    const query = q ? `?q=${encodeURIComponent(q)}` : ''
    return this.request(`/api/skills${query}`)
  }

  getSkill(org: string, name: string, version?: string): Promise<RegistrySkill> {
    const query = version ? `?version=${encodeURIComponent(version)}` : ''
    return this.request(`/api/skills/${org}/${name}${query}`)
  }

  listVersions(
    org: string,
    name: string,
  ): Promise<{ version: string; publishedBy: string; createdAt: number }[]> {
    return this.request(`/api/skills/${org}/${name}/versions`)
  }

  async publish(org: string, skill: Skill, version: string): Promise<void> {
    const resources: Record<string, string> = {}
    for (const [rel, src] of Object.entries(skill.resources ?? {})) {
      resources[rel] = await fs.readFile(src, 'utf8')
    }
    await this.request(`/api/skills/${org}/${skill.name}`, {
      method: 'POST',
      body: JSON.stringify({
        version,
        description: skill.description,
        tags: skill.tags ?? [],
        content: skill.content,
        resources: Object.keys(resources).length > 0 ? resources : undefined,
      }),
    })
  }

  requiredSkills(org: string): Promise<string[]> {
    return this.request(`/api/orgs/${org}/required`)
  }

  setRequiredSkills(org: string, skills: string[]): Promise<void> {
    return this.request(`/api/orgs/${org}/required`, {
      method: 'PUT',
      body: JSON.stringify({ skills }),
    })
  }
}

/**
 * Convert a registry skill to an installable canonical Skill:
 * inline resources are written to a temp dir and referenced by path.
 */
export async function toSkill(remote: RegistrySkill): Promise<Skill> {
  let resources: Record<string, string> | undefined
  if (remote.resources && Object.keys(remote.resources).length > 0) {
    const root = await fs.mkdtemp(join(tmpdir(), 'skm-registry-'))
    resources = {}
    for (const [rel, content] of Object.entries(remote.resources)) {
      const abs = join(root, rel)
      await fs.mkdir(dirname(abs), { recursive: true })
      await fs.writeFile(abs, content, 'utf8')
      resources[rel] = abs
    }
  }
  return {
    name: remote.name,
    description: remote.description,
    version: remote.version,
    tags: remote.tags,
    content: remote.content,
    resources,
  }
}
