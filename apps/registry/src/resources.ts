/** Registry 仅接受 Skill 目录内部的普通相对资源路径。 */
export function isSafeResourcePath(resourcePath: string): boolean {
  const portable = resourcePath.replaceAll('\\', '/')
  const segments = portable.split('/')
  return !(
    portable.length === 0 ||
    portable.includes('\0') ||
    portable.startsWith('/') ||
    /^[a-zA-Z]:\//.test(portable) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
    portable === 'SKILL.md' ||
    portable === 'SKILL.md.disabled'
  )
}
