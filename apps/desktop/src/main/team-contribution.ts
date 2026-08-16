import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app, shell } from 'electron'
import type {
  TeamContributionChangedFile,
  TeamContributionDiff,
  TeamContributionPublishResult,
  TeamContributionWorkspace,
  TeamLibraryConfig,
} from '../shared/ipc.js'
import { readTeamLibraryManifest, validateTeamLibraryConfig } from './team-library.js'

const execFileAsync = promisify(execFile)
const BRANCH_SLUG_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/
const WORKSPACE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WORKSPACE_METADATA_FILE = 'workspace.json'
const workspaces = new Map<string, TeamContributionWorkspace>()

export async function runTeamContributionCommand(
  command: string,
  args: string[],
  cwd?: string,
  timeout = 120_000,
): Promise<string> {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    return result.stdout.trim()
  } catch (error) {
    const stderr = typeof (error as { stderr?: unknown })?.stderr === 'string'
      ? (error as { stderr: string }).stderr
      : ''
    const message = (stderr || (error instanceof Error ? error.message : String(error)))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)[0] ?? '未知错误'
    const authenticationHint = /authentication failed|could not read (?:username|password)|permission denied \(publickey\)|repository not found|terminal prompts disabled/i.test(message)
      ? '。私有仓库请先通过系统 Git Credential Manager、macOS 钥匙串或 SSH Agent 完成认证'
      : ''
    throw new Error(`${command} 执行失败：${message}${authenticationHint}`)
  }
}

function providerOf(remoteUrl: string): TeamContributionWorkspace['provider'] {
  const lower = remoteUrl.toLowerCase()
  if (lower.includes('github')) return 'github'
  if (lower.includes('gitlab')) return 'gitlab'
  return 'unsupported'
}

function workspaceDirectory(id: string): string {
  return join(app.getPath('userData'), 'team-contributions', id)
}

function workspaceRoot(id: string): string {
  return join(workspaceDirectory(id), 'repository')
}

function workspaceMetadataPath(id: string): string {
  return join(workspaceDirectory(id), WORKSPACE_METADATA_FILE)
}

function parseWorkspaceMetadata(id: string, value: unknown): TeamContributionWorkspace {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('草稿元数据必须是 JSON 对象')
  }
  const item = value as Record<string, unknown>
  const libraryId = typeof item.libraryId === 'string' ? item.libraryId.trim() : ''
  const remoteUrl = typeof item.remoteUrl === 'string' ? item.remoteUrl.trim() : ''
  const branch = typeof item.branch === 'string' ? item.branch : ''
  const baseBranch = typeof item.baseBranch === 'string' ? item.baseBranch.trim() : ''
  const baseRevision = typeof item.baseRevision === 'string' ? item.baseRevision.trim() : ''
  const provider = item.provider
  if (
    item.id !== id ||
    !libraryId ||
    !remoteUrl ||
    !branch.startsWith('skillbuddy/') ||
    !baseBranch ||
    !baseRevision ||
    typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt) ||
    (provider !== 'github' && provider !== 'gitlab' && provider !== 'unsupported')
  ) {
    throw new Error('草稿元数据无效')
  }
  return {
    id,
    libraryId,
    root: workspaceRoot(id),
    remoteUrl,
    branch,
    baseBranch,
    baseRevision,
    createdAt: item.createdAt,
    provider,
  }
}

