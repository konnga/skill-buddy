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
  const { installSkill, detectedPlatforms, refresh } = useSkills()
  const { groups } = useSettings()
  const { t } = useI18n()
  const item = computed(() => toValue(options.item))
  const targets = ref<InstallTarget[]>([])
  const busy = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const selectedGroups = shallowRef(new Set<string>())
  const overviewLoading = shallowRef(true)
  const matched = shallowRef<FoundSkill | null>(null)
  const sourceRoot = shallowRef<string | null>(null)
  let sourceRequestId = 0

  const overviewContent = computed(() => matched.value?.skill.content ?? null)
  const groupSkillName = computed(() => matched.value?.skill.name ?? item.value.name)
  const groupOptions = computed<MarketGroupOption[]>(() =>
    groups.value.map((group) => ({
      name: group.name,
      member: group.skills.includes(groupSkillName.value),
    })),
  )

  async function cleanupSourceRoot(): Promise<void> {
    const root = sourceRoot.value
    sourceRoot.value = null
    if (root) await window.skillsManager.cleanupImport(root).catch(() => undefined)
  }

  /** 条目切换后丢弃旧源码结果，并清理迟到的临时目录。 */
  async function loadSource(): Promise<void> {
    const requestId = ++sourceRequestId
    overviewLoading.value = true
    matched.value = null
    await cleanupSourceRoot()
    try {
      const requestedItem = item.value
      const result = await fetchMarketSkillSource(requestedItem)
      if (requestId !== sourceRequestId || requestedItem.key !== item.value.key) {
        await window.skillsManager.cleanupImport(result.root).catch(() => undefined)
        return
      }
      sourceRoot.value = result.root
      matched.value = matchMarketSkill(requestedItem, result.items) ?? null
    } catch {
      if (requestId === sourceRequestId) matched.value = null
    } finally {
      if (requestId === sourceRequestId) overviewLoading.value = false
    }
  }

  function setTargets(value: InstallTarget[]): void {
    targets.value = value
  }

  function toggleGroup(name: string): void {
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
    let added = 0
    groups.value = groups.value.map((group) => {
      if (!selectedGroups.value.has(group.name) || group.skills.includes(skillName)) return group
      added += 1
      return { ...group, skills: [...group.skills, skillName] }
    })
    selectedGroups.value = new Set()
    if (added > 0) showToast({ message: t('market.addedToGroups', { n: added }) })
  }

  /** 优先复用概览源码；概览失败时只为本次安装重新下载并清理。 */
  async function install(): Promise<void> {
    const requestedTargets = targets.value.map((target) => ({ ...target }))
    if (requestedTargets.length === 0) return
    busy.value = true
    error.value = null
    let temporaryRoot: string | null = null
    try {
      let found = matched.value
      if (!found) {
        const requestedItem = item.value
        const result = await fetchMarketSkillSource(requestedItem)
        temporaryRoot = result.root
        found = matchMarketSkill(requestedItem, result.items) ?? null
      }
      if (!found) {
        error.value = t('market.notFound')
        return
      }
      const results = await installSkill(found.skill, requestedTargets)
      const failed = results.filter((result) => !result.ok)
      if (failed.length > 0) {
        error.value = failed
          .map((result) => `${agentLabel(result.target.agent)}: ${result.error}`)
          .join('；')
        return
      }
      await refresh()
      options.onInstalled()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (temporaryRoot) {
        await window.skillsManager.cleanupImport(temporaryRoot).catch(() => undefined)
      }
      busy.value = false
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
      selectedGroups.value = new Set()
      error.value = null
      void loadSource()
    },
  )

  onBeforeUnmount(() => {
    sourceRequestId += 1
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
    groupOptions,
    setTargets,
    toggleGroup,
    addToSelectedGroups,
    install,
  }
}
