import { onMounted, readonly, ref, shallowRef } from 'vue'
import type {
  TeamContributionDiff,
  TeamContributionPublishResult,
  TeamContributionWorkspace,
  TeamLibraryBundleDraft,
  TeamLibraryCatalog,
  TeamLibraryConfig,
  TeamLibraryMcpDraft,
  TeamLibraryMutationResult,
  TeamLibraryPolicyDraft,
  TeamLibrarySkillDraft,
  TeamLibrarySkillImportInput,
} from '#shared/ipc'

const workspace = shallowRef<TeamContributionWorkspace | null>(null)
const catalog = ref<TeamLibraryCatalog | null>(null)
const diff = ref<TeamContributionDiff | null>(null)
const publishResult = shallowRef<TeamContributionPublishResult | null>(null)
const busy = shallowRef(false)
const restoring = shallowRef(false)
const error = shallowRef<string | null>(null)
const CURRENT_WORKSPACE_KEY = 'skillbuddy.team-library.current-workspace'

function rememberedWorkspaceId(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_WORKSPACE_KEY)
  } catch {
    return null
  }
}

function rememberWorkspace(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(CURRENT_WORKSPACE_KEY, id)
    else window.localStorage.removeItem(CURRENT_WORKSPACE_KEY)
  } catch {
    return
  }
}

async function refreshDraft(): Promise<void> {
  if (!workspace.value) return
  const [nextCatalog, nextDiff] = await Promise.all([
    window.skillsManager.teamContributionCatalog(workspace.value.id),
    window.skillsManager.teamContributionDiff(workspace.value.id),
  ])
  catalog.value = nextCatalog
  diff.value = nextDiff
}

async function start(config: TeamLibraryConfig, branchSlug: string): Promise<boolean> {
  busy.value = true
  error.value = null
  publishResult.value = null
  try {
    workspace.value = await window.skillsManager.teamContributionPrepare(config, branchSlug)
    rememberWorkspace(workspace.value.id)
    await refreshDraft()
    return true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    return false
  } finally {
    busy.value = false
  }
}

/** 恢复磁盘中仍存在的团队库草稿，刷新页面或重启应用后继续编辑。 */
async function restore(): Promise<void> {
  if (workspace.value || restoring.value) return
  restoring.value = true
  error.value = null
  try {
    const persisted = await window.skillsManager.teamContributionList()
    if (persisted.length === 0) {
      rememberWorkspace(null)
      return
    }
    const currentId = rememberedWorkspaceId()
    const restored = persisted.find((item) => item.id === currentId) ?? persisted[0]
    if (!restored) {
      rememberWorkspace(null)
      return
    }
    workspace.value = restored
    rememberWorkspace(restored.id)
    await refreshDraft()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    restoring.value = false
  }
}

async function mutate(
  action: (workspaceId: string) => Promise<TeamLibraryMutationResult>,
): Promise<TeamLibraryMutationResult | null> {
  if (!workspace.value) return null
  busy.value = true
  error.value = null
  publishResult.value = null
  try {
    const result = await action(workspace.value.id)
    await refreshDraft()
    return result
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    return null
  } finally {
    busy.value = false
  }
}

function saveSkill(input: TeamLibrarySkillDraft): Promise<TeamLibraryMutationResult | null> {
  return mutate((id) => window.skillsManager.teamContributionUpsertSkill(id, input))
}

function importSkill(input: TeamLibrarySkillImportInput): Promise<TeamLibraryMutationResult | null> {
  return mutate((id) => window.skillsManager.teamContributionImportSkill(id, input))
}

function saveMcp(input: TeamLibraryMcpDraft): Promise<TeamLibraryMutationResult | null> {
  return mutate((id) => window.skillsManager.teamContributionUpsertMcp(id, input))
}

function saveBundle(input: TeamLibraryBundleDraft): Promise<TeamLibraryMutationResult | null> {
  return mutate((id) => window.skillsManager.teamContributionUpsertBundle(id, input))
}

function savePolicy(input: TeamLibraryPolicyDraft): Promise<TeamLibraryMutationResult | null> {
  return mutate((id) => window.skillsManager.teamContributionUpdatePolicy(id, input))
}

function remove(path: string): Promise<TeamLibraryMutationResult | null> {
  return mutate((id) => window.skillsManager.teamContributionDelete(id, path))
}

async function openWorkspace(): Promise<void> {
  if (!workspace.value) return
  try {
    await window.skillsManager.teamContributionOpen(workspace.value.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function reportError(cause: unknown): void {
  error.value = cause instanceof Error ? cause.message : String(cause)
}

async function publish(title: string, body: string): Promise<TeamContributionPublishResult | null> {
  if (!workspace.value) return null
  busy.value = true
  error.value = null
  publishResult.value = null
  try {
    publishResult.value = await window.skillsManager.teamContributionPublish(
      workspace.value.id,
      title,
      body,
    )
    await refreshDraft()
    return publishResult.value
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    return null
  } finally {
    busy.value = false
  }
}

async function discard(): Promise<void> {
  if (!workspace.value) return
  busy.value = true
  error.value = null
  try {
    await window.skillsManager.teamContributionDiscard(workspace.value.id)
    reset()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

function reset(): void {
  rememberWorkspace(null)
  workspace.value = null
  catalog.value = null
  diff.value = null
  publishResult.value = null
  error.value = null
}

export function useTeamLibraryManagement() {
  onMounted(() => {
    void restore()
  })

  return {
    workspace: readonly(workspace),
    catalog: readonly(catalog),
    diff: readonly(diff),
    publishResult: readonly(publishResult),
    busy: readonly(busy),
    restoring: readonly(restoring),
    error: readonly(error),
    start,
    restore,
    refreshDraft,
    saveSkill,
    importSkill,
    saveMcp,
    saveBundle,
    savePolicy,
    remove,
    openWorkspace,
    reportError,
    publish,
    discard,
    reset,
  }
}
