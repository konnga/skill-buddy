export interface PortablePreset {
  name: string
  skills: string[]
}

export interface PresetDocumentV1 {
  kind: 'skillbuddy-preset'
  version: 1
  preset: PortablePreset
}

export type PresetMergeResult = 'created' | 'merged' | 'unchanged'

export interface PresetMergeOutcome {
  groups: PortablePreset[]
  result: PresetMergeResult
  addedSkills: number
}

const exactKeys = (value: Record<string, unknown>, keys: string[]): boolean => {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function normalizePreset(value: unknown): PortablePreset {
  if (typeof value !== 'object' || value === null) throw new Error('invalid preset')
  const preset = value as Record<string, unknown>
  if (!exactKeys(preset, ['name', 'skills'])) throw new Error('invalid preset fields')

  const name = typeof preset.name === 'string' ? preset.name.trim() : ''
  if (!name || !Array.isArray(preset.skills)) throw new Error('invalid preset data')

  const skills: string[] = []
  const seen = new Set<string>()
  for (const item of preset.skills) {
    if (typeof item !== 'string' || !item.trim()) throw new Error('invalid skill name')
    const skill = item.trim()
    if (!seen.has(skill)) {
      seen.add(skill)
      skills.push(skill)
    }
  }
  return { name, skills }
}

/** 将单个 Preset 序列化为不含本机运行信息的 v1 可移植文档。 */
export function serializePreset(group: PortablePreset): string {
  const document: PresetDocumentV1 = {
    kind: 'skillbuddy-preset',
    version: 1,
    preset: normalizePreset(group),
  }
  return JSON.stringify(document, null, 2)
}

/** 严格解析一个 v1 Preset 文档；未知字段和版本均拒绝。 */
export function parsePresetDocument(content: string): PortablePreset {
  const value: unknown = JSON.parse(content)
  if (typeof value !== 'object' || value === null) throw new Error('invalid document')
  const document = value as Record<string, unknown>
  if (!exactKeys(document, ['kind', 'version', 'preset'])) {
    throw new Error('invalid document fields')
  }
  if (document.kind !== 'skillbuddy-preset' || document.version !== 1) {
    throw new Error('unsupported document')
  }
  return normalizePreset(document.preset)
}

/** 新建或稳定合并 Preset；已有成员顺序不变，导入成员按首次出现顺序追加。 */
export function mergePreset(
  groups: PortablePreset[],
  imported: PortablePreset,
): PresetMergeOutcome {
  const preset = normalizePreset(imported)
  const index = groups.findIndex((group) => group.name === preset.name)
  if (index === -1) {
    return { groups: [...groups, preset], result: 'created', addedSkills: preset.skills.length }
  }

  const current = groups[index]!
  const seen = new Set(current.skills)
  const added = preset.skills.filter((skill) => !seen.has(skill))
  if (added.length === 0) return { groups, result: 'unchanged', addedSkills: 0 }

  const next = [...groups]
  next[index] = { ...current, skills: [...current.skills, ...added] }
  return { groups: next, result: 'merged', addedSkills: added.length }
}
