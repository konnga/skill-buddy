import { describe, expect, it } from 'vitest'
import {
  buildSkillResourceTree,
  flattenSkillResourceTree,
} from './skill-resource-tree.js'

const resources: [string, string][] = [
  ['references/components/alert/docs.md', '/skill/references/components/alert/docs.md'],
  ['GENERATION.md', '/skill/GENERATION.md'],
  ['references/components/affix/token.md', '/skill/references/components/affix/token.md'],
  ['references/components/affix/demo/basic.md', '/skill/references/components/affix/demo/basic.md'],
]

describe('skill resource tree', () => {
  it('builds implicit directories and sorts directories before files', () => {
    const tree = buildSkillResourceTree(resources)

    expect(tree.map((node) => node.path)).toEqual(['references', 'GENERATION.md'])
    expect(tree[0]?.children[0]?.path).toBe('references/components')
    expect(tree[0]?.children[0]?.children.map((node) => node.path)).toEqual([
      'references/components/affix',
      'references/components/alert',
    ])
  })

  it('flattens only expanded branches and keeps the original source path', () => {
    const tree = buildSkillResourceTree(resources)
    const rows = flattenSkillResourceTree(
      tree,
      new Set(['references', 'references/components', 'references/components/affix']),
    )

    expect(rows.map(({ node, depth }) => [node.path, depth])).toEqual([
      ['references', 0],
      ['references/components', 1],
      ['references/components/affix', 2],
      ['references/components/affix/demo', 3],
      ['references/components/affix/token.md', 3],
      ['references/components/alert', 2],
      ['GENERATION.md', 0],
    ])
    expect(tree[1]?.source).toBe('/skill/GENERATION.md')
  })
})
