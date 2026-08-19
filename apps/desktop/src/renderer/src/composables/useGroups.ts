import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { planAdditiveInstall } from '@skillbuddy/core/planners'
import type { InstallTarget } from '../../../shared/ipc.js'
import { showToast } from '@/composables/useToast'
import { useSettings, type SkillGroup } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { deriveGroupRuntimeState } from '@/lib/group-runtime'
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
  const { groups, tempApplications } = useSettings()
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
    tempApplications.value = tempApplications.value.filter((record) => record.group !== name)
    if (groupFilter.value === name) groupFilter.value = null
  }

  /** 新建合集并写入可选初始成员；空名或重名时返回 false。 */
  function createGroup(name: string, skillNames: string[] = []): boolean {
    const trimmed = name.trim()
    if (!trimmed || groups.value.some((group) => group.name === trimmed)) return false
    groups.value = [...groups.value, { name: trimmed, skills: [...new Set(skillNames)] }]
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
    groups.value = groups.value.map((group) =>
      group.name === name ? { ...group, skills: [...new Set(skillNames)] } : group,
    )
    return true
  }

  async function applyGroup(): Promise<void> {
    const group = groups.value.find((item) => item.name === groupFilter.value)
    if (!group || groupApplyTargets.value.length === 0) return

    groupApplyBusy.value = true
    groupApplyNote.value = null
    try {
      const plan = planAdditiveInstall(group.skills, skills.value, groupApplyTargets.value)
      const failures: string[] = []
      for (const { name, targets } of plan.installs) {
        const local = skills.value.find((skill) => skill.name === name)
        if (!local) continue
        const results = await installSkill(local.installations[0]!.skill, targets)
        failures.push(
          ...results
            .filter((result) => !result.ok)
            .map((result) => `${name}: ${result.error ?? t('batch.failed')}`),
        )
      }
      if (failures.length > 0) {
        groupApplyNote.value = failures.join('；')
      } else if (plan.missing.length > 0) {
        groupApplyNote.value = t('groups.skipped', { names: plan.missing.join(', ') })
      } else {
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
      const plan = planAdditiveInstall(group.skills, skills.value, groupApplyTargets.value)
      for (const { name, targets } of plan.installs) {
        const local = skills.value.find((skill) => skill.name === name)
        if (local) await installSkill(local.installations[0]!.skill, targets)
      }
      await refresh()

      const installed: { name: string; agent: string; scope: string; path: string }[] = []
      for (const { name, targets } of plan.installs) {
        const local = skills.value.find((skill) => skill.name === name)
        for (const target of targets) {
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
          }
        }
      }

      tempApplications.value = [
        ...tempApplications.value.filter((record) => record.group !== group.name),
        { group: group.name, appliedAt: Date.now(), installed },
      ]
      if (plan.missing.length > 0) {
        groupApplyNote.value = t('groups.skipped', { names: plan.missing.join(', ') })
      } else {
        groupApplyOpen.value = false
      }
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
