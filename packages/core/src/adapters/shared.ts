import { promises as fs } from 'node:fs'

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isKebabCase(name: string): boolean {
  return KEBAB_RE.test(name)
}
