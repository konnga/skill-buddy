import { promises as fs } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  readSkillDir,
  validateMcpDefinition,
} from '@skillbuddy/core'
import type {
  TeamContributionDiff,
  TeamLibraryBundleDraft,
  TeamLibraryCatalog,
  TeamLibraryMcpDraft,
  TeamLibraryMutationResult,
  TeamLibraryPolicy,
  TeamLibraryPolicyDraft,
  TeamLibrarySkillDraft,
  TeamLibrarySkillImportInput,
  TeamLibraryValidationIssue,
} from '../shared/ipc.js'
import {
  catalogFromTeamLibraryRoot,
  readTeamLibraryManifest,
} from './team-library.js'
import {
  runTeamContributionCommand,
  teamContributionRoot,
  teamContributionWorkspace,
} from './team-contribution.js'

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_CONTENT = 1_000_000
const MAX_RESOURCE_FILES = 2_000

function relativePath(root: string, value: string): string {
  const path = relative(root, resolve(root, value)).replaceAll('\\', '/')
  if (!path || path.startsWith('../') || path === '..' || path.startsWith('/')) {
    throw new Error('资源路径必须位于团队库工作区内')
  }
  return path
}

function assertName(value: string, label: string): string {
  const name = value.trim()
  if (!ID_RE.test(name)) throw new Error(`${label}必须使用 kebab-case`)
  return name
}

function assertText(value: string, label: string, max = MAX_CONTENT): string {
  const text = value.trim()
  if (!text) throw new Error(`${label}不能为空`)
  if (text.length > max) throw new Error(`${label}不能超过 ${max} 个字符`)
  if (text.includes('\0')) throw new Error(`${label}包含无效字符`)
  return text
}

async function exists(path: string): Promise<boolean> {
  return fs.access(path).then(() => true, () => false)
}

async function replaceBundleReference(
  root: string,
  key: 'skills' | 'mcp',
  previous: string,
  next: string,
): Promise<string[]> {
  const affected: string[] = []
  for (const bundle of await readBundleFiles(root)) {
    const values = Array.isArray(bundle.value[key])
      ? (bundle.value[key] as unknown[]).filter((item): item is string => typeof item === 'string')
      : []
    if (!values.includes(previous)) continue
    bundle.value[key] = [...new Set(values.map((item) => item === previous ? next : item))]
    await fs.writeFile(join(root, bundle.path), JSON.stringify(bundle.value, null, 2) + '\n', 'utf8')
    affected.push(bundle.path)
  }
  return affected
}

async function assertNoSymlinks(root: string): Promise<void> {
  let files = 0
  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const path = join(directory, entry.name)
      const stat = await fs.lstat(path)
      if (stat.isSymbolicLink()) throw new Error(`团队库不能包含符号链接：${relative(root, path)}`)
      if (stat.isDirectory()) await walk(path)
      else if (stat.isFile()) {
        files += 1
        if (files > MAX_RESOURCE_FILES) throw new Error('团队库资源文件数量超过限制')
      }
    }
  }
  await walk(root)
}

async function writeSkillFile(
  root: string,
  input: TeamLibrarySkillDraft,
): Promise<TeamLibraryMutationResult> {
  const name = assertName(input.name, 'Skill 名称')
  const description = assertText(input.description || '团队共享 Skill', 'Skill 描述', 2_000)
  const content = assertText(input.content, 'Skill 内容')
  const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 30)
  const targetPath = join(root, 'skills', name)
  const originalPath = input.originalPath ? relativePath(root, input.originalPath) : undefined
  const sourcePath = originalPath ? resolve(root, originalPath) : targetPath
  if (originalPath && !originalPath.startsWith('skills/')) throw new Error('Skill 原路径无效')
  if (sourcePath !== targetPath && await exists(targetPath)) throw new Error(`Skill 已存在：${name}`)
  if (sourcePath !== targetPath) await fs.rename(sourcePath, targetPath)
  else await fs.mkdir(targetPath, { recursive: true })
  const metadata: Record<string, unknown> = { name, description }
  if (input.version?.trim()) metadata.version = input.version.trim()
  if (tags.length) metadata.tags = tags
  const raw = `---\n${stringifyYaml(metadata).trim()}\n---\n\n${content}\n`
  await fs.writeFile(join(targetPath, 'SKILL.md'), raw, 'utf8')
  const path = `skills/${name}`
  const affectedBundles = originalPath && originalPath !== path
    ? await replaceBundleReference(root, 'skills', originalPath, path)
    : []
  return { path, affectedBundles }
}

