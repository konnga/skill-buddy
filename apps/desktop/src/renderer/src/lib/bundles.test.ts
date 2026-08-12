import { describe, expect, it } from 'vitest'
import { parseBundlesManifest } from './bundles.js'

const text = { 'zh-CN': '开发包', en: 'Developer kit' }
const skill = {
  source: 'skills-sh',
  repo: 'acme/skills',
  skillId: 'commit-style',
  name: 'commit-style',
}
describe('parseBundlesManifest', () => {
  it('接受包含 Skills 的推荐技能包', () => {
    expect(
      parseBundlesManifest([{ id: 'developer-kit', name: text, description: text, skills: [skill] }]),
    ).toEqual([
      expect.objectContaining({
        id: 'developer-kit',
        skills: [skill],
      }),
    ])
  })

  it('忽略 MCP 字段，并丢弃不含 Skills 的推荐包', () => {
    expect(
      parseBundlesManifest([
        {
          id: 'skills-with-mcp',
          name: text,
          description: text,
          skills: [skill],
          mcpServers: [{ name: 'ignored' }],
        },
        { id: 'mcp-only', name: text, description: text, mcpServers: [{ name: 'ignored' }] },
      ]),
    ).toEqual([{ id: 'skills-with-mcp', name: text, description: text, skills: [skill] }])
  })
})
