import { isAbsolute, relative, resolve, sep } from 'node:path'

/** 校验并解析 Skill 附属文件路径，确保目标始终位于 Skill 目录内部。 */
export function resolveResourcePath(root: string, resourcePath: string): string {
  const portable = resourcePath.replaceAll('\\', '/')
  const segments = portable.split('/')
  if (
    portable.length === 0 ||
    portable.includes('\0') ||
    portable.startsWith('/') ||
    /^[a-zA-Z]:\//.test(portable) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
    portable === 'SKILL.md' ||
    portable === 'SKILL.md.disabled'
  ) {
    throw new Error(`invalid Skill resource path: ${resourcePath}`)
  }

  const target = resolve(root, ...segments)
  const rel = relative(resolve(root), target)
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Skill resource path escapes its directory: ${resourcePath}`)
  }
  return target
}
