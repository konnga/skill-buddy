import { describe, expect, it } from 'vitest'
import {
  buildMarketFileTree,
  flattenMarketFileTree,
  formatMarketFileSize,
  isMarketBinaryFile,
  type MarketTreeEntry,
} from './market-file-tree.js'

const entries: MarketTreeEntry[] = [
  { path: 'docs/readme.md', size: 1200, isDir: false },
  { path: 'root.txt', size: 12, isDir: false },
  { path: 'images/icon.png', size: 2048, isDir: false },
  { path: 'images', size: 0, isDir: true },
  { path: 'docs', size: 0, isDir: true },
]

describe('market file tree', () => {
  it('builds and sorts a directory tree independently of input order', () => {
    const tree = buildMarketFileTree(entries)

    expect(tree.map((node) => node.path)).toEqual(['docs', 'images', 'root.txt'])
    expect(tree[0]?.children.map((node) => node.path)).toEqual(['docs/readme.md'])
    expect(tree[1]?.children.map((node) => node.path)).toEqual(['images/icon.png'])
  })

  it('flattens only expanded directory branches', () => {
    const rows = flattenMarketFileTree(buildMarketFileTree(entries), new Set(['docs']))

    expect(rows.map(({ node, depth }) => [node.path, depth])).toEqual([
      ['docs', 0],
      ['docs/readme.md', 1],
      ['images', 0],
      ['root.txt', 0],
    ])
  })

  it('detects binary previews and formats file sizes', () => {
    expect(isMarketBinaryFile('assets/ICON.PNG')).toBe(true)
    expect(isMarketBinaryFile('README.md')).toBe(false)
    expect(formatMarketFileSize(2048)).toBe('2.0 KB')
  })
})