async function persistTeamContribution(workspace: TeamContributionWorkspace): Promise<void> {
  const path = workspaceMetadataPath(workspace.id)
  const temporaryPath = `${path}.tmp`
  await fs.writeFile(temporaryPath, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8')
  await fs.rm(path, { force: true })
  await fs.rename(temporaryPath, path)
}

async function readPersistedTeamContribution(id: string): Promise<TeamContributionWorkspace | null> {
  try {
    const value = JSON.parse(await fs.readFile(workspaceMetadataPath(id), 'utf8')) as unknown
    return parseWorkspaceMetadata(id, value)
  } catch {
    return null
  }
}

/** 从旧版未写入元数据的本地 Git 草稿中恢复工作区信息。 */
async function recoverLegacyTeamContribution(id: string): Promise<TeamContributionWorkspace | null> {
  const root = workspaceRoot(id)
  try {
    const [manifest, remoteUrl, branch, remoteRefs, stat] = await Promise.all([
      readTeamLibraryManifest(root),
      runTeamContributionCommand('git', ['remote', 'get-url', 'origin'], root),
      runTeamContributionCommand('git', ['branch', '--show-current'], root),
      runTeamContributionCommand('git', ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'], root),
      fs.stat(workspaceDirectory(id)),
    ])
    if (!branch.startsWith('skillbuddy/')) return null
    const remoteBranch = remoteRefs.split('\n')
      .map((item) => item.trim())
      .find((item) => item.startsWith('origin/') && item !== 'origin/HEAD')
    if (!remoteBranch) return null
    const baseBranch = remoteBranch.slice('origin/'.length)
    const baseRevision = await runTeamContributionCommand('git', ['rev-parse', remoteBranch], root)
    const workspace: TeamContributionWorkspace = {
      id,
      libraryId: manifest.id,
      root,
      remoteUrl,
      branch,
      baseBranch,
      baseRevision,
      createdAt: stat.birthtimeMs || stat.mtimeMs,
      provider: providerOf(remoteUrl),
    }
    await persistTeamContribution(workspace)
    return workspace
  } catch {
    return null
  }
}

async function validateRestoredWorkspace(workspace: TeamContributionWorkspace): Promise<boolean> {
  try {
    const manifest = await readTeamLibraryManifest(workspace.root)
    await fs.access(join(workspace.root, '.git'))
    return manifest.id === workspace.libraryId
  } catch {
    return false
  }
}

/** 列出仍保存在本地磁盘中的团队库草稿，并重新注册到当前主进程。 */
export async function listTeamContributions(): Promise<TeamContributionWorkspace[]> {
  const root = join(app.getPath('userData'), 'team-contributions')
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const result: TeamContributionWorkspace[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !WORKSPACE_ID_RE.test(entry.name)) continue
    const id = entry.name
    const workspace = workspaces.get(id)
      ?? await readPersistedTeamContribution(id)
      ?? await recoverLegacyTeamContribution(id)
    if (!workspace || !await validateRestoredWorkspace(workspace)) {
      workspaces.delete(id)
      continue
    }
    workspaces.set(id, workspace)
    result.push(workspace)
  }
  return result.sort((left, right) => right.createdAt - left.createdAt)
}

export function teamContributionWorkspace(id: string): TeamContributionWorkspace {
  const value = workspaces.get(id)
  if (!value) throw new Error('贡献工作区尚未恢复或已被删除')
  return value
}

export function teamContributionRoot(id: string): string {
  return teamContributionWorkspace(id).root
}

async function assertNoSymlinks(root: string): Promise<void> {
  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const path = join(directory, entry.name)
      const stat = await fs.lstat(path)
      if (stat.isSymbolicLink()) throw new Error('贡献工作区不能包含符号链接')
      if (stat.isDirectory()) await walk(path)
    }
  }
  await walk(root)
}

/** 创建独立 Git 分支工作区，供用户编辑后提交 PR/MR。 */
export async function prepareTeamContribution(
  input: TeamLibraryConfig,
  branchSlug: string,
): Promise<TeamContributionWorkspace> {
  const config = validateTeamLibraryConfig(input)
  const slug = branchSlug.trim().toLowerCase()
  if (!BRANCH_SLUG_RE.test(slug)) throw new Error('分支标识仅支持小写字母、数字、点、下划线和连字符')
  const id = randomUUID()
  const root = workspaceRoot(id)
  await fs.mkdir(workspaceDirectory(id), { recursive: true })
  try {
    await runTeamContributionCommand('git', [
      'clone',
      '--depth',
      '1',
      '--branch',
      config.branch,
      '--single-branch',
      '--no-tags',
      config.remoteUrl,
      root,
    ])
    await assertNoSymlinks(root)
    const manifest = await readTeamLibraryManifest(root)
    const baseRevision = await runTeamContributionCommand('git', ['rev-parse', 'HEAD'], root)
    const branch = `skillbuddy/${slug}`
    await runTeamContributionCommand('git', ['checkout', '-b', branch], root)
    const result: TeamContributionWorkspace = {
      id,
      libraryId: manifest.id,
      root,
      remoteUrl: config.remoteUrl,
      branch,
      baseBranch: config.branch,
      baseRevision,
      createdAt: Date.now(),
      provider: providerOf(config.remoteUrl),
    }
    await persistTeamContribution(result)
    workspaces.set(id, result)
    return result
  } catch (error) {
    await fs.rm(workspaceDirectory(id), { recursive: true, force: true })
    throw error
  }
}

