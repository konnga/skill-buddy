import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import type { Skill } from './types.js'
import { exists } from './adapters/shared.js'

/**
 * Read one SKILL.md-convention folder into a canonical Skill.
 * Returns null when the folder has no readable SKILL.md.
 */
export async function readSkillDir(skillPath: string, fallbackName?: string): Promise<Skill | null> {
  const skillFile = join(skillPath, 'SKILL.md')
  if (!(await exists(skillFile))) return null
  let raw: string
  try {
    raw = await fs.readFile(skillFile, 'utf8')
  } catch {
    return null
  }
  const { data, content } = matter(raw)
  return {
    name: typeof data.name === 'string' ? data.name : (fallbackName ?? ''),
    description: typeof data.description === 'string' ? data.description : '',
    version: typeof data.version === 'string' ? data.version : undefined,
    tags: Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === 'string') : undefined,
    content: content.trim(),
    resources: await collectResources(skillPath),
    metadata: data,
  }
}

/** Walk a skill directory and collect non-SKILL.md files as resources. */
export async function collectResources(
  skillPath: string,
): Promise<Record<string, string> | undefined> {
  const resources: Record<string, string> = {}
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), rel)
      } else if (rel !== 'SKILL.md') {
        resources[rel] = join(dir, entry.name)
      }
    }
  }
  await walk(skillPath, '')
  return Object.keys(resources).length > 0 ? resources : undefined
}

export interface FoundSkill {
  /** Absolute path of the skill folder */
  dir: string
  skill: Skill
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', 'build'])

/**
 * Recursively find SKILL.md folders under a root (for importing from a
 * cloned repo or an arbitrary local directory). A folder that itself
 * contains SKILL.md is returned and not descended further.
 */
export async function findSkills(root: string, maxDepth = 5): Promise<FoundSkill[]> {
  const found: FoundSkill[] = []
  async function walk(dir: string, depth: number): Promise<void> {
    const name = dir.split('/').pop() ?? dir
    const skill = await readSkillDir(dir, name)
    if (skill) {
      found.push({ dir, skill })
      return
    }
    if (depth >= maxDepth) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue
      await walk(join(dir, entry.name), depth + 1)
    }
  }
  await walk(root, 0)
  return found.sort((a, b) => a.skill.name.localeCompare(b.skill.name))
}
