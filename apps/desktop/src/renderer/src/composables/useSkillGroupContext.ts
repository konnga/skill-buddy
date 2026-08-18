import { computed, ref, shallowRef, watch } from 'vue'
import { useGroups } from '@/composables/useGroups'
import { useSkills } from '@/composables/useSkills'

interface UseSkillGroupContextOptions {
  resetBatchContext: () => void
  navigateToGroups: () => void
}

export function useSkillGroupContext(options: UseSkillGroupContextOptions) {
  const { skills } = useSkills()
  const {
    groupFilter,
    groups,
    groupApplyOpen,
    groupApplyTargets,
    groupApplyBusy,
    groupApplyNote,
    activeTemp,
    activeGroupState,
    groupToggleBusy,
    groupCount,
    filterGroup,
    renameGroup,
    deleteGroup,
    exportGroup,
    setGroupSkills,
    applyGroup,
    applyGroupTemp,
    endTemp,
    setGroupEnabledFor,
  } = useGroups()
  const activeGroupEmpty = computed(() => activeGroupState.value?.totalSkills === 0)
  const activeGroup = computed(() =>
    groups.value.find((group) => group.name === groupFilter.value),
  )
  const renameOpen = shallowRef(false)
  const renameValue = shallowRef('')
  const memberEditorOpen = shallowRef(false)
  const memberSearch = shallowRef('')
  const draftMemberNames = ref(new Set<string>())
  const renameDuplicate = computed(() => {
    const name = renameValue.value.trim()
    return Boolean(
      name && name !== groupFilter.value && groups.value.some((group) => group.name === name),
    )
  })
  const groupStatusVariant = computed(() => {
    if (activeGroupState.value?.status === 'enabled') return 'success' as const
    if (activeGroupState.value?.status === 'partial') return 'default' as const
    return 'secondary' as const
  })
  const cannotManageGroup = computed(
    () => groupToggleBusy.value || (activeGroupState.value?.manageableInstallations ?? 0) === 0,
  )
  const memberEditorSkills = computed(() => {
    const query = memberSearch.value.trim().toLowerCase()
    if (!query) return skills.value
    return skills.value.filter((skill) =>
      [skill.name, skill.description, ...skill.tags].some((field) =>
        field.toLowerCase().includes(query),
      ),
    )
  })
  const memberEditorMissingNames = computed(() => {
    const query = memberSearch.value.trim().toLowerCase()
    const localNames = new Set(skills.value.map((skill) => skill.name))
    return (activeGroup.value?.skills ?? []).filter(
      (name) => !localNames.has(name) && (!query || name.toLowerCase().includes(query)),
    )
  })

  function backToGroups(): void {
    filterGroup(null)
    options.navigateToGroups()
  }

  function openRenameGroup(): void {
    if (!groupFilter.value) return
    renameValue.value = groupFilter.value
    renameOpen.value = true
  }

  function submitRenameGroup(): void {
    if (!groupFilter.value || renameDuplicate.value) return
    if (renameGroup(groupFilter.value, renameValue.value)) renameOpen.value = false
  }

  async function removeActiveGroup(): Promise<void> {
    const name = groupFilter.value
    if (!name) return
    await deleteGroup(name)
    if (groupFilter.value === null) options.navigateToGroups()
  }

  function exportActiveGroup(): void {
    if (activeGroup.value) void exportGroup(activeGroup.value)
  }

  function setActiveGroupEnabled(enabled: boolean): void {
    const name = groupFilter.value
    if (name) void setGroupEnabledFor(name, enabled)
  }

  /** 打开成员管理器，并以当前技能包成员作为编辑草稿。 */
  function openMemberEditor(): void {
    if (!activeGroup.value) return
    memberSearch.value = ''
    draftMemberNames.value = new Set(activeGroup.value.skills)
    memberEditorOpen.value = true
  }

  function toggleDraftMember(name: string): void {
    const next = new Set(draftMemberNames.value)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    draftMemberNames.value = next
  }

  function saveGroupMembers(): void {
    const group = activeGroup.value
    if (!group) return
    const existingMembers = group.skills.filter((name) => draftMemberNames.value.has(name))
    const addedMembers = skills.value
      .map((skill) => skill.name)
      .filter((name) => draftMemberNames.value.has(name) && !group.skills.includes(name))
    if (setGroupSkills(group.name, [...existingMembers, ...addedMembers])) {
      memberEditorOpen.value = false
    }
  }

  function removeSkillFromActiveGroup(name: string): void {
    const group = activeGroup.value
    if (!group) return
    setGroupSkills(
      group.name,
      group.skills.filter((skillName) => skillName !== name),
    )
  }

  /** 进入技能包上下文时关闭批量模式；退出时关闭仅属于该上下文的编辑器。 */
  watch(groupFilter, (name) => {
    if (name) options.resetBatchContext()
    else memberEditorOpen.value = false
  })

  return {
    groupFilter,
    groups,
    groupApplyOpen,
    groupApplyTargets,
    groupApplyBusy,
    groupApplyNote,
    activeTemp,
    activeGroupState,
    groupCount,
    filterGroup,
    applyGroup,
    applyGroupTemp,
    endTemp,
    activeGroupEmpty,
    renameOpen,
    renameValue,
    memberEditorOpen,
    memberSearch,
    draftMemberNames,
    renameDuplicate,
    groupStatusVariant,
    cannotManageGroup,
    memberEditorSkills,
    memberEditorMissingNames,
    backToGroups,
    openRenameGroup,
    submitRenameGroup,
    removeActiveGroup,
    exportActiveGroup,
    setActiveGroupEnabled,
    openMemberEditor,
    toggleDraftMember,
    saveGroupMembers,
    removeSkillFromActiveGroup,
  }
}