export async function openTeamContribution(id: string): Promise<void> {
  const result = await shell.openPath(teamContributionWorkspace(id).root)
  if (result) throw new Error(result)
}

/** 放弃团队库变更草稿并删除对应的临时 Git 工作区。 */
export async function discardTeamContribution(id: string): Promise<void> {
  teamContributionWorkspace(id)
  workspaces.delete(id)
  await fs.rm(workspaceDirectory(id), { recursive: true, force: true })
}

/** 提交并推送贡献分支，然后通过 gh 或 glab 创建 PR/MR。 */
export async function publishTeamContribution(
  id: string,
  titleInput: string,
  bodyInput: string,
): Promise<TeamContributionPublishResult> {
  const current = teamContributionWorkspace(id)
  const title = titleInput.trim()
  const body = bodyInput.trim()
  if (!title || title.length > 200) throw new Error('贡献标题不能为空且不能超过 200 个字符')
  if (body.length > 20_000) throw new Error('贡献说明不能超过 20000 个字符')
  if (!await runTeamContributionCommand('git', ['status', '--porcelain'], current.root)) throw new Error('贡献工作区没有待提交修改')
  await runTeamContributionCommand('git', ['fetch', '--depth', '1', 'origin', current.baseBranch], current.root)
  const remoteRevision = await runTeamContributionCommand('git', ['rev-parse', `origin/${current.baseBranch}`], current.root)
  if (remoteRevision !== current.baseRevision) {
    throw new Error('团队库主分支已经更新，请同步后创建新的变更分支，避免覆盖其他成员的修改')
  }
  await runTeamContributionCommand('git', ['add', '--all'], current.root)
  await runTeamContributionCommand('git', ['commit', '-m', title], current.root)
  await runTeamContributionCommand('git', ['push', '--set-upstream', 'origin', current.branch], current.root)
  if (current.provider === 'unsupported') {
    return {
      pushed: true,
      provider: current.provider,
      branch: current.branch,
      warning: '分支已推送，但当前远程地址无法识别为 GitHub 或 GitLab',
    }
  }
  try {
    const output = current.provider === 'github'
      ? await runTeamContributionCommand('gh', [
          'pr',
          'create',
          '--base',
          current.baseBranch,
          '--head',
          current.branch,
          '--title',
          title,
          '--body',
          body,
        ], current.root)
      : await runTeamContributionCommand('glab', [
          'mr',
          'create',
          '--source-branch',
          current.branch,
          '--target-branch',
          current.baseBranch,
          '--title',
          title,
          '--description',
          body,
          '--yes',
        ], current.root)
    const url = output.match(/https?:\/\/\S+/)?.[0]
    return {
      pushed: true,
      provider: current.provider,
      branch: current.branch,
      ...(url ? { url } : {}),
    }
  } catch (error) {
    return {
      pushed: true,
      provider: current.provider,
      branch: current.branch,
      warning: error instanceof Error ? error.message : String(error),
    }
  }
}


function changedFileStatus(value: string): TeamContributionChangedFile['status'] {
  const code = value.trim()
  if (code.includes('D')) return 'deleted'
  if (code.includes('R')) return 'renamed'
  if (code.includes('?') || code.includes('A')) return 'added'
  return 'modified'
}

/** 返回当前贡献工作区的文件列表和可审阅补丁。 */
export async function teamContributionDiff(id: string): Promise<TeamContributionDiff> {
  const current = teamContributionWorkspace(id)
  await runTeamContributionCommand('git', ['add', '--intent-to-add', '--all'], current.root)
  const status = await runTeamContributionCommand('git', ['status', '--porcelain'], current.root)
  const files = status.split('\n').flatMap((line): TeamContributionChangedFile[] => {
    if (!line.trim()) return []
    const rawPath = line.slice(3).trim()
    const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1)! : rawPath
    return [{ path, status: changedFileStatus(line.slice(0, 2)) }]
  })
  const patch = await runTeamContributionCommand(
    'git',
    ['diff', '--no-ext-diff', '--unified=3', '--', '.'],
    current.root,
  )
  return { workspace: current, files, patch: patch.slice(0, 512_000) }
}