async function copyDirectory(sourcePath: string, targetPath: string): Promise<void> {
  const source = resolve(sourcePath)
  const skill = await readSkillDir(source, basename(source))
  if (!skill) throw new Error('选择的目录不包含有效的 SKILL.md')
  await assertNoSymlinks(source)
  if (await exists(targetPath)) throw new Error(`Skill 已存在：${basename(targetPath)}`)
  await fs.mkdir(dirname(targetPath), { recursive: true })
  await fs.cp(source, targetPath, { recursive: true, errorOnExist: true })
}

export async function importTeamSkill(
  workspaceId: string,
  input: TeamLibrarySkillImportInput,
): Promise<TeamLibraryMutationResult> {
  const root = teamContributionRoot(workspaceId)
  const source = resolve(input.sourcePath)
  const sourceSkill = await readSkillDir(source, basename(source))
  if (!sourceSkill) throw new Error('选择的目录不包含有效的 SKILL.md')
  const name = assertName(input.name?.trim() || sourceSkill.name || basename(source), 'Skill 名称')
  await copyDirectory(source, join(root, 'skills', name))
  return writeSkillFile(root, {
    originalPath: `skills/${name}`,
    name,
    description: sourceSkill.description || '团队共享 Skill',
    version: sourceSkill.version,
    tags: sourceSkill.tags ?? [],
    content: sourceSkill.content,
  })
}

/** 读取当前变更草稿中的 Skill 编辑数据。 */
export async function getTeamContributionSkill(
  workspaceId: string,
  pathInput: string,
): Promise<TeamLibrarySkillDraft> {
  const root = teamContributionRoot(workspaceId)
  const path = relativePath(root, pathInput)
  if (!/^skills\/[^/]+$/.test(path)) throw new Error('Skill 路径无效')
  const skill = await readSkillDir(resolve(root, path), basename(path))
  if (!skill) throw new Error(`无效的 Skill：${path}`)
  return {
    originalPath: path,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    tags: skill.tags ?? [],
    content: skill.content,
  }
}

async function writeMcpFile(
  root: string,
  input: TeamLibraryMcpDraft,
): Promise<TeamLibraryMutationResult> {
  validateMcpDefinition(input.definition, { source: 'user-input' })
  const name = assertName(input.definition.name, 'MCP Server 名称')
  const originalPath = input.originalPath ? relativePath(root, input.originalPath) : undefined
  if (originalPath && !originalPath.startsWith('mcp/')) throw new Error('MCP 原路径无效')
  const path = `mcp/${name}.json`
  const target = join(root, path)
  const source = originalPath ? resolve(root, originalPath) : target
  if (source !== target && await exists(target)) throw new Error(`MCP Server 已存在：${name}`)
  await fs.mkdir(dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify({
    version: input.version?.trim() || undefined,
    description: input.description.trim() || input.definition.description || '',
    definition: input.definition,
  }, null, 2) + '\n', 'utf8')
  if (source !== target) await fs.rm(source, { force: true })
  const affectedBundles = originalPath && originalPath !== path
    ? await replaceBundleReference(root, 'mcp', originalPath, path)
    : []
  return { path, affectedBundles }
}

