import { describe, expect, it } from 'vitest'
import { mergePreset, parsePresetDocument, serializePreset } from './preset-format.js'

describe('Preset portable format', () => {
  it('只序列化版本、名称和去重后的 Skill 名称', () => {
    const content = serializePreset({
      name: ' Frontend ',
      skills: ['vue', ' vite ', 'vue'],
    })
    expect(JSON.parse(content)).toEqual({
      kind: 'skillbuddy-preset',
      version: 1,
      preset: { name: 'Frontend', skills: ['vue', 'vite'] },
    })
    expect(content).not.toContain('path')
    expect(content).not.toContain('enabled')
  })

  it('解析时标准化名称并稳定去重，允许空合集', () => {
    expect(
      parsePresetDocument(
        JSON.stringify({
          kind: 'skillbuddy-preset',
          version: 1,
          preset: { name: ' Docs ', skills: ['pdf', ' docx ', 'pdf'] },
        }),
      ),
    ).toEqual({ name: 'Docs', skills: ['pdf', 'docx'] })

    expect(
      parsePresetDocument(
        JSON.stringify({
          kind: 'skillbuddy-preset',
          version: 1,
          preset: { name: 'Empty', skills: [] },
        }),
      ),
    ).toEqual({ name: 'Empty', skills: [] })
  })

  it.each([
    '{}',
    '{"kind":"skillbuddy-preset","version":2,"preset":{"name":"A","skills":[]}}',
    '{"kind":"skillbuddy-preset","version":1,"preset":{"name":"","skills":[]}}',
    '{"kind":"skillbuddy-preset","version":1,"preset":{"name":"A","skills":[""]}}',
    '{"kind":"skillbuddy-preset","version":1,"preset":{"name":"A","skills":[],"enabled":true}}',
    '{"kind":"skillbuddy-preset","version":1,"preset":{"name":"A","skills":[]},"path":"/tmp"}',
  ])('拒绝非法或白名单外输入：%s', (content) => {
    expect(() => parsePresetDocument(content)).toThrow()
  })

  it('新建分组，并对同名分组稳定合并且保持幂等', () => {
    const created = mergePreset([], { name: 'Frontend', skills: ['vue'] })
    expect(created).toEqual({
      groups: [{ name: 'Frontend', skills: ['vue'] }],
      result: 'created',
      addedSkills: 1,
    })

    const merged = mergePreset(created.groups, {
      name: 'Frontend',
      skills: ['vue', 'vite', 'vitest'],
    })
    expect(merged).toEqual({
      groups: [{ name: 'Frontend', skills: ['vue', 'vite', 'vitest'] }],
      result: 'merged',
      addedSkills: 2,
    })

    const unchanged = mergePreset(merged.groups, {
      name: 'Frontend',
      skills: ['vitest', 'vue'],
    })
    expect(unchanged.result).toBe('unchanged')
    expect(unchanged.groups).toBe(merged.groups)
  })
})
