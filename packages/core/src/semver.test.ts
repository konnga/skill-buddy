import { describe, expect, it } from 'vitest'
import { compareSemver } from './semver.js'

describe('compareSemver', () => {
  it('compares major, minor and patch numerically', () => {
    expect(compareSemver('10.0.0', '2.9.9')).toBe(1)
    expect(compareSemver('1.10.0', '1.2.0')).toBe(1)
    expect(compareSemver('1.0.1', '1.0.2')).toBe(-1)
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
  })

  it('rejects versions outside the supported x.y.z format', () => {
    expect(compareSemver('1.0', '1.0.0')).toBeNull()
    expect(compareSemver('v1.0.0', '1.0.0')).toBeNull()
    expect(compareSemver('1.0.0-beta.1', '1.0.0')).toBeNull()
    expect(compareSemver('01.0.0', '1.0.0')).toBeNull()
  })
})