/** 读取当前变更草稿中的 MCP Server 编辑数据。 */
export async function getTeamContributionMcp(
  workspaceId: string,
  pathInput: string,
): Promise<TeamLibraryMcpDraft> {
  const root = teamContributionRoot(workspaceId)
  const path = relativePath(root, pathInput)
  if (!/^mcp\/[^/]+\.json$/.test(path)) throw new Error('MCP 路径无效')
  const value = JSON.parse(await fs.readFile(resolve(root, path), 'utf8')) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('MCP 文件必须是 JSON 对象')
  const wrapper = value as Record<string, unknown>
  const definition = (wrapper.definition ?? value) as Parameters<typeof validateMcpDefinition>[0]
  validateMcpDefinition(definition, { source: 'user-input' })
  return {
    originalPath: path,
    version: typeof wrapper.version === 'string' ? wrapper.version : undefined,
    description: typeof wrapper.description === 'string'
      ? wrapper.description
      : definition.description ?? '',
    definition,
  }
}

async function readBundleFiles(root: string): Promise<{ path: string; value: Record<string, unknown> }[]> {
  const directory = join(root, 'bundles')
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
  const result: { path: string; value: Record<string, unknown> }[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = `bundles/${entry.name}`
    const value = JSON.parse(await fs.readFile(join(root, path), 'utf8')) as unknown
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result.push({ path, value: value as Record<string, unknown> })
    }
  }
  return result
}

async function writeBundleFile(
  root: string,
  input: TeamLibraryBundleDraft,
): Promise<TeamLibraryMutationResult> {
  const id = assertName(input.id, '岗位包 ID')
  const name = assertText(input.name, '岗位包名称', 200)
  const skills = [...new Set(input.skills.map((item) => item.trim()).filter(Boolean))]
  const mcp = [...new Set(input.mcp.map((item) => item.trim()).filter(Boolean))]
  if (skills.length + mcp.length === 0) throw new Error('岗位包至少需要包含一个 Skill 或 MCP Server')
  const originalPath = input.originalPath ? relativePath(root, input.originalPath) : undefined
  if (originalPath && !originalPath.startsWith('bundles/')) throw new Error('岗位包原路径无效')
  const path = `bundles/${id}.json`
  const target = join(root, path)
  const source = originalPath ? resolve(root, originalPath) : target
  if (source !== target && await exists(target)) throw new Error(`岗位包已存在：${id}`)
  await fs.mkdir(dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify({
    id,
    name,
    description: input.description.trim(),
    version: input.version?.trim() || undefined,
    skills,
    mcp,
  }, null, 2) + '\n', 'utf8')
  if (source !== target) await fs.rm(source, { force: true })
  return { path, affectedBundles: [] }
}

export async function upsertTeamSkill(workspaceId: string, input: TeamLibrarySkillDraft): Promise<TeamLibraryMutationResult> {
  return writeSkillFile(teamContributionRoot(workspaceId), input)
}

export async function upsertTeamMcp(workspaceId: string, input: TeamLibraryMcpDraft): Promise<TeamLibraryMutationResult> {
  return writeMcpFile(teamContributionRoot(workspaceId), input)
}

export async function upsertTeamBundle(workspaceId: string, input: TeamLibraryBundleDraft): Promise<TeamLibraryMutationResult> {
  const catalog = await teamContributionCatalog(workspaceId)
  const skillPaths = new Set(catalog.skills.map((item) => item.path))
  const mcpPaths = new Set(catalog.mcpServers.map((item) => item.path))
  const missing = [
    ...input.skills.filter((item) => !skillPaths.has(item)),
    ...input.mcp.filter((item) => !mcpPaths.has(item)),
  ]
  if (missing.length > 0) throw new Error(`岗位包包含不存在的资源：${missing.join('、')}`)
  return writeBundleFile(teamContributionRoot(workspaceId), input)
}

