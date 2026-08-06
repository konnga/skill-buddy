const SCRIPT_RE = /(^|\/)scripts?\/|\.(sh|bash|zsh|py|rb|js|mjs|cjs|ts|ps1|cmd|bat|exe)$/i

/** Heuristic: does this resource path look executable/script-like? */
export function isScriptResource(relPath: string): boolean {
  return SCRIPT_RE.test(relPath)
}

export function hasScriptResources(resources?: Record<string, string>): boolean {
  return Object.keys(resources ?? {}).some(isScriptResource)
}

/** Next patch version after the given semver (1.2.3 -> 1.2.4). */
export function nextPatch(version: string): string {
  const parts = version.split('.').map((n) => Number.parseInt(n, 10) || 0)
  return `${parts[0] ?? 0}.${parts[1] ?? 0}.${(parts[2] ?? 0) + 1}`
}
