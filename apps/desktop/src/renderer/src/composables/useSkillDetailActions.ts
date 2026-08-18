import {
  computed,
  ref,
  shallowReadonly,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'
import { useI18n } from 'vue-i18n'
import type { AggregatedSkill, Installation } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
import { agentLabel } from '@/lib/agents'

interface UseSkillDetailActionsOptions {
  skill: MaybeRefOrGetter<AggregatedSkill>
  onClose: () => void
}

/** 管理技能详情页的安装、同步、启停和可撤销删除流程。 */
export function useSkillDetailActions(options: UseSkillDetailActionsOptions) {
  const { t } = useI18n()
  const { installSkill, refresh, setEnabled } = useSkills()
  const skill = computed(() => toValue(options.skill))
  const targets = ref<InstallTarget[]>([])
  const busy = shallowRef(false)
  const actionError = shallowRef<string | null>(null)
  const confirmUninstall = shallowRef(false)
  const basePath = shallowRef<string | null>(null)
  let actionRequestId = 0

  const writableInstallations = computed(() =>
    skill.value.installations.filter((installation) => !installation.readOnly),
  )
  const installedTargets = computed<InstallTarget[]>(() =>
    skill.value.installations.map((installation) => ({
      agent: installation.agent,
      scope: installation.scope,
      projectRoot: installation.projectRoot,
    })),
  )
  const baseInstallation = computed(
    () =>
      skill.value.installations.find((installation) => installation.path === basePath.value) ??
      skill.value.installations[0] ??
      null,
  )
  const driftOthers = computed(() =>
    skill.value.installations.filter(
      (installation) =>
        installation.path !== baseInstallation.value?.path &&
        installation.contentHash !== baseInstallation.value?.contentHash,
    ),
  )
  const writableDriftOthers = computed(() =>
    driftOthers.value.filter((installation) => !installation.readOnly),
  )

  function installationEnabled(installation: Installation): boolean {
    return installation.enabled !== false
  }

  function setTargets(value: InstallTarget[]): void {
    targets.value = value
  }

  function selectBase(path: string): void {
    basePath.value = path
  }

  function setConfirmUninstall(value: boolean): void {
    confirmUninstall.value = value
  }

  function reveal(path: string): void {
    void window.skillsManager.revealInFolder(path)
  }

  function startAction(): number | null {
    if (busy.value) return null
    const requestId = ++actionRequestId
    busy.value = true
    actionError.value = null
    return requestId
  }

  function finishAction(requestId: number): void {
    if (requestId === actionRequestId) busy.value = false
  }

  async function runInstall(): Promise<void> {
    const sourceSkill = skill.value.installations[0]?.skill
    const requestedTargets = targets.value.map((target) => ({ ...target }))
    if (!sourceSkill || requestedTargets.length === 0) return
    const requestId = startAction()
    if (requestId === null) return
    try {
      const results = await installSkill(sourceSkill, requestedTargets)
      if (requestId !== actionRequestId) return
      const failed = results.filter((result) => !result.ok)
      if (failed.length > 0) {
        actionError.value = failed
          .map((result) => `${agentLabel(result.target.agent)}: ${result.error}`)
          .join('；')
      }
      targets.value = []
    } finally {
      finishAction(requestId)
    }
  }

  async function syncFromBase(): Promise<void> {
    const sourceSkill = baseInstallation.value?.skill
    const requestedTargets: InstallTarget[] = writableDriftOthers.value.map((installation) => ({
      agent: installation.agent,
      scope: installation.scope,
      projectRoot: installation.projectRoot,
    }))
    if (!sourceSkill || requestedTargets.length === 0) return
    const requestId = startAction()
    if (requestId === null) return
    try {
      const results = await installSkill(sourceSkill, requestedTargets)
      if (requestId !== actionRequestId) return
      const failed = results.filter((result) => !result.ok)
      if (failed.length > 0) {
        actionError.value = failed
          .map((result) => `${agentLabel(result.target.agent)}: ${result.error}`)
          .join('；')
      }
    } finally {
      finishAction(requestId)
    }
  }

  /** 只有整批路径全部移入废纸篓时才提供撤销入口。 */
  async function trashWithUndo(paths: string[], requestId: number): Promise<boolean> {
    const { token, results } = await window.skillsManager.trashUndoable(paths)
    const failed = results.filter((result) => !result.ok)
    if (failed.length > 0) {
      if (requestId === actionRequestId) {
        actionError.value = failed.map((result) => result.error).join('；')
      }
      return false
    }
    showToast({
      message: t('common.trashedN', { n: paths.length }),
      actionLabel: t('common.undo'),
      onAction: async () => {
        if (await window.skillsManager.undoTrash(token)) {
          await refresh()
          showToast({ message: t('common.restored') })
        }
      },
    })
    return true
  }

  async function removeInstallation(path: string): Promise<void> {
    const requestedSkillName = skill.value.name
    const installation = skill.value.installations.find((item) => item.path === path)
    if (!installation || installation.readOnly) return
    const wasLast = skill.value.installations.length <= 1
    const requestId = startAction()
    if (requestId === null) return
    try {
      if (!(await trashWithUndo([path], requestId))) return
      await refresh()
      if (
        requestId === actionRequestId &&
        requestedSkillName === skill.value.name &&
        wasLast
      ) {
        options.onClose()
      }
    } finally {
      finishAction(requestId)
    }
  }

  async function toggleInstallation(installation: Installation): Promise<void> {
    if (installation.readOnly) return
    const requestedSkillName = skill.value.name
    const requestedTarget: InstallTarget = {
      agent: installation.agent,
      scope: installation.scope,
      projectRoot: installation.projectRoot,
    }
    const requestId = startAction()
    if (requestId === null) return
    try {
      const results = await setEnabled(
        requestedSkillName,
        [requestedTarget],
        !installationEnabled(installation),
      )
      if (requestId !== actionRequestId) return
      const failed = results.filter((result) => !result.ok)
      if (failed.length > 0) {
        actionError.value = failed.map((result) => result.error).join('；')
      }
    } finally {
      finishAction(requestId)
    }
  }

  async function runUninstall(): Promise<void> {
    const requestedSkillName = skill.value.name
    const requestedPaths = writableInstallations.value.map((installation) => installation.path)
    if (requestedPaths.length === 0) return
    const removesAllInstallations = requestedPaths.length === skill.value.installations.length
    const requestId = startAction()
    if (requestId === null) return
    try {
      if (!(await trashWithUndo(requestedPaths, requestId))) return
      await refresh()
      if (
        requestId === actionRequestId &&
        requestedSkillName === skill.value.name &&
        removesAllInstallations
      ) {
        options.onClose()
      }
    } finally {
      if (requestId === actionRequestId) confirmUninstall.value = false
      finishAction(requestId)
    }
  }

  /** 技能切换会使在途结果失效，防止旧操作覆盖新详情页状态。 */
  watch(
    () => skill.value.name,
    () => {
      actionRequestId += 1
      targets.value = []
      busy.value = false
      actionError.value = null
      confirmUninstall.value = false
      basePath.value = null
    },
  )

  return {
    targets: shallowReadonly(targets),
    busy: shallowReadonly(busy),
    actionError: shallowReadonly(actionError),
    confirmUninstall: shallowReadonly(confirmUninstall),
    writableInstallations,
    installedTargets,
    baseInstallation,
    driftOthers,
    writableDriftOthers,
    setTargets,
    selectBase,
    setConfirmUninstall,
    reveal,
    runInstall,
    syncFromBase,
    removeInstallation,
    toggleInstallation,
    runUninstall,
  }
}
