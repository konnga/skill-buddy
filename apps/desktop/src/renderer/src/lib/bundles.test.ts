import { describe, expect, it } from 'vitest'
import { parseBundlesManifest } from './bundles.js'

const text = { 'zh-CN': '开发包', en: 'Developer kit' }
const skill = {
  source: 'skills-sh',
  repo: 'acme/skills',
  skillId: 'commit-style',
  name: 'commit-style',
}
const mcpServer = {
  name: 'github',
  description: 'GitHub tools',
  transport: {
    kind: 'stdio',
    command: 'github-mcp-server',
    args: [],
    env: { GITHUB_TOKEN: { kind: 'env', name: 'GITHUB_TOKEN' } },
  },
  requiredSecrets: ['GITHUB_TOKEN'],
}

describe('parseBundlesManifest', () => {
  it.each([
    { label: 'Skills-only', skills: [skill], mcpServers: [] },
    { label: 'MCP-only', skills: [], mcpServers: [mcpServer] },
    { label: '混合', skills: [skill], mcpServers: [mcpServer] },
  ])('接受 $label Bundle', ({ skills, mcpServers }) => {
    expect(
      parseBundlesManifest([{ id: 'developer-kit', name: text, description: text, skills, mcpServers }]),
    ).toEqual([
      expect.objectContaining({
        id: 'developer-kit',
        skills: expect.any(Array),
        mcpServers: expect.any(Array),
      }),
    ])
  })

  it('丢弃含明文引用或 Canonical 白名单外字段的 MCP 定义', () => {
    expect(
      parseBundlesManifest([
        {
          id: 'unsafe',
          name: text,
          description: text,
          mcpServers: [
            {
              ...mcpServer,
              metadata: { token: 'plain-secret' },
              transport: {
                ...mcpServer.transport,
                env: { TOKEN: { kind: 'literal', value: 'plain-secret' } },
              },
            },
          ],
        },
      ]),
    ).toEqual([])
  })
})
