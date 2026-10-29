import { computed, ref, shallowRef, watch, type DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AggregatedMcpServer, AggregatedSkill } from '@skillbuddy/core'
import type {
  InstructionDocument,
  TeamLibraryBundleDraft,
  TeamLibraryInstructionDraft,
  TeamLibraryMcpDraft,
  TeamLibraryPolicy,
  TeamLibrarySkillDraft,
} from '#shared/ipc'
import { teamLibraryConfigKey } from '#shared/team-library'
import { useSettings, type SkillGroup } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { useTeamLibraryManagement } from '@/composables/useTeamLibraryManagement'
import { fetchMarketSkillSource, matchMarketSkill, type MarketItem } from '@/lib/market'
import { showToast } from '@/composables/useToast'
import { confirmDialog } from '@/composables/useConfirm'

export type TeamLibraryTab = 'skills' | 'mcp' | 'instructions' | 'bundles' | 'policy' | 'changes'

/** 团队库资源 ID 走主进程的 kebab-case 校验，并且直接用作文件名。 */
function toKebab(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** 取一个当前草稿里没占用的 ID，冲突时追加 -2、-3… */
function uniqueId(base: string, fallback: string, taken: Set<string>): string {
  const root = base || fallback
  if (!taken.has(root)) return root
  let index = 2
  while (taken.has(`${root}-${index}`)) index += 1
  return `${root}-${index}`
}

export interface TeamPolicyForm {
  requiredSkills: string
  requiredMcp: string
  recommendedSkills: string
  recommendedMcp: string
  requiredInstructions: string
  recommendedInstructions: string
  blocked: string
}

export function useTeamLibraryWorkspaceEditor() {
  const { t } = useI18n()
  const { teamLibraries } = useSettings()
  const { skills: localSkills, refresh: refreshLocalSkills } = useSkills()
  const manager = useTeamLibraryManagement()
  const activeTab = shallowRef<TeamLibraryTab>('skills')
  const libraryKey = shallowRef(
    teamLibraries.value[0] ? teamLibraryConfigKey(teamLibraries.value[0]) : '',
  )
  const branchSlug = shallowRef('manage-team-library')
  const skillDialogOpen = shallowRef(false)
  const mcpDialogOpen = shallowRef(false)
  const skillMarketOpen = shallowRef(false)
  const skillMarketBusy = shallowRef(false)
  const skillMarketError = shallowRef<string | null>(null)
  const localSkillOpen = shallowRef(false)
  const localSkillBusy = shallowRef(false)
  const localSkillError = shallowRef<string | null>(null)
  const localMcpOpen = shallowRef(false)
  const localInstructionOpen = shallowRef(false)
  const localInstructionBusy = shallowRef(false)
  const mcpMarketOpen = shallowRef(false)
  const mcpMarketBusy = shallowRef(false)
  const mcpMarketError = shallowRef<string | null>(null)
  const bundleDialogOpen = shallowRef(false)
  const instructionDialogOpen = shallowRef(false)
  const bundleError = shallowRef<string | null>(null)
  const localBundleOpen = shallowRef(false)
  const localBundleBusy = shallowRef(false)
  const policyScope = shallowRef('organization')
  const newTeamId = shallowRef('')
  const newTeamName = shallowRef('')
  const editingSkill = shallowRef<TeamLibrarySkillDraft | null>(null)
  const editingMcp = shallowRef<TeamLibraryMcpDraft | null>(null)
  const editingBundle = shallowRef<TeamLibraryBundleDraft | null>(null)
  const editingInstruction = shallowRef<TeamLibraryInstructionDraft | null>(null)
  const policy = ref<TeamPolicyForm>({
    requiredSkills: '',
    requiredMcp: '',
    recommendedSkills: '',
    recommendedMcp: '',
    requiredInstructions: '',
    recommendedInstructions: '',
    blocked: '',
  })

  const libraryOptions = computed(() =>
    teamLibraries.value.map((item) => ({
      value: teamLibraryConfigKey(item),
      label: item.remoteUrl,
    })),
  )
  const selectedConfig = computed(
    () =>
      teamLibraries.value.find((item) => teamLibraryConfigKey(item) === libraryKey.value) ?? null,
  )
  const canStart = computed(
    () => selectedConfig.value !== null && branchSlug.value.trim().length > 0,
  )
  const catalog = computed(() => manager.catalog.value)
  const policyOptions = computed(() => [
    { value: 'organization', label: t('team.policyOrganization') },
    ...(catalog.value?.manifest.teams.map((team) => ({
      value: team.id,
      label: t('team.policyTeam', { name: team.name }),
    })) ?? []),
    { value: '__new__', label: t('team.policyNewTeam') },
  ])
  const existingSkillNames = computed(
    () => catalog.value?.skills.map((item) => item.name) ?? [],
  )
  const existingMcpNames = computed(
    () => catalog.value?.mcpServers.map((item) => item.name) ?? [],
  )

  watch(
    libraryOptions,
    (options) => {
      if (!options.some((option) => option.value === libraryKey.value)) {
        libraryKey.value = options[0]?.value ?? ''
      }
    },
    { immediate: true },
  )

  function loadPolicy(value: DeepReadonly<TeamLibraryPolicy>): void {
    policy.value = {
      requiredSkills: value.required.skills.join('\n'),
      requiredMcp: value.required.mcp.join('\n'),
      recommendedSkills: value.recommended.skills.join('\n'),
      recommendedMcp: value.recommended.mcp.join('\n'),
      requiredInstructions: value.required.instructions.join('\n'),
      recommendedInstructions: value.recommended.instructions.join('\n'),
      blocked: value.blocked
        .map((item) => `${item.ref} | ${item.versions ?? ''} | ${item.reason}`)
        .join('\n'),
    }
  }

  watch(
    [catalog, policyScope],
    ([value, scope]) => {
      if (!value) return
      if (scope === '__new__') {
        newTeamId.value = ''
        newTeamName.value = ''
        loadPolicy({
          required: { skills: [], mcp: [], instructions: [] },
          recommended: { skills: [], mcp: [], instructions: [] },
          blocked: [],
        })
        return
      }
      loadPolicy(
        scope === 'organization'
          ? value.policy
          : (value.teamPolicies[scope] ?? {
              required: { skills: [], mcp: [], instructions: [] },
              recommended: { skills: [], mcp: [], instructions: [] },
              blocked: [],
            }),
      )
    },
    { immediate: true },
  )

  function list(value: string): string[] {
    return value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  async function start(): Promise<void> {
    if (!selectedConfig.value) return
    await manager.start(selectedConfig.value, branchSlug.value)
  }

  async function editSkill(path: string): Promise<void> {
    if (!manager.workspace.value) return
    try {
      editingSkill.value = await window.skillsManager.teamContributionGetSkill(
        manager.workspace.value.id,
        path,
      )
      skillDialogOpen.value = true
    } catch (cause) {
      manager.reportError(cause)
    }
  }

  async function saveSkill(input: TeamLibrarySkillDraft): Promise<void> {
    if (await manager.saveSkill(input)) skillDialogOpen.value = false
  }

  async function editMcp(path: string): Promise<void> {
    if (!manager.workspace.value) return
    try {
      editingMcp.value = await window.skillsManager.teamContributionGetMcp(
        manager.workspace.value.id,
        path,
      )
      mcpDialogOpen.value = true
    } catch (cause) {
      manager.reportError(cause)
    }
  }

  async function saveMcp(input: TeamLibraryMcpDraft): Promise<void> {
    if (await manager.saveMcp(input)) mcpDialogOpen.value = false
  }

  function openLocalMcp(): void {
    localMcpOpen.value = true
  }

  /**
   * 本地 MCP 配置里的 name 未必符合团队库的 kebab-case 约束（且直接做文件名），
   * 这里规范一下再预填，改过名会提示。
   */
  function addLocalMcp(server: AggregatedMcpServer): void {
    localMcpOpen.value = false
    const definition = server.installations[0]?.definition
    if (!definition) {
      showToast.error(t('team.localMcpMissingDefinition', { name: server.name }))
      return
    }
    if (existingMcpNames.value.includes(server.name)) {
      showToast.warning(t('team.duplicateDraftMcp', { name: server.name }))
      return
    }
    const name = toKebab(server.name) || 'mcp-server'
    if (name !== server.name) {
      showToast.info(t('team.localMcpRenamed', { from: server.name, to: name }))
    }
    editingMcp.value = {
      description: definition.description ?? '',
      definition: { ...definition, name },
    }
    mcpDialogOpen.value = true
  }

  function createInstruction(): void {
    editingInstruction.value = null
    instructionDialogOpen.value = true
  }

  function openLocalInstructions(): void {
    localInstructionOpen.value = true
  }

  /**
   * 本地指令文件按需读内容（扫描结果不带正文），再预填成团队库模板。
   * target 取原文件名，导入后落到同名文件。
   */
  async function addLocalInstruction(document: InstructionDocument): Promise<void> {
    if (!manager.workspace.value) return
    localInstructionBusy.value = true
    try {
      const result = await window.skillsManager.readInstruction({ path: document.path })
      if (result.truncated) {
        showToast.warning(t('team.localInstructionTruncated', { name: document.fileName }))
      }
      const name = document.fileName.replace(/\.md$/i, '') || document.fileName
      const taken = new Set((catalog.value?.instructions ?? []).map((item) => item.id))
      editingInstruction.value = {
        id: uniqueId(toKebab(name), 'instruction', taken),
        name,
        description: '',
        target: document.fileName,
        content: result.content,
      }
      localInstructionOpen.value = false
      instructionDialogOpen.value = true
    } catch (cause) {
      showToast.error(cause instanceof Error ? cause.message : String(cause))
    } finally {
      localInstructionBusy.value = false
    }
  }

  async function editInstruction(path: string): Promise<void> {
    if (!manager.workspace.value) return
    try {
      editingInstruction.value = await window.skillsManager.teamContributionGetInstruction(
        manager.workspace.value.id,
        path,
      )
      instructionDialogOpen.value = true
    } catch (cause) {
      manager.reportError(cause)
    }
  }

  async function saveInstruction(input: TeamLibraryInstructionDraft): Promise<void> {
    if (await manager.saveInstruction(input)) instructionDialogOpen.value = false
  }

  function createBundle(): void {
    editingBundle.value = null
    bundleError.value = null
    bundleDialogOpen.value = true
  }

  function openLocalBundles(): void {
    localBundleOpen.value = true
  }

  /** 团队库岗位包 ID 必须是 kebab-case；中文技能包名转不出来时退回 bundle-N。 */
  function bundleIdFrom(name: string): string {
    const taken = new Set((catalog.value?.bundles ?? []).map((item) => item.id))
    return uniqueId(toKebab(name), 'bundle', taken)
  }

  /**
   * 本地技能包按 Skill 名称记录成员，团队库岗位包按目录路径引用。
   *
   * 草稿里已有的直接映射；草稿里没有但本机装了的，顺带导入一份（与 Skills 页
   * 「从本地添加」同一条链路）；两边都没有的才记为缺失。
   */
  async function createBundleFromLocal(group: SkillGroup): Promise<void> {
    if (!manager.workspace.value) return
    localBundleBusy.value = true
    try {
      if (localSkills.value.length === 0) await refreshLocalSkills({ silent: true })
      const pathByName = new Map(
        (catalog.value?.skills ?? []).map((item) => [item.name.toLowerCase(), item.path]),
      )
      const localByName = new Map(localSkills.value.map((item) => [item.name.toLowerCase(), item]))
      const skillPaths: string[] = []
      const imported: string[] = []
      const missing: string[] = []
      for (const name of group.skills) {
        const key = name.toLowerCase()
        const existing = pathByName.get(key)
        if (existing) {
          skillPaths.push(existing)
          continue
        }
        const local = localByName.get(key)
        const sourcePath = local ? localSkillSource(local) : null
        if (!sourcePath) {
          missing.push(name)
          continue
        }
        const result = await manager.importSkill({ sourcePath })
        if (result) {
          skillPaths.push(result.path)
          imported.push(name)
        } else {
          missing.push(name)
        }
      }
      if (imported.length > 0) {
        showToast.success(t('team.localBundleImported', { n: imported.length }))
      }
      if (missing.length > 0) {
        showToast.warning(
          t('team.localBundleSkipped', { n: missing.length, names: missing.join('、') }),
        )
      }
      editingBundle.value = {
        id: bundleIdFrom(group.name),
        name: group.name,
        description: group.description ?? '',
        skills: skillPaths,
        mcp: [],
      }
      bundleError.value = null
      localBundleOpen.value = false
      bundleDialogOpen.value = true
    } finally {
      localBundleBusy.value = false
    }
  }

  function openSkillMarket(): void {
    skillMarketError.value = null
    skillMarketOpen.value = true
  }

  function openLocalSkills(): void {
    localSkillError.value = null
    localSkillOpen.value = true
  }

  /**
   * 本地 Skill 可能同时装在多个 Agent 下，优先取可读写且启用的那份；
   * 团队库导入需要的是包含 SKILL.md 的目录。
   */
  function localSkillSource(skill: AggregatedSkill): string | null {
    const installation =
      skill.installations.find((item) => !item.readOnly && item.enabled !== false) ??
      skill.installations.find((item) => item.enabled !== false) ??
      skill.installations[0]
    return installation?.path ?? null
  }

  async function addLocalSkill(skill: AggregatedSkill): Promise<void> {
    if (!manager.workspace.value) return
    localSkillError.value = null
    if (existingSkillNames.value.includes(skill.name)) {
      localSkillError.value = t('team.duplicateDraftSkill', { name: skill.name })
      return
    }
    const sourcePath = localSkillSource(skill)
    if (!sourcePath) {
      localSkillError.value = t('team.localSkillMissingPath', { name: skill.name })
      return
    }
    localSkillBusy.value = true
    try {
      const mutation = await manager.importSkill({ sourcePath })
      if (mutation) localSkillOpen.value = false
      else localSkillError.value = manager.error.value
    } finally {
      localSkillBusy.value = false
    }
  }

  function openMcpMarket(): void {
    mcpMarketError.value = null
    mcpMarketOpen.value = true
  }

  async function addMarketSkill(item: MarketItem): Promise<void> {
    if (!manager.workspace.value) return
    skillMarketBusy.value = true
    skillMarketError.value = null
    let root: string | null = null
    try {
      const result = await fetchMarketSkillSource(item)
      root = result.root
      const found = matchMarketSkill(item, result.items)
      if (!found) throw new Error(t('team.marketSkillNotFound'))
      if (existingSkillNames.value.includes(found.skill.name)) {
        throw new Error(t('team.duplicateDraftSkill', { name: found.skill.name }))
      }
      const mutation = await manager.importSkill({ sourcePath: found.dir })
      if (mutation) skillMarketOpen.value = false
      else skillMarketError.value = manager.error.value
    } catch (cause) {
      skillMarketError.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (root) await window.skillsManager.cleanupImport(root)
      skillMarketBusy.value = false
    }
  }

  async function addMarketMcp(input: TeamLibraryMcpDraft): Promise<void> {
    if (!manager.workspace.value) return
    mcpMarketBusy.value = true
    mcpMarketError.value = null
    if (existingMcpNames.value.includes(input.definition.name)) {
      mcpMarketError.value = t('team.duplicateDraftMcp', { name: input.definition.name })
      mcpMarketBusy.value = false
      return
    }
    const mutation = await manager.saveMcp(input)
    if (mutation) mcpMarketOpen.value = false
    else mcpMarketError.value = manager.error.value
    mcpMarketBusy.value = false
  }

  function editBundle(item: NonNullable<typeof catalog.value>['bundles'][number]): void {
    editingBundle.value = {
      originalPath: item.path,
      id: item.id,
      name: item.name,
      description: item.description,
      version: item.version,
      skills: [...item.skills],
      mcp: [...item.mcpServers],
    }
    bundleError.value = null
    bundleDialogOpen.value = true
  }

  async function saveBundle(input: TeamLibraryBundleDraft): Promise<void> {
    bundleError.value = null
    if (await manager.saveBundle(input)) {
      bundleDialogOpen.value = false
    } else {
      bundleError.value = manager.error.value ?? t('team.bundleSaveFailed')
    }
  }

  function closeBundleDialog(): void {
    if (manager.busy.value) return
    bundleDialogOpen.value = false
    bundleError.value = null
  }

  async function remove(path: string, label: string): Promise<void> {
    const confirmed = await confirmDialog({
      title: t('team.removeAssetTitle', { label }),
      message: t('team.removeAssetMessage', { path }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    })
    if (confirmed) await manager.remove(path)
  }

  async function savePolicy(): Promise<void> {
    const blocked = policy.value.blocked.split('\n').flatMap((line) => {
      const [ref, versions, reason] = line.split('|').map((item) => item.trim())
      return ref && reason ? [{ ref, ...(versions ? { versions } : {}), reason }] : []
    })
    const scope = policyScope.value
    const team =
      scope === 'organization'
        ? null
        : scope === '__new__'
          ? { id: newTeamId.value.trim(), name: newTeamName.value.trim() }
          : {
              id: scope,
              name:
                catalog.value?.manifest.teams.find((item) => item.id === scope)?.name ?? scope,
            }
    const result = await manager.savePolicy({
      ...(team
        ? { scope: 'team' as const, teamId: team.id, teamName: team.name }
        : { scope: 'organization' as const }),
      policy: {
        required: {
          skills: list(policy.value.requiredSkills),
          mcp: list(policy.value.requiredMcp),
          instructions: list(policy.value.requiredInstructions),
        },
        recommended: {
          skills: list(policy.value.recommendedSkills),
          mcp: list(policy.value.recommendedMcp),
          instructions: list(policy.value.recommendedInstructions),
        },
        blocked,
      },
    })
    if (result && scope === '__new__') policyScope.value = newTeamId.value.trim()
  }

  return {
    manager,
    activeTab,
    libraryKey,
    branchSlug,
    libraryOptions,
    canStart,
    catalog,
    policy,
    policyScope,
    policyOptions,
    newTeamId,
    newTeamName,
    skillDialogOpen,
    editingSkill,
    mcpDialogOpen,
    editingMcp,
    instructionDialogOpen,
    editingInstruction,
    bundleDialogOpen,
    editingBundle,
    bundleError,
    skillMarketOpen,
    skillMarketBusy,
    skillMarketError,
    localSkillOpen,
    localSkillBusy,
    localSkillError,
    localMcpOpen,
    localInstructionOpen,
    localInstructionBusy,
    existingSkillNames,
    mcpMarketOpen,
    mcpMarketBusy,
    mcpMarketError,
    existingMcpNames,
    start,
    editSkill,
    saveSkill,
    editMcp,
    saveMcp,
    openLocalMcp,
    addLocalMcp,
    createInstruction,
    editInstruction,
    saveInstruction,
    openLocalInstructions,
    addLocalInstruction,
    createBundle,
    editBundle,
    saveBundle,
    closeBundleDialog,
    localBundleOpen,
    localBundleBusy,
    openLocalBundles,
    createBundleFromLocal,
    openSkillMarket,
    openLocalSkills,
    addLocalSkill,
    addMarketSkill,
    openMcpMarket,
    addMarketMcp,
    remove,
    savePolicy,
  }
}
