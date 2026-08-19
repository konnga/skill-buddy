import {
  onBeforeUnmount,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'
import { useI18n } from 'vue-i18n'
import type { FoundSkill } from '@skillbuddy/core'
import type { InstallTarget } from '#shared/ipc'
import { useSkills } from '@/composables/useSkills'
import { agentLabel } from '@/lib/agents'

export type SkillImportSource = 'local' | 'git'

interface UseSkillImportWorkflowOptions {
  open: MaybeRefOrGetter<boolean>
  onComplete: () => void
}

export function useSkillImportWorkflow(options: UseSkillImportWorkflowOptions) {
  const { installSkill, refresh } = useSkills()
  const { t } = useI18n()
  const tab = shallowRef<SkillImportSource>('local')
  const gitUrl = shallowRef('')
  const fetching = shallowRef(false)
  const items = ref<FoundSkill[]>([])
  const searched = shallowRef(false)
  const cloneRoot = shallowRef<string | null>(null)
  const selected = shallowRef(new Set<string>())
  const previewDir = shallowRef<string | null>(null)
  const targets = ref<InstallTarget[]>([])
  const busy = shallowRef(false)
  const error = shallowRef<string | null>(null)
  let sourceRequestId = 0
  let workflowSessionId = 0

  async function cleanupClone(): Promise<void> {
    const root = cloneRoot.value
    cloneRoot.value = null
    if (!root) return
    await window.skillsManager.cleanupImport(root).catch(() => undefined)
  }

  function reset(): void {
    sourceRequestId += 1
    tab.value = 'local'
    gitUrl.value = ''
    fetching.value = false
    items.value = []
    searched.value = false
    selected.value = new Set()
    previewDir.value = null
    targets.value = []
    busy.value = false
    error.value = null
  }

  watch(
    () => toValue(options.open),
    (open) => {
      workflowSessionId += 1
      sourceRequestId += 1
      void cleanupClone()
      if (open) reset()
    },
  )

  function setItems(found: FoundSkill[]): void {
    items.value = found
    searched.value = true
    selected.value = new Set(found.map((item) => item.dir))
    previewDir.value = null
  }

  async function scanDirectory(path: string): Promise<void> {
    const requestId = ++sourceRequestId
    error.value = null
    fetching.value = true
    try {
      const found = await window.skillsManager.findSkillsInDir(path)
      if (requestId !== sourceRequestId || !toValue(options.open)) return
      setItems(found)
    } catch (cause) {
      if (requestId === sourceRequestId) {
        error.value = cause instanceof Error ? cause.message : String(cause)
      }
    } finally {
      if (requestId === sourceRequestId) fetching.value = false
    }
  }

  async function pickLocalDir(): Promise<void> {
    error.value = null
    const requestId = sourceRequestId
    const dir = await window.skillsManager.pickDirectory()
    if (dir && requestId === sourceRequestId && toValue(options.open)) {
      await scanDirectory(dir)
    }
  }

  async function onDrop(event: DragEvent): Promise<void> {
    const file = event.dataTransfer?.files[0] as (File & { path?: string }) | undefined
    if (file?.path) await scanDirectory(file.path)
  }

  async function fetchGit(): Promise<void> {
    const url = gitUrl.value.trim()
    if (!url || fetching.value) return
    const requestId = ++sourceRequestId
    error.value = null
    fetching.value = true
    await cleanupClone()
    if (requestId !== sourceRequestId || !toValue(options.open)) return
    try {
      const result = await window.skillsManager.importFromGit(url)
      if (requestId !== sourceRequestId || !toValue(options.open)) {
        await window.skillsManager.cleanupImport(result.root).catch(() => undefined)
        return
      }
      cloneRoot.value = result.root
      setItems(result.items)
    } catch (cause) {
      if (requestId === sourceRequestId) {
        error.value = cause instanceof Error ? cause.message : String(cause)
      }
    } finally {
      if (requestId === sourceRequestId) fetching.value = false
    }
  }

  function setTab(value: SkillImportSource): void {
    if (value === tab.value) return
    sourceRequestId += 1
    tab.value = value
    fetching.value = false
    items.value = []
    searched.value = false
    selected.value = new Set()
    previewDir.value = null
    error.value = null
    void cleanupClone()
  }

  function setGitUrl(value: string): void {
    gitUrl.value = value
  }

  function setTargets(value: InstallTarget[]): void {
    targets.value = value
  }

  function toggleItem(dir: string): void {
    const next = new Set(selected.value)
    if (next.has(dir)) next.delete(dir)
    else next.add(dir)
    selected.value = next
  }

  function togglePreview(dir: string): void {
    previewDir.value = previewDir.value === dir ? null : dir
  }

  async function runImport(): Promise<void> {
    const sessionId = workflowSessionId
    error.value = null
    const chosen = items.value.filter((item) => selected.value.has(item.dir))
    const requestedTargets = targets.value.map((target) => ({ ...target }))
    if (chosen.length === 0 || requestedTargets.length === 0) {
      error.value = t('import.errTargets')
      return
    }
    busy.value = true
    try {
      const failures: string[] = []
      for (const item of chosen) {
        const results = await installSkill(item.skill, requestedTargets)
        failures.push(
          ...results
            .filter((result) => !result.ok)
            .map(
              (result) =>
                `${item.skill.name} → ${agentLabel(result.target.agent)}: ${result.error}`,
            ),
        )
      }
      if (failures.length > 0) {
        if (sessionId === workflowSessionId) error.value = failures.join('；')
        return
      }
      await refresh()
      if (sessionId === workflowSessionId && toValue(options.open)) options.onComplete()
    } catch (cause) {
      if (sessionId === workflowSessionId) {
        error.value = cause instanceof Error ? cause.message : String(cause)
      }
    } finally {
      if (sessionId === workflowSessionId) busy.value = false
    }
  }

  /** 页面销毁时让所有来源请求失效，并清理仍持有的 Git 临时目录。 */
  onBeforeUnmount(() => {
    workflowSessionId += 1
    sourceRequestId += 1
    void cleanupClone()
  })

  return {
    tab,
    gitUrl,
    fetching,
    items,
    searched,
    selected,
    previewDir,
    targets,
    busy,
    error,
    setTab,
    setGitUrl,
    setTargets,
    pickLocalDir,
    onDrop,
    fetchGit,
    toggleItem,
    togglePreview,
    runImport,
  }
}
