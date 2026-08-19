import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'
import { useI18n } from 'vue-i18n'
import type { FoundSkill } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
import { agentLabel } from '@/lib/agents'
import {
  fetchMarketSkillSource,
  matchMarketSkill,
  marketSkillSource,
  type MarketItem,
} from '@/lib/market'

export interface MarketGroupOption {
  name: string
  member: boolean
}

interface UseMarketSkillDetailOptions {
  item: MaybeRefOrGetter<MarketItem>
  onInstalled: () => void
}

export function useMarketSkillDetail(options: UseMarketSkillDetailOptions) {
  const { installSkill, detectedPlatforms } = useSkills()
  const { groups, marketSkillSources } = useSettings()
  const { t } = useI18n()
  const item = computed(() => toValue(options.item))
  const targets = ref<InstallTarget[]>([])
  const busy = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const selectedGroups = shallowRef(new Set<string>())
  const overviewLoading = shallowRef(true)
  const matched = shallowRef<FoundSkill | null>(null)
  const sourceRoot = shallowRef<string | null>(null)
  const matchedItemKey = shallowRef<string | null>(null)
  let sourceRequestId = 0
  let installRequestId = 0
  let disposed = false
  const activeInstallRoots = new Set<string>()
  const pendingCleanupRoots = new Set<string>()

  const overviewContent = computed(() =>
    matchedItemKey.value === item.value.key ? (matched.value?.skill.content ?? null) : null,
  )
  const groupSkillName = computed<string | null>(() =>
    matchedItemKey.value === item.value.key
      ? (matched.value?.skill.name ?? null)
      : null,
  )
  const groupSkillSource = computed(() => marketSkillSource(item.value))
  const groupOptions = computed<MarketGroupOption[]>(() =>
    groups.value.map((group) => ({
      name: group.name,
      member: groupSkillName.value !== null && group.skills.includes(groupSkillName.value),
    })),
  )

  /** 安装仍在读取资源时延迟删除源码目录，避免主进程复制到一半失去源文件。 */
  async function cleanupRoot(root: string): Promise<void> {
    if (activeInstallRoots.has(root)) {
      pendingCleanupRoots.add(root)
      return
    }
    await window.skillsManager.cleanupImport(root).catch(() => undefined)
  }

  async function cleanupSourceRoot(): Promise<void> {
    const root = sourceRoot.value
    sourceRoot.value = null
    if (root) await cleanupRoot(root)
  }

  async function releaseInstallRoot(root: string | null): Promise<void> {
    if (!root) return
    activeInstallRoots.delete(root)
    if (!pendingCleanupRoots.delete(root)) return
    await window.skillsManager.cleanupImport(root).catch(() => undefined)
  }

  /** 条目切换后丢弃旧源码结果，并清理迟到的临时目录。 */
  async function loadSource(): Promise<void> {
    const requestId = ++sourceRequestId
    const requestedItem = item.value
    overviewLoading.value = true
    matched.value = null
    matchedItemKey.value = null
    await cleanupSourceRoot()
    if (requestId !== sourceRequestId || requestedItem.key !== item.value.key) return
    try {
      const result = await fetchMarketSkillSource(requestedItem)
      if (requestId !== sourceRequestId || requestedItem.key !== item.value.key) {
        await window.skillsManager.cleanupImport(result.root).catch(() => undefined)
        return
      }
      sourceRoot.value = result.root
      matched.value = matchMarketSkill(requestedItem, result.items) ?? null
      matchedItemKey.value = requestedItem.key
    } catch {
      if (requestId === sourceRequestId) {
        matched.value = null
        matchedItemKey.value = null
      }
    } finally {
      if (requestId === sourceRequestId) overviewLoading.value = false
    }
  }

  function setTargets(value: InstallTarget[]): void {
    targets.value = value
  }

  function toggleGroup(name: string): void {
    if (!groupSkillName.value || !groupSkillSource.value) return
    if (groupOptions.value.find((group) => group.name === name)?.member) return
    const next = new Set(selectedGroups.value)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    selectedGroups.value = next
  }

  /** 将 Skill 追加到用户选择的技能包中，不触发任何 Agent 安装。 */
  function addToSelectedGroups(): void {
    if (selectedGroups.value.size === 0) return
    const skillName = groupSkillName.value
    const source = groupSkillSource.value
    if (!skillName || !source) return
    let added = 0
    groups.value = groups.value.map((group) => {
      if (!selectedGroups.value.has(group.name) || group.skills.includes(skillName)) return group
      added += 1
      return { ...group, skills: [...group.skills, skillName] }
    })
    const sources = { ...marketSkillSources.value }
    for (const groupName of selectedGroups.value) {
      sources[groupName] = { ...sources[groupName], [skillName]: source }
    }
    marketSkillSources.value = sources
    selectedGroups.value = new Set()
    if (added > 0) showToast({ message: t('market.addedToGroups', { n: added }) })
  }

  /** 优先复用概览源码；概览失败时只为本次安装重新下载并清理。 */
  async function install(): Promise<void> {
    if (busy.value) return
    const requestedTargets = targets.value.map((target) => ({ ...target }))
    if (requestedTargets.length === 0) return
    const requestedItem = item.value
    const requestId = ++installRequestId
    busy.value = true
    error.value = null
    let temporaryRoot: string | null = null
    let installRoot: string | null = null
    try {
      let found = matchedItemKey.value === requestedItem.key ? matched.value : null
      if (found && sourceRoot.value) {
        installRoot = sourceRoot.value
        activeInstallRoots.add(installRoot)
      }
      if (!found) {
        const result = await fetchMarketSkillSource(requestedItem)
        temporaryRoot = result.root
        if (
          disposed ||
          requestId !== installRequestId ||
          requestedItem.key !== item.value.key
        ) return
        found = matchMarketSkill(requestedItem, result.items) ?? null
      }
      if (!found) {
        if (requestId === installRequestId) error.value = t('market.notFound')
        return
      }
      const results = await installSkill(found.skill, requestedTargets)
      const failed = results.filter((result) => !result.ok)
      if (failed.length > 0) {
        if (requestId === installRequestId) {
          error.value = failed
            .map((result) => `${agentLabel(result.target.agent)}: ${result.error}`)
            .join('；')
        }
        return
      }
      if (
        !disposed &&
        requestId === installRequestId &&
        requestedItem.key === item.value.key
      ) {
        options.onInstalled()
      }
    } catch (cause) {
      if (requestId === installRequestId) {
        error.value = cause instanceof Error ? cause.message : String(cause)
      }
    } finally {
      if (temporaryRoot) {
        await window.skillsManager.cleanupImport(temporaryRoot).catch(() => undefined)
      }
      await releaseInstallRoot(installRoot)
      if (requestId === installRequestId) busy.value = false
    }
  }

  onMounted(() => {
    targets.value = detectedPlatforms.value.map((platform) => ({
      agent: platform.id,
      scope: 'user',
    }))
    void loadSource()
  })

  watch(
    () => item.value.key,
    () => {
      installRequestId += 1
      busy.value = false
      selectedGroups.value = new Set()
      error.value = null
      void loadSource()
    },
  )

  onBeforeUnmount(() => {
    disposed = true
    sourceRequestId += 1
    installRequestId += 1
    void cleanupSourceRoot()
  })

  return {
    targets,
    busy,
    error,
    selectedGroups,
    overviewLoading,
    matched,
    overviewContent,
    groupSkillName,
    groupSkillSource,
    groupOptions,
    setTargets,
    toggleGroup,
    addToSelectedGroups,
    install,
  }
}
