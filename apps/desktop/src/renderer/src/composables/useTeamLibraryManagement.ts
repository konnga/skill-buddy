import { readonly, ref, shallowRef } from 'vue'
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
} from '../../../shared/ipc.js'

const workspace = shallowRef<TeamContributionWorkspace | null>(null)
const catalog = ref<TeamLibraryCatalog | null>(null)
const diff = ref<TeamContributionDiff | null>(null)
const publishResult = shallowRef<TeamContributionPublishResult | null>(null)
const busy = shallowRef(false)
const error = shallowRef<string | null>(null)

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
    await refreshDraft()
    return true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    return false
  } finally {
    busy.value = false
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
  workspace.value = null
  catalog.value = null
  diff.value = null
  publishResult.value = null
  error.value = null
}

export function useTeamLibraryManagement() {
  return {
    workspace: readonly(workspace),
    catalog: readonly(catalog),
    diff: readonly(diff),
    publishResult: readonly(publishResult),
    busy: readonly(busy),
    error: readonly(error),
    start,
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
