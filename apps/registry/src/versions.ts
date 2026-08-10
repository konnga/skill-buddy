const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const LEGACY_VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/

export function isSemver(version: string): boolean {
  return VERSION_RE.test(version)
}

/** 按 Registry 支持的严格 x.y.z 规则比较两个版本。 */
export function compareSemver(left: string, right: string): number {
  const leftMatch = LEGACY_VERSION_RE.exec(left)
  const rightMatch = LEGACY_VERSION_RE.exec(right)
  if (!leftMatch || !rightMatch) throw new Error('invalid registry semver')
  for (let index = 1; index <= 3; index += 1) {
    const leftPart = BigInt(leftMatch[index]!)
    const rightPart = BigInt(rightMatch[index]!)
    if (leftPart < rightPart) return -1
    if (leftPart > rightPart) return 1
  }
  return 0
}