export async function deleteTeamResource(
  workspaceId: string,
  pathInput: string,
): Promise<TeamLibraryMutationResult> {
  const root = teamContributionRoot(workspaceId)
  const path = relativePath(root, pathInput)
  if (!/^(?:skills\/[^/]+|mcp\/[^/]+\.json|bundles\/[^/]+\.json)$/.test(path)) {
    throw new Error('只能删除团队库资源文件')
  }
  const affectedBundles: string[] = []
  const isSkill = path.startsWith('skills/')
  const isMcp = path.startsWith('mcp/')
  for (const bundle of await readBundleFiles(root)) {
    const listKey = isSkill ? 'skills' : isMcp ? 'mcp' : null
    if (!listKey) continue
    const values = Array.isArray(bundle.value[listKey])
      ? (bundle.value[listKey] as unknown[]).filter((item): item is string => typeof item === 'string')
      : []
    if (!values.includes(path)) continue
    bundle.value[listKey] = values.filter((item) => item !== path)
    if ((Array.isArray(bundle.value.skills) ? bundle.value.skills.length : 0) +
      (Array.isArray(bundle.value.mcp) ? bundle.value.mcp.length : 0) === 0) {
      throw new Error(`无法删除 ${path}：岗位包 ${String(bundle.value.id ?? bundle.path)} 将变为空包`)
    }
    await fs.writeFile(join(root, bundle.path), JSON.stringify(bundle.value, null, 2) + '\n', 'utf8')
    affectedBundles.push(bundle.path)
  }
  await fs.rm(resolve(root, path), { recursive: true, force: true })
  return { path, affectedBundles }
}

function normalizePolicy(value: TeamLibraryPolicy): TeamLibraryPolicy {
  return {
    required: {
      skills: [...new Set(value.required.skills.map((item) => item.trim()).filter(Boolean))],
      mcp: [...new Set(value.required.mcp.map((item) => item.trim()).filter(Boolean))],
    },
    recommended: {
      skills: [...new Set(value.recommended.skills.map((item) => item.trim()).filter(Boolean))],
      mcp: [...new Set(value.recommended.mcp.map((item) => item.trim()).filter(Boolean))],
    },
    blocked: value.blocked.map((item) => ({
      ref: assertText(item.ref, '禁用资源引用', 500),
      ...(item.versions?.trim() ? { versions: item.versions.trim() } : {}),
      reason: assertText(item.reason, '禁用原因', 500),
    })),
  }
}

export async function updateTeamOrganizationPolicy(
  workspaceId: string,
  input: TeamLibraryPolicyDraft,
): Promise<TeamLibraryMutationResult> {
  const root = teamContributionRoot(workspaceId)
  const policy = normalizePolicy(input.policy)
  const teamId = input.scope === 'team' ? assertName(input.teamId ?? '', '团队 ID') : null
  const teamName = teamId ? assertText(input.teamName ?? teamId, '团队名称', 200) : null
  const relativePolicyPath = teamId ? `policies/${teamId}.yaml` : 'policies/organization.yaml'
  const policyPath = join(root, relativePolicyPath)
  await fs.mkdir(dirname(policyPath), { recursive: true })
  await fs.writeFile(policyPath, stringifyYaml(policy), 'utf8')
  const manifestPath = join(root, 'team-library.yaml')
  const raw = parseYaml(await fs.readFile(manifestPath, 'utf8')) as Record<string, unknown>
  const policies = typeof raw.policies === 'object' && raw.policies !== null && !Array.isArray(raw.policies)
    ? raw.policies as Record<string, unknown>
    : {}
  if (teamId) {
    const teams = typeof policies.teams === 'object' && policies.teams !== null && !Array.isArray(policies.teams)
      ? policies.teams as Record<string, unknown>
      : {}
    raw.policies = {
      ...policies,
      teams: {
        ...teams,
        [teamId]: { name: teamName, file: relativePolicyPath },
      },
    }
  } else {
    raw.policies = { ...policies, organization: relativePolicyPath }
  }
  await fs.writeFile(manifestPath, stringifyYaml(raw), 'utf8')
  return { path: relativePolicyPath, affectedBundles: [] }
}

