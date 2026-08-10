import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { isIP } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'
import { findSkills } from '@skillbuddy/core'
import { unzipSync } from 'fflate'
import type { PathAccessPolicy } from '../path-policy.js'

/** 阻止远程清单接口访问本机、内网和非 HTTPS 地址。 */
function assertPublicHttpsUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error('remote manifest must use HTTPS')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local')) {
    throw new Error('remote manifest cannot use a local host')
  }
  if (isIP(host)) {
    const blocked =
      host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80:') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    if (blocked) throw new Error('remote manifest cannot use a private address')
  }
  return url
}

/** 注册公共市场、官方套装与下载相关 IPC。 */
export function registerMarketIpc(pathPolicy: PathAccessPolicy): void {
  ipcMain.handle('bundles:manifest', async (_event, value: string) => {
    const url = assertPublicHttpsUrl(value)
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`bundles manifest ${response.status}`)
    return (await response.json()) as unknown
  })

  ipcMain.handle('market:search', async (_event, query: string) => {
    const url = `https://skills.sh/api/search?q=${encodeURIComponent(query)}`
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`skills.sh ${response.status}`)
    const data = (await response.json()) as {
      skills?: { id: string; skillId: string; name: string; installs: number; source: string }[]
    }
    return (data.skills ?? []).sort((a, b) => b.installs - a.installs)
  })

  ipcMain.handle('market:github-search', async (_event, query: string, page = 1) => {
    const term = query.trim()
    if (term.length < 2) return { items: [], total: 0 }

    const url = new URL('https://api.github.com/search/repositories')
    url.searchParams.set('q', `${term} skill in:name,description,readme`)
    url.searchParams.set('page', String(Math.max(1, page)))
    url.searchParams.set('per_page', '24')
    const response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'SkillBuddy',
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      if (response.status === 403) throw new Error('GitHub search rate limit exceeded')
      throw new Error(`GitHub search ${response.status}`)
    }
    const data = (await response.json()) as {
      total_count?: number
      items?: {
        full_name: string
        name: string
        description: string | null
        stargazers_count: number
        updated_at: string | null
        default_branch: string
        owner?: { avatar_url?: string }
        html_url: string
      }[]
    }
    return {
      items: (data.items ?? []).map((repo) => ({
        fullName: repo.full_name,
        name: repo.name,
        description: repo.description ?? '',
        stars: repo.stargazers_count,
        updatedAt: repo.updated_at,
        defaultBranch: repo.default_branch,
        avatarUrl: repo.owner?.avatar_url ?? null,
        htmlUrl: repo.html_url,
      })),
      total: Math.min(data.total_count ?? 0, 1000),
    }
  })

  const starsCache = new Map<string, number>()
  ipcMain.handle('market:github-stars', async (_event, repositories: string[]) => {
    const valid = repositories.filter((repo) => /^[\w.-]+\/[\w.-]+$/.test(repo))
    const missing = [...new Set(valid)].filter((repo) => !starsCache.has(repo)).slice(0, 30)
    await Promise.allSettled(
      missing.map(async (repo) => {
        const response = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: { accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(8_000),
        })
        if (!response.ok) return
        const data = (await response.json()) as { stargazers_count?: number }
        if (typeof data.stargazers_count === 'number') {
          starsCache.set(repo, data.stargazers_count)
        }
      }),
    )
    const result: Record<string, number> = {}
    for (const repo of valid) {
      const stars = starsCache.get(repo)
      if (stars !== undefined) result[repo] = stars
    }
    return result
  })

  ipcMain.handle('market:skillhub-search', async (_event, query: string, page = 1) => {
    const url = new URL('https://api.skillhub.cn/api/skills')
    url.searchParams.set('page', String(page))
    url.searchParams.set('pageSize', '24')
    url.searchParams.set('sortBy', 'score')
    url.searchParams.set('order', 'desc')
    if (query) url.searchParams.set('keyword', query)
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`skillhub ${response.status}`)
    const data = (await response.json()) as {
      data?: {
        skills?: {
          slug: string
          name: string
          displayName?: string
          description?: string
          description_zh?: string
          downloads?: number
          installs?: number
          stars?: number
          namespace?: { handle: string; canonicalName?: string }
          upstream_url?: string | null
          iconUrl?: string | null
          version?: string | null
          updated_at?: number | null
          verified?: boolean
          labels?: { requires_api_key?: string } | null
          subCategories?: { key: string; name: string }[] | null
        }[]
        total?: number
      }
    }
    const items = (data.data?.skills ?? []).map((skill) => ({
      slug: skill.slug,
      namespace: skill.namespace?.handle ?? '',
      canonicalName: skill.namespace?.canonicalName ?? skill.slug,
      name: skill.displayName || skill.name,
      description: skill.description_zh || skill.description || '',
      installs: skill.downloads ?? skill.installs ?? 0,
      stars: skill.stars ?? 0,
      upstreamUrl: skill.upstream_url ?? null,
      iconUrl: skill.iconUrl ?? null,
      version: skill.version ?? null,
      updatedAt: skill.updated_at ?? null,
      verified: skill.verified ?? false,
      requiresApiKey: skill.labels?.requires_api_key === 'true',
      tags: (skill.subCategories ?? []).map((category) => category.name),
    }))
    return { items, total: data.data?.total ?? items.length }
  })

  ipcMain.handle('market:skillhub-versions', async (_event, slug: string, namespace: string) => {
    const url = new URL(
      `https://api.skillhub.cn/api/v1/skills/${encodeURIComponent(slug)}/versions`,
    )
    if (namespace) url.searchParams.set('namespace', namespace)
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`skillhub versions ${response.status}`)
    const data = (await response.json()) as {
      versions?: {
        version: string
        changelog?: string
        createdAt?: number
        securityReports?: Record<
          string,
          { status?: string; statusText?: string; reportUrl?: string }
        >
      }[]
    }
    return (data.versions ?? []).map((version) => ({
      version: version.version,
      changelog: version.changelog ?? '',
      createdAt: version.createdAt ?? null,
      security: Object.entries(version.securityReports ?? {}).map(([name, report]) => ({
        name,
        status: report.status ?? '',
        statusText: report.statusText ?? '',
        reportUrl: report.reportUrl ?? '',
      })),
    }))
  })

  ipcMain.handle('market:skillhub-fetch', async (_event, slug: string, namespace: string) => {
    const url = new URL('https://api.skillhub.cn/api/v1/download')
    url.searchParams.set('slug', slug)
    if (namespace) url.searchParams.set('namespace', namespace)
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`skillhub download ${response.status}`)
    const root = await fs.mkdtemp(join(tmpdir(), 'skm-import-'))
    pathPolicy.grantTemporaryRoot(root, true)
    try {
      const unpacked = join(root, 'unpacked')
      await fs.mkdir(unpacked, { recursive: true })
      const files = unzipSync(new Uint8Array(await response.arrayBuffer()))
      for (const [relativePath, data] of Object.entries(files)) {
        if (relativePath.endsWith('/')) continue
        const safe = normalize(relativePath)
        if (isAbsolute(safe) || safe === '..' || safe.startsWith(`..${sep}`)) continue
        const destination = join(unpacked, safe)
        if (destination !== unpacked && !destination.startsWith(unpacked + sep)) continue
        await fs.mkdir(dirname(destination), { recursive: true })
        await fs.writeFile(destination, data)
      }
      return { root, items: await findSkills(unpacked) }
    } catch (error) {
      pathPolicy.revokeTemporaryRoot(root)
      await fs.rm(root, { recursive: true, force: true })
      throw error
    }
  })
}
