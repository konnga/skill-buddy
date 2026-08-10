const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** 比较项目当前支持的严格 x.y.z 版本；任一版本无效时返回 null。 */
export function compareSemver(left: string, right: string): number | null {
  const leftMatch = SEMVER_RE.exec(left)
  const rightMatch = SEMVER_RE.exec(right)
  if (!leftMatch || !rightMatch) return null
  for (let index = 1; index <= 3; index += 1) {
    const leftPart = BigInt(leftMatch[index]!)
    const rightPart = BigInt(rightMatch[index]!)
    if (leftPart < rightPart) return -1
    if (leftPart > rightPart) return 1
  }
  return 0
}
