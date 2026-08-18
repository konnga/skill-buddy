import { computed, ref, shallowRef, watch, type DeepReadonly } from 'vue'
import type {
  TeamLibraryBundleDraft,
  TeamLibraryMcpDraft,
  TeamLibraryPolicy,
  TeamLibrarySkillDraft,
} from '../../../shared/ipc.js'
import { teamLibraryConfigKey } from '../../../shared/team-library.js'
import { useSettings } from '@/composables/useSettings'
import { useTeamLibraryManagement } from '@/composables/useTeamLibraryManagement'
import { fetchMarketSkillSource, matchMarketSkill, type MarketItem } from '@/lib/market'

export type TeamLibraryTab = 'skills' | 'mcp' | 'bundles' | 'policy' | 'changes'

export interface TeamPolicyForm {
  requiredSkills: string
  requiredMcp: string
  recommendedSkills: string
  recommendedMcp: string
  blocked: string
}

export function useTeamLibraryWorkspaceEditor() {
  const { teamLibraries } = useSettings()
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
  const mcpMarketOpen = shallowRef(false)
  const mcpMarketBusy = shallowRef(false)
  const mcpMarketError = shallowRef<string | null>(null)
  const bundleDialogOpen = shallowRef(false)
  const bundleError = shallowRef<string | null>(null)
  const policyScope = shallowRef('organization')
  const newTeamId = shallowRef('')
  const newTeamName = shallowRef('')
  const editingSkill = shallowRef<TeamLibrarySkillDraft | null>(null)
  const editingMcp = shallowRef<TeamLibraryMcpDraft | null>(null)
  const editingBundle = shallowRef<TeamLibraryBundleDraft | null>(null)
  const policy = ref<TeamPolicyForm>({
    requiredSkills: '',
    requiredMcp: '',
    recommendedSkills: '',
    recommendedMcp: '',
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
    { value: 'organization', label: '组织规范' },
    ...(catalog.value?.manifest.teams.map((team) => ({
      value: team.id,
      label: `团队 · ${team.name}`,
    })) ?? []),
    { value: '__new__', label: '新建团队规范…' },
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
          required: { skills: [], mcp: [] },
          recommended: { skills: [], mcp: [] },
          blocked: [],
        })
        return
      }
      loadPolicy(
        scope === 'organization'
          ? value.policy
          : (value.teamPolicies[scope] ?? {
              required: { skills: [], mcp: [] },
              recommended: { skills: [], mcp: [] },
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

  function createBundle(): void {
    editingBundle.value = null
    bundleError.value = null
    bundleDialogOpen.value = true
  }

  function openSkillMarket(): void {
    skillMarketError.value = null
    skillMarketOpen.value = true
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
      if (!found) throw new Error('市场资源中没有找到可导入的 Skill')
      if (existingSkillNames.value.includes(found.skill.name)) {
        throw new Error(`团队草稿中已存在同名 Skill：${found.skill.name}`)
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
      mcpMarketError.value = `团队草稿中已存在同名 MCP Server：${input.definition.name}`
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
      bundleError.value = manager.error.value ?? '保存岗位包失败，请稍后重试'
    }
  }

  function closeBundleDialog(): void {
    if (manager.busy.value) return
    bundleDialogOpen.value = false
    bundleError.value = null
  }

  async function remove(path: string, label: string): Promise<void> {
    const confirmed = await window.skillsManager.confirmDialog({
      title: `删除${label}`,
      message: `将从当前变更分支删除 ${path}。被岗位包引用时会同步移除该引用。`,
      confirmLabel: '删除',
      cancelLabel: '取消',
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
        },
        recommended: {
          skills: list(policy.value.recommendedSkills),
          mcp: list(policy.value.recommendedMcp),
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
    bundleDialogOpen,
    editingBundle,
    bundleError,
    skillMarketOpen,
    skillMarketBusy,
    skillMarketError,
    mcpMarketOpen,
    mcpMarketBusy,
    mcpMarketError,
    existingMcpNames,
    start,
    editSkill,
    saveSkill,
    editMcp,
    saveMcp,
    createBundle,
    editBundle,
    saveBundle,
    closeBundleDialog,
    openSkillMarket,
    addMarketSkill,
    openMcpMarket,
    addMarketMcp,
    remove,
    savePolicy,
  }
}
