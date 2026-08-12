import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { planAdditiveInstall } from '@skillbuddy/core/planners'
import { showToast } from '@/composables/useToast'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { deriveGroupRuntimeState } from '@/lib/group-runtime'
import { manageableSkillInstallations } from '@/lib/skill-installations'

const groupApplyOpen = shallowRef(false)
const groupApplyScope = shallowRef('user')
const groupApplyAgents = ref<string[]>([])
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
    platformFilter,
    projectFilter,
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
    groupApplyOpen.value = false
    groupApplyNote.value = null
  }

  function deleteGroup(name: string): void {
    groups.value = groups.value.filter((group) => group.name !== name)
    if (groupFilter.value === name) groupFilter.value = null
  }

  function groupCount(name: string | null): number {
    return groups.value.find((group) => group.name === name)?.skills.length ?? 0
  }

  function buildTargets() {
    return groupApplyAgents.value.map((agent) =>
      groupApplyScope.value === 'user'
        ? { agent, scope: 'user' as const }
        : {
            agent,
            scope: 'project' as const,
            projectRoot: groupApplyScope.value,
          },
    )
  }

  async function applyGroup(): Promise<void> {
    const group = groups.value.find((item) => item.name === groupFilter.value)
    if (!group || groupApplyAgents.value.length === 0) return

    groupApplyBusy.value = true
    groupApplyNote.value = null
    try {
      const plan = planAdditiveInstall(group.skills, skills.value, buildTargets())
      for (const { name, targets } of plan.installs) {
        const local = skills.value.find((skill) => skill.name === name)
        if (local) await installSkill(local.installations[0]!.skill, targets)
      }
      if (plan.missing.length > 0) {
        groupApplyNote.value = t('groups.skipped', { names: plan.missing.join(', ') })
      } else {
        groupApplyOpen.value = false
      }
    } finally {
      groupApplyBusy.value = false
    }
  }

  async function applyGroupTemp(): Promise<void> {
    const group = groups.value.find((item) => item.name === groupFilter.value)
    if (!group || groupApplyAgents.value.length === 0) return

    groupApplyBusy.value = true
    groupApplyNote.value = null
    try {
      const plan = planAdditiveInstall(group.skills, skills.value, buildTargets())
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

  /** 按当前筛选快照启用或禁用合集内的所有可写安装。 */
  async function setGroupEnabled(enabled: boolean): Promise<void> {
    const group = groups.value.find((item) => item.name === groupFilter.value)
    if (!group || groupToggleBusy.value) return

    const targets = group.skills.flatMap((name) => {
      const skill = skills.value.find((item) => item.name === name)
      if (!skill) return []
      const installations = manageableSkillInstallations(skill, installationFilter.value)
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
      message: t(`groups.${action}Confirm`, {
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

  return {
    groups,
    groupFilter,
    groupApplyOpen,
    groupApplyScope,
    groupApplyAgents,
    groupApplyBusy,
    groupApplyNote,
    activeGroupState,
    groupToggleBusy,
    activeTemp,
    filterGroup,
    deleteGroup,
    groupCount,
    applyGroup,
    applyGroupTemp,
    endTemp,
    setGroupEnabled,
  }
}
