import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { InstallTarget } from '../../../shared/ipc.js'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
import type { BatchAction, BatchItem, BatchRequest } from '@/lib/skill-action-types'
import { pathBasename } from '@/lib/paths'
import { manageableSkillInstallations } from '@/lib/skill-installations'

/** 管理技能列表的选择状态、批量确认快照和批量异步写入流程。 */
export function useSkillBatchActions() {
  const { t } = useI18n()
  const {
    detectedPlatforms,
    filtered,
    platformFilter,
    projectFilter,
    ownershipFilter,
    refresh,
    installSkill,
    setEnabled,
  } = useSkills()
  const { groups, projectRoots } = useSettings()

  const batchMode = shallowRef(false)
  const selectedNames = ref<Set<string>>(new Set())
  const batchBusy = shallowRef(false)
  const batchProjectOpen = shallowRef(false)
  const batchProjectRoot = shallowRef('')
  const batchProjectAgents = ref<string[]>([])
  const batchGroupOpen = shallowRef(false)
  const batchGroupNames = ref<Set<string>>(new Set())
  const pendingBatch = ref<BatchRequest | null>(null)

  const installationFilter = computed(() => ({
    platformId: platformFilter.value,
    projectFilter: projectFilter.value,
    ownershipFilter: ownershipFilter.value,
  }))
  const selectedSkills = computed(() =>
    filtered.value.filter((skill) => selectedNames.value.has(skill.name)),
  )
  const allVisibleSelected = computed(
    () =>
      filtered.value.length > 0 &&
      filtered.value.every((skill) => selectedNames.value.has(skill.name)),
  )
  const selectedTargetCount = computed(() =>
    selectedSkills.value.reduce(
      (count, skill) =>
        count + manageableSkillInstallations(skill, installationFilter.value).length,
      0,
    ),
  )
  const projectCapablePlatforms = computed(() =>
    detectedPlatforms.value.filter((platform) => platform.hasProjectScope),
  )
  const projectOptions = computed(() =>
    projectRoots.value.map((root) => ({ value: root, label: pathBasename(root) })),
  )

  /** 筛选结果变化时移除不可见项，避免对用户当前看不到的技能执行批量操作。 */
  watch(filtered, (items) => {
    const visible = new Set(items.map((skill) => skill.name))
    const next = new Set([...selectedNames.value].filter((name) => visible.has(name)))
    if (next.size !== selectedNames.value.size) selectedNames.value = next
  })

  function setBatchMode(enabled: boolean): void {
    batchMode.value = enabled
    if (!enabled) clearSelection()
  }

  function toggleSelected(name: string): void {
    const next = new Set(selectedNames.value)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    selectedNames.value = next
  }

  function toggleSelectAll(): void {
    const next = new Set(selectedNames.value)
    if (allVisibleSelected.value) {
      for (const skill of filtered.value) next.delete(skill.name)
    } else {
      for (const skill of filtered.value) next.add(skill.name)
    }
    selectedNames.value = next
  }

  function clearSelection(): void {
    selectedNames.value = new Set()
  }

  function openBatchProject(): void {
    batchProjectRoot.value = projectRoots.value[0] ?? ''
    batchProjectAgents.value = projectCapablePlatforms.value.map((platform) => platform.id)
    batchProjectOpen.value = true
  }

  function toggleBatchProjectAgent(id: string): void {
    batchProjectAgents.value = batchProjectAgents.value.includes(id)
      ? batchProjectAgents.value.filter((agent) => agent !== id)
      : [...batchProjectAgents.value, id]
  }

  async function addSelectedToProject(): Promise<void> {
    if (!batchProjectRoot.value || batchProjectAgents.value.length === 0 || batchBusy.value) return
    batchBusy.value = true
    try {
      let completed = 0
      const failures: string[] = []
      for (const skill of selectedSkills.value) {
        const targets: InstallTarget[] = batchProjectAgents.value
          .filter(
            (agent) =>
              !skill.installations.some(
                (installation) =>
                  installation.agent === agent &&
                  installation.scope === 'project' &&
                  installation.projectRoot === batchProjectRoot.value,
              ),
          )
          .map((agent) => ({
            agent,
            scope: 'project' as const,
            projectRoot: batchProjectRoot.value,
          }))
        if (targets.length === 0) continue
        const results = await installSkill(skill.installations[0]!.skill, targets, {
          refresh: false,
        })
        completed += results.filter((result) => result.ok).length
        failures.push(
          ...results
            .filter((result) => !result.ok)
            .map((result) => `${skill.name}: ${result.error ?? ''}`),
        )
      }
      /** 循环内关闭刷新，全部写入完成后统一扫描，避免中间状态反复重建列表。 */
      await refresh({ silent: true })
      batchProjectOpen.value = false
      clearSelection()
      showToast({ message: t('batch.addProjectDone', { n: completed }) })
      if (failures.length > 0) showToast({ message: failures.filter(Boolean).join('；') })
    } catch {
      showToast({ message: t('batch.failed') })
    } finally {
      batchBusy.value = false
    }
  }

  function openBatchGroups(): void {
    batchGroupNames.value = new Set()
    batchGroupOpen.value = true
  }

  function toggleBatchGroup(name: string): void {
    const next = new Set(batchGroupNames.value)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    batchGroupNames.value = next
  }

  function addSelectedToGroups(): void {
    if (batchGroupNames.value.size === 0) return
    const names = selectedSkills.value.map((skill) => skill.name)
    let added = 0
    groups.value = groups.value.map((group) => {
      if (!batchGroupNames.value.has(group.name)) return group
      const nextSkills = [...new Set([...group.skills, ...names])]
      added += nextSkills.length - group.skills.length
      return { ...group, skills: nextSkills }
    })
    batchGroupOpen.value = false
    clearSelection()
    showToast({ message: t('batch.addGroupsDone', { n: added }) })
  }

  function requestBatch(action: BatchAction): void {
    const items = selectedSkills.value
      .map((skill): BatchItem => {
        const installations = manageableSkillInstallations(skill, installationFilter.value)
        return {
          name: skill.name,
          targets: installations.map((installation) => ({
            agent: installation.agent,
            scope: installation.scope,
            projectRoot: installation.projectRoot,
          })),
          paths: installations.map((installation) => installation.path),
        }
      })
      .filter((item) => item.targets.length > 0)
    if (items.length === 0) return
    pendingBatch.value = { action, items }
  }

  /** 执行已确认的批量请求，并在整批完成后统一刷新与清理选择状态。 */
  async function confirmBatch(): Promise<void> {
    const request = pendingBatch.value
    if (!request || batchBusy.value) return
    pendingBatch.value = null
    batchBusy.value = true
    try {
      if (request.action === 'uninstall') {
        const paths = [...new Set(request.items.flatMap((item) => item.paths))]
        const { token, results } = await window.skillsManager.trashUndoable(paths)
        const completed = results.filter((result) => result.ok).length
        const failed = results.length - completed
        if (completed > 0) {
          clearSelection()
          await refresh({ silent: true })
          showToast({
            message:
              failed > 0
                ? t('card.uninstallPartial', { completed, failed })
                : t('common.trashedN', { n: completed }),
            actionLabel: t('common.undo'),
            onAction: async () => {
              if (await window.skillsManager.undoTrash(token)) {
                await refresh({ silent: true })
                showToast({ message: t('common.restored') })
              }
            },
          })
        } else {
          showToast({ message: t('card.uninstallFailed') })
        }
        return
      }

      const enabled = request.action === 'enable'
      let completed = 0
      const failures: string[] = []
      for (const item of request.items) {
        const results = await setEnabled(item.name, item.targets, enabled, { refresh: false })
        completed += results.filter((result) => result.ok).length
        failures.push(
          ...results.filter((result) => !result.ok).map((result) => result.error ?? ''),
        )
      }
      await refresh({ silent: true })
      clearSelection()
      if (completed > 0) {
        showToast({ message: t(`batch.${request.action}Done`, { n: completed }) })
      }
      if (failures.length > 0) showToast({ message: failures.filter(Boolean).join('；') })
    } catch {
      showToast({ message: t('batch.failed') })
    } finally {
      batchBusy.value = false
    }
  }

  function updateBatchDialog(open: boolean): void {
    if (!open && !batchBusy.value) pendingBatch.value = null
  }

  /** 清理只属于普通技能列表的状态，防止其泄漏到技能包上下文。 */
  function resetBatchContext(): void {
    batchMode.value = false
    clearSelection()
    pendingBatch.value = null
    batchProjectOpen.value = false
    batchGroupOpen.value = false
  }

  return {
    batchMode,
    selectedNames,
    batchBusy,
    batchProjectOpen,
    batchProjectRoot,
    batchProjectAgents,
    batchGroupOpen,
    batchGroupNames,
    pendingBatch,
    selectedSkills,
    allVisibleSelected,
    selectedTargetCount,
    projectCapablePlatforms,
    projectOptions,
    setBatchMode,
    toggleSelected,
    toggleSelectAll,
    clearSelection,
    openBatchProject,
    toggleBatchProjectAgent,
    addSelectedToProject,
    openBatchGroups,
    toggleBatchGroup,
    addSelectedToGroups,
    requestBatch,
    confirmBatch,
    updateBatchDialog,
    resetBatchContext,
  }
}
