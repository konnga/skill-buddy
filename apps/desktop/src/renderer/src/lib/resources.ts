const SCRIPT_RE = /(^|\/)scripts?\/|\.(sh|bash|zsh|py|rb|js|mjs|cjs|ts|ps1|cmd|bat|exe)$/i

/** Heuristic: does this resource path look executable/script-like? */
export function isScriptResource(relPath: string): boolean {
  return SCRIPT_RE.test(relPath)
}

export function hasScriptResources(resources?: Record<string, string>): boolean {
  return Object.keys(resources ?? {}).some(isScriptResource)
}