export async function teamContributionCatalog(workspaceId: string): Promise<TeamLibraryCatalog> {
  const workspace = teamContributionWorkspace(workspaceId)
  const revision = await runTeamContributionCommand('git', ['rev-parse', 'HEAD'], workspace.root)
  return catalogFromTeamLibraryRoot(
    workspace.root,
    { remoteUrl: workspace.remoteUrl, branch: workspace.baseBranch },
    revision,
  )
}

export async function validateTeamLibraryWorkspace(workspaceId: string): Promise<TeamLibraryValidationIssue[]> {
  const workspace = teamContributionWorkspace(workspaceId)
  const root = workspace.root
  const issues: TeamLibraryValidationIssue[] = []
  try {
    await readTeamLibraryManifest(root)
  } catch (error) {
    issues.push({ path: 'team-library.yaml', message: error instanceof Error ? error.message : String(error) })
    return issues
  }
  await assertNoSymlinks(root).catch((error) => {
    issues.push({ path: '.', message: error instanceof Error ? error.message : String(error) })
  })

  try {
    const raw = parseYaml(await fs.readFile(join(root, 'team-library.yaml'), 'utf8')) as unknown
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('清单必须是 YAML 对象')
    const policies = (raw as Record<string, unknown>).policies
    if (policies !== undefined && (typeof policies !== 'object' || policies === null || Array.isArray(policies))) {
      issues.push({ path: 'team-library.yaml', message: 'policies 必须是对象' })
    } else if (policies && typeof policies === 'object') {
      const policyMap = policies as Record<string, unknown>
      const policyRefs: [string, unknown][] = []
      if (policyMap.organization !== undefined) policyRefs.push(['organization', policyMap.organization])
      if (policyMap.teams && typeof policyMap.teams === 'object' && !Array.isArray(policyMap.teams)) {
        for (const [teamId, value] of Object.entries(policyMap.teams as Record<string, unknown>)) {
          if (!ID_RE.test(teamId)) issues.push({ path: 'team-library.yaml', message: `团队 ID 无效：${teamId}` })
          const entry = typeof value === 'string' ? { file: value } : value
          if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof (entry as Record<string, unknown>).file !== 'string') {
            issues.push({ path: 'team-library.yaml', message: `团队策略缺少文件：${teamId}` })
            continue
          }
          policyRefs.push([`teams.${teamId}`, (entry as Record<string, unknown>).file])
        }
      }
      for (const [label, value] of policyRefs) {
        if (typeof value !== 'string' || !value.trim()) {
          issues.push({ path: 'team-library.yaml', message: `${label} 策略路径无效` })
          continue
        }
        try {
          const policyPath = relativePath(root, value)
          const policyStat = await fs.lstat(join(root, policyPath))
          if (!policyStat.isFile() || policyStat.isSymbolicLink()) throw new Error('策略文件必须是普通文件')
          const policyValue = parseYaml(await fs.readFile(join(root, policyPath), 'utf8')) as unknown
          if (typeof policyValue !== 'object' || policyValue === null || Array.isArray(policyValue)) throw new Error('策略文件必须是 YAML 对象')
        } catch (error) {
          issues.push({ path: `team-library.yaml:${label}`, message: error instanceof Error ? error.message : String(error) })
        }
      }
    }
  } catch (error) {
    issues.push({ path: 'team-library.yaml', message: error instanceof Error ? error.message : String(error) })
  }

  const skillNames = new Set<string>()
  const skillPaths = new Set<string>()
  const skillEntries = await fs.readdir(join(root, 'skills'), { withFileTypes: true }).catch(() => [])
  for (const entry of skillEntries) {
    if (!entry.isDirectory()) continue
    const path = `skills/${entry.name}`
    try {
      if (!ID_RE.test(entry.name)) throw new Error('Skill 目录名必须使用 kebab-case')
      const skill = await readSkillDir(join(root, path), entry.name)
      if (!skill) throw new Error('缺少有效的 SKILL.md')
      if (!ID_RE.test(skill.name)) throw new Error('Skill 名称必须使用 kebab-case')
      if (skill.name !== entry.name) throw new Error(`Skill 名称必须与目录名一致：${entry.name}`)
      if (skillNames.has(skill.name)) throw new Error(`Skill 名称重复：${skill.name}`)
      skillNames.add(skill.name)
      skillPaths.add(path)
    } catch (error) {
      issues.push({ path, message: error instanceof Error ? error.message : String(error) })
    }
  }

  const mcpNames = new Set<string>()
  const mcpPaths = new Set<string>()
  const mcpEntries = await fs.readdir(join(root, 'mcp'), { withFileTypes: true }).catch(() => [])
  for (const entry of mcpEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = `mcp/${entry.name}`
    try {
      const value = JSON.parse(await fs.readFile(join(root, path), 'utf8')) as unknown
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('MCP 文件必须是 JSON 对象')
      const wrapper = value as Record<string, unknown>
      const definition = (wrapper.definition ?? value) as Parameters<typeof validateMcpDefinition>[0]
      validateMcpDefinition(definition, { source: 'user-input' })
      if (!ID_RE.test(definition.name)) throw new Error('MCP Server 名称必须使用 kebab-case')
      if (entry.name !== `${definition.name}.json`) throw new Error(`文件名必须为 ${definition.name}.json`)
      if (mcpNames.has(definition.name)) throw new Error(`MCP Server 名称重复：${definition.name}`)
      mcpNames.add(definition.name)
      mcpPaths.add(path)
    } catch (error) {
      issues.push({ path, message: error instanceof Error ? error.message : String(error) })
    }
  }

  const bundleIds = new Set<string>()
  const bundleEntries = await fs.readdir(join(root, 'bundles'), { withFileTypes: true }).catch(() => [])
  for (const entry of bundleEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = `bundles/${entry.name}`
    try {
      const value = JSON.parse(await fs.readFile(join(root, path), 'utf8')) as unknown
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('岗位包必须是 JSON 对象')
      const item = value as Record<string, unknown>
      const id = typeof item.id === 'string' ? item.id.trim() : ''
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      const skills = Array.isArray(item.skills) && item.skills.every((ref) => typeof ref === 'string')
        ? item.skills as string[]
        : null
      const mcp = Array.isArray(item.mcp) && item.mcp.every((ref) => typeof ref === 'string')
        ? item.mcp as string[]
        : null
      if (!ID_RE.test(id)) throw new Error('岗位包 ID 必须使用 kebab-case')
      if (entry.name !== `${id}.json`) throw new Error(`文件名必须为 ${id}.json`)
      if (!name) throw new Error('岗位包名称不能为空')
      if (!skills || !mcp) throw new Error('岗位包的 skills 和 mcp 必须是字符串数组')
      if (skills.length + mcp.length === 0) throw new Error('岗位包至少需要一个 Skill 或 MCP Server')
      if (bundleIds.has(id)) throw new Error(`岗位包 ID 重复：${id}`)
      bundleIds.add(id)
      const missing = [
        ...skills.filter((ref) => !skillPaths.has(ref)),
        ...mcp.filter((ref) => !mcpPaths.has(ref)),
      ]
      if (missing.length > 0) throw new Error(`岗位包包含失效引用：${missing.join('、')}`)
    } catch (error) {
      issues.push({ path, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return issues
}

export async function teamContributionDiffWithValidation(workspaceId: string): Promise<TeamContributionDiff> {
  const { teamContributionDiff } = await import('./team-contribution.js')
  const diff = await teamContributionDiff(workspaceId)
  return { ...diff, issues: await validateTeamLibraryWorkspace(workspaceId) }
}
