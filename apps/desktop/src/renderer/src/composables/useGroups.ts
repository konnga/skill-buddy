import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { planAdditiveInstall, targetKey } from '@skillbuddy/core/planners'
import type { InstallTarget } from '#shared/ipc'
import { showToast } from '@/composables/useToast'
import { useSettings, type SkillGroup } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { agentLabel } from '@/lib/agents'
import { deriveGroupRuntimeState } from '@/lib/group-runtime'
import {
  fetchMarketSkillBySource,
  resolveMarketSkillSource,
  type MarketSkillSource,
} from '@/lib/market'
import { serializePreset } from '@/lib/preset-format'
import {
  manageableSkillInstallations,
  type SkillInstallationFilter,
} from '@/lib/skill-installations'

const groupApplyOpen = shallowRef(false)
const groupApplyTargets = ref<InstallTarget[]>([])
const groupApplyBusy = shallowRef(false)
const groupApplyNote = shallowRef<string | null>(null)
const groupToggleBusy = shallowRef(false)

/** 管理分组筛选、批量应用与临时应用的完整生命周期。 */
export function useGroups() {
  const { t } = useI18n()
  const { groups, marketSkillSources, tempApplications } = useSettings()
  const {
    groupFilter,
    skills,
    search,
    platformFilter,
    projectFilter,
    driftOnly,
    ownershipFilter,
    installSkill,
    setEnabled,
    refresh,
  } = useSkills()

  const installationFilter = computed(() => ({
    platformId: platformFilter.value,
    projectFilter: projectFilter.value,
    ownershipFilter: ownershipFilter.value,
  }))

  const activeGroupState = computed(() => {
    const group = groups.value.find((item) => item.name === groupFilter.value)
    return group
      ? deriveGroupRuntimeState(group, skills.value, installationFilter.value)
      : null
  })

  const activeTemp = computed(() =>
    groupFilter.value
      ? tempApplications.value.find((record) => record.group === groupFilter.value)
      : undefined,
  )

  function filterGroup(name: string | null): void {
    groupFilter.value = groupFilter.value === name && name !== null ? null : name
    if (name === null) search.value = ''
    groupApplyOpen.value = false
    groupApplyNote.value = null
  }

  /** 无 toggle 语义地选中合集（从管理页进入时使用，重复进入保持选中）。 */
  function openGroupFilter(name: string): void {
    groupFilter.value = name
    search.value = ''
    platformFilter.value = null
    projectFilter.value = null
    driftOnly.value = false
    ownershipFilter.value = null
    groupApplyOpen.value = false
    groupApplyNote.value = null
  }

  /** 确认后删除合集名单，并连带清理其临时应用记录（合集删除后记录再无 UI 出口）。 */
  async function deleteGroup(name: string): Promise<void> {
    const group = groups.value.find((item) => item.name === name)
    if (!group) return
    const confirmed = await window.skillsManager.confirmDialog({
      title: t('groups.deleteTitle'),
      message: t('groups.deleteConfirm', { name: group.name, n: group.skills.length }),
      confirmLabel: t('groups.deleteAction'),
      cancelLabel: t('common.cancel'),
      danger: true,
    })
    if (!confirmed) return
    groups.value = groups.value.filter((item) => item.name !== name)
    const sources = { ...marketSkillSources.value }
    delete sources[name]
    marketSkillSources.value = sources
    tempApplications.value = tempApplications.value.filter((record) => record.group !== name)
    if (groupFilter.value === name) groupFilter.value = null
  }

  /** 新建合集并写入可选初始成员；空名或重名时返回 false。 */
  function createGroup(
    name: string,
    skillNames: string[] = [],
    skillSources: Record<string, MarketSkillSource> = {},
  ): boolean {
    const trimmed = name.trim()
    if (!trimmed || groups.value.some((group) => group.name === trimmed)) return false
    const members = [...new Set(skillNames)]
    groups.value = [...groups.value, { name: trimmed, skills: members }]
    const sources = Object.fromEntries(
      Object.entries(skillSources).filter(([skillName]) => members.includes(skillName)),
    )
    if (Object.keys(sources).length > 0) {
      marketSkillSources.value = { ...marketSkillSources.value, [trimmed]: sources }
    }
    return true
  }

  /** 重命名合集并同步筛选与临时应用中的引用；与其他合集重名或空名时返回 false。 */
  function renameGroup(oldName: string, newName: string): boolean {
    const name = newName.trim()
    if (!name) return false
    if (name === oldName) return true
    if (groups.value.some((group) => group.name === name)) return false
    groups.value = groups.value.map((group) =>
      group.name === oldName ? { ...group, name } : group,
    )
    tempApplications.value = tempApplications.value.map((record) =>
      record.group === oldName ? { ...record, group: name } : record,
    )
    if (marketSkillSources.value[oldName]) {
      const sources = { ...marketSkillSources.value }
      sources[name] = sources[oldName]!
      delete sources[oldName]
      marketSkillSources.value = sources
    }
    if (groupFilter.value === oldName) groupFilter.value = name
    return true
  }

  async function exportGroup(group: SkillGroup): Promise<void> {
    try {
      await navigator.clipboard.writeText(serializePreset(group))
      showToast({ message: t('groups.exported', { name: group.name }) })
    } catch {
      showToast({ message: t('groups.exportFailed') })
    }
  }

  function groupCount(name: string | null): number {
    return groups.value.find((group) => group.name === name)?.skills.length ?? 0
  }

  /** 更新技能包成员名单；技能包不存在时返回 false。 */
  function setGroupSkills(name: string, skillNames: string[]): boolean {
    if (!groups.value.some((group) => group.name === name)) return false
    const members = [...new Set(skillNames)]
    groups.value = groups.value.map((group) =>
      group.name === name ? { ...group, skills: members } : group,
    )
    const knownSources = marketSkillSources.value[name]
    if (knownSources) {
      const sources = Object.fromEntries(
        Object.entries(knownSources).filter(([skillName]) => members.includes(skillName)),
      )
      marketSkillSources.value = { ...marketSkillSources.value, [name]: sources }
    }
    return true
  }

  interface CompletedGroupInstall {
    name: string
    target: InstallTarget
  }

  interface GroupInstallOutcome {
    completed: CompletedGroupInstall[]
    failures: string[]
    unresolved: string[]
  }

  /** 本地优先；仅在来源唯一或已记录时下载缺失成员，并统一返回实际成功目标。 */
  async function installGroupMembers(
    group: SkillGroup,
    requestedTargets: InstallTarget[],
  ): Promise<GroupInstallOutcome> {
    const plan = planAdditiveInstall(group.skills, skills.value, requestedTargets)
    const completed: CompletedGroupInstall[] = []
    const failures: string[] = []
    const unresolved: string[] = []
    const processedTargets = new Set<string>()
    let attemptedInstall = false

    async function installOne(
      name: string,
      skill: Parameters<typeof installSkill>[0],
      targets: InstallTarget[],
    ): Promise<void> {
      const freshTargets = targets.filter((target) => {
        const key = `${name}:${targetKey(target)}`
        if (processedTargets.has(key)) return false
        processedTargets.add(key)
        return true
      })
      if (freshTargets.length === 0) return
      attemptedInstall = true
      try {
        const results = await installSkill(skill, freshTargets, { refresh: false })
        completed.push(
          ...results
            .filter((result) => result.ok)
            .map((result) => ({ name, target: result.target })),
        )
        failures.push(
          ...results
            .filter((result) => !result.ok)
            .map(
              (result) =>
                `${name} → ${agentLabel(result.target.agent)}: ${result.error ?? t('batch.failed')}`,
            ),
        )
      } catch (cause) {
        failures.push(`${name}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }

    for (const { name, targets } of plan.installs) {
      const local = skills.value.find((skill) => skill.name === name)
      if (local) await installOne(name, local.installations[0]!.skill, targets)
    }

    for (const missingName of plan.missing) {
      const source = marketSkillSources.value[group.name]?.[missingName] ??
        await resolveMarketSkillSource(missingName)
      if (!source) {
        unresolved.push(missingName)
        continue
      }
      let root: string | null = null
      try {
        const fetched = await fetchMarketSkillBySource(source, missingName)
        root = fetched.root
        if (!fetched.found) {
          if (marketSkillSources.value[group.name]?.[missingName]) {
            const groupSources = { ...marketSkillSources.value[group.name] }
            delete groupSources[missingName]
            marketSkillSources.value = {
              ...marketSkillSources.value,
              [group.name]: groupSources,
            }
          }
          failures.push(`${missingName}: ${t('market.notFound')}`)
          continue
        }
        const actualName = fetched.found.skill.name
        if (actualName !== missingName) {
          failures.push(
            t('groups.sourceNameMismatch', { expected: missingName, actual: actualName }),
          )
          continue
        }
        const groupSources = { ...marketSkillSources.value[group.name], [missingName]: source }
        marketSkillSources.value = {
          ...marketSkillSources.value,
          [group.name]: groupSources,
        }
        const local = skills.value.find((skill) => skill.name === actualName)
        const targets = local
          ? requestedTargets.filter(
              (target) =>
                !local.installations.some(
                  (installation) =>
                    installation.agent === target.agent &&
                    installation.scope === target.scope &&
                    (installation.projectRoot ?? '') === (target.projectRoot ?? ''),
                ),
            )
          : requestedTargets
        await installOne(actualName, fetched.found.skill, targets)
      } catch (cause) {
        failures.push(
          `${missingName}: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      } finally {
        if (root) await window.skillsManager.cleanupImport(root).catch(() => undefined)
      }
    }

    if (attemptedInstall) await refresh({ silent: true })
    return { completed, failures, unresolved }
  }

  function applyOutcomeNote(outcome: GroupInstallOutcome): string | null {
    const messages = [...outcome.failures]
    if (outcome.unresolved.length > 0) {
      messages.push(t('groups.sourceMissing', { names: outcome.unresolved.join(', ') }))
    }
    return messages.length > 0 ? messages.join('；') : null
  }

  async function applyGroup(): Promise<void> {
    const group = groups.value.find((item) => item.name === groupFilter.value)
    if (!group || groupApplyTargets.value.length === 0) return

    groupApplyBusy.value = true
    groupApplyNote.value = null
    try {
      const targets = groupApplyTargets.value.map((target) => ({ ...target }))
      const outcome = await installGroupMembers(group, targets)
      groupApplyNote.value = applyOutcomeNote(outcome)
      if (!groupApplyNote.value) {
        groupApplyOpen.value = false
        showToast({ message: t('groups.installSuccess', { name: group.name }) })
      }
    } finally {
      groupApplyBusy.value = false
    }
  }

  async function applyGroupTemp(): Promise<void> {
    const group = groups.value.find((item) => item.name === groupFilter.value)
    if (!group || groupApplyTargets.value.length === 0) return

    groupApplyBusy.value = true
    groupApplyNote.value = null
    try {
      const targets = groupApplyTargets.value.map((target) => ({ ...target }))
      const outcome = await installGroupMembers(group, targets)
      const installed: { name: string; agent: string; scope: string; path: string }[] = []
      const pendingRecords: CompletedGroupInstall[] = []
      for (const { name, target } of outcome.completed) {
        const local = skills.value.find((skill) => skill.name === name)
        const installation = local?.installations.find(
          (item) =>
            item.agent === target.agent &&
            item.scope === target.scope &&
            (item.projectRoot ?? '') === (target.projectRoot ?? ''),
        )
        if (installation) {
          installed.push({
            name,
            agent: target.agent,
            scope: target.scope,
            path: installation.path,
          })
        } else {
          pendingRecords.push({ name, target })
        }
      }
      if (pendingRecords.length > 0) {
        await refresh({ silent: true })
        for (const { name, target } of pendingRecords) {
          const local = skills.value.find((skill) => skill.name === name)
          const installation = local?.installations.find(
            (item) =>
              item.agent === target.agent &&
              item.scope === target.scope &&
              (item.projectRoot ?? '') === (target.projectRoot ?? ''),
          )
          if (installation) {
            installed.push({
              name,
              agent: target.agent,
              scope: target.scope,
              path: installation.path,
            })
          } else {
            outcome.failures.push(
              t('groups.tempTrackingFailed', {
                name,
                target: agentLabel(target.agent),
              }),
            )
          }
        }
      }

      if (installed.length > 0) {
        const current = tempApplications.value.find((record) => record.group === group.name)
        const merged = new Map(
          [...(current?.installed ?? []), ...installed].map((item) => [item.path, item]),
        )
        tempApplications.value = [
          ...tempApplications.value.filter((record) => record.group !== group.name),
          {
            group: group.name,
            appliedAt: current?.appliedAt ?? Date.now(),
            installed: [...merged.values()],
          },
        ]
      }
      groupApplyNote.value = applyOutcomeNote(outcome)
      if (!groupApplyNote.value) groupApplyOpen.value = false
    } finally {
      groupApplyBusy.value = false
    }
  }

  async function endTemp(groupName: string): Promise<void> {
    const record = tempApplications.value.find((item) => item.group === groupName)
    if (!record) return

    groupApplyBusy.value = true
    groupApplyNote.value = null
    try {
      if (record.installed.length > 0) {
        const paths = record.installed.map((item) => item.path)
        const { token, results } = await window.skillsManager.trashUndoable(paths)
        const failed = results.filter((result) => !result.ok)
        if (failed.length > 0) {
          groupApplyNote.value = failed.map((result) => result.error).join('；')
          return
        }

        showToast({
          message: t('common.trashedN', { n: paths.length }),
          actionLabel: t('common.undo'),
          onAction: async () => {
            if (await window.skillsManager.undoTrash(token)) {
              tempApplications.value = [
                ...tempApplications.value.filter((item) => item.group !== groupName),
                record,
              ]
              await refresh()
              showToast({ message: t('common.restored') })
            }
          },
        })
      }
      tempApplications.value = tempApplications.value.filter((item) => item.group !== groupName)
      await refresh()
    } finally {
      groupApplyBusy.value = false
    }
  }

  /** 按给定安装视图启用或禁用合集内的所有可写安装。 */
  async function toggleGroupInstallations(
    group: SkillGroup,
    enabled: boolean,
    filter: SkillInstallationFilter,
    confirmMessageKey: string,
  ): Promise<void> {
    if (groupToggleBusy.value) return

    const targets = group.skills.flatMap((name) => {
      const skill = skills.value.find((item) => item.name === name)
      if (!skill) return []
      const installations = manageableSkillInstallations(skill, filter)
      return installations.length > 0
        ? [{
            name,
            targets: installations.map((installation) => ({
              agent: installation.agent,
              scope: installation.scope,
              projectRoot: installation.projectRoot,
            })),
          }]
        : []
    })
    if (targets.length === 0) return

    const installationCount = targets.reduce((count, item) => count + item.targets.length, 0)
    const action = enabled ? 'enable' : 'disable'
    const confirmed = await window.skillsManager.confirmDialog({
      title: t(`groups.${action}Title`),
      message: t(confirmMessageKey, {
        name: group.name,
        skills: targets.length,
        installations: installationCount,
      }),
      confirmLabel: t(`groups.${action}Action`),
      cancelLabel: t('common.cancel'),
      danger: !enabled,
    })
    if (!confirmed) return

    groupToggleBusy.value = true
    try {
      let completed = 0
      const failures: string[] = []
      for (const item of targets) {
        const results = await setEnabled(item.name, item.targets, enabled, { refresh: false })
        completed += results.filter((result) => result.ok).length
        failures.push(
          ...results
            .filter((result) => !result.ok)
            .map((result) => result.error ?? '')
            .filter(Boolean),
        )
      }
      if (completed > 0) {
        showToast({ message: t(`groups.${action}Done`, { n: completed }) })
      }
      if (failures.length > 0) showToast({ message: failures.join('；') })
    } catch {
      showToast({ message: t('groups.toggleFailed') })
    } finally {
      await refresh({ silent: true })
      groupToggleBusy.value = false
    }
  }

  /** 按当前筛选快照启用或禁用正在查看的合集。 */
  async function setGroupEnabled(enabled: boolean): Promise<void> {
    const group = groups.value.find((item) => item.name === groupFilter.value)
    if (!group) return
    const action = enabled ? 'enable' : 'disable'
    await toggleGroupInstallations(
      group,
      enabled,
      installationFilter.value,
      `groups.${action}Confirm`,
    )
  }

  /** 不受筛选影响，按名称启用或禁用任意合集（管理页使用）。 */
  async function setGroupEnabledFor(name: string, enabled: boolean): Promise<void> {
    const group = groups.value.find((item) => item.name === name)
    if (!group) return
    const action = enabled ? 'enable' : 'disable'
    await toggleGroupInstallations(
      group,
      enabled,
      { platformId: null, projectFilter: null, ownershipFilter: null },
      `groups.${action}ConfirmAll`,
    )
  }

  return {
    groups,
    groupFilter,
    groupApplyOpen,
    groupApplyTargets,
    groupApplyBusy,
    groupApplyNote,
    activeGroupState,
    groupToggleBusy,
    activeTemp,
    filterGroup,
    openGroupFilter,
    createGroup,
    renameGroup,
    deleteGroup,
    exportGroup,
    groupCount,
    setGroupSkills,
    applyGroup,
    applyGroupTemp,
    endTemp,
    setGroupEnabled,
    setGroupEnabledFor,
    tempApplications,
  }
}
