import { computed, readonly, ref, shallowRef } from 'vue'
import type {
  AggregatedMcpServer,
  McpOperationPlanView,
  McpOperationRequestResult,
  McpScanResult,
  McpServerDefinition,
  McpTarget,
} from '@skillbuddy/core'
import { useSettings } from './useSettings.js'

const scanResult = ref<McpScanResult>({
  servers: [],
  installations: [],
  platforms: [],
  errors: [],
})
const loading = shallowRef(false)
const planning = shallowRef(false)
const applying = shallowRef(false)
const error = shallowRef<string | null>(null)
const lastCheckedAt = shallowRef<number | null>(null)
const search = shallowRef('')
const currentPlan = shallowRef<McpOperationPlanView | null>(null)

function cloneForIpc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const filteredServers = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (!query) return scanResult.value.servers
  return scanResult.value.servers.filter((server) => {
    const fields = [
      server.name,
      server.installations[0]?.definition.description ?? '',
      ...server.installations.flatMap((installation) => [
        installation.source.agent,
        installation.source.surface,
      ]),
    ]
    return fields.some((field) => field.toLocaleLowerCase().includes(query))
  })
})

async function refresh(options: { silent?: boolean } = {}): Promise<void> {
  const { projectRoots } = useSettings()
  if (!options.silent) loading.value = true
  error.value = null
  try {
    scanResult.value = await window.skillsManager.scanMcpServers([...projectRoots.value])
    lastCheckedAt.value = Date.now()
    void window.skillsManager.watchMcpStart()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (!options.silent) loading.value = false
  }
}

async function createPlan(
  create: () => Promise<McpOperationPlanView>,
): Promise<McpOperationPlanView | null> {
  planning.value = true
  error.value = null
  try {
    currentPlan.value = await create()
    return currentPlan.value
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    return null
  } finally {
    planning.value = false
  }
}

function planUpsert(
  definition: McpServerDefinition,
  targets: McpTarget[],
): Promise<McpOperationPlanView | null> {
  const { projectRoots } = useSettings()
  return createPlan(() =>
    window.skillsManager.createMcpUpsertPlan({
      projectRoots: [...projectRoots.value],
      definition: cloneForIpc(definition),
      targets: cloneForIpc(targets),
    }),
  )
}

function planSync(
  sourceInstallationId: string,
  targets: McpTarget[],
): Promise<McpOperationPlanView | null> {
  const { projectRoots } = useSettings()
  return createPlan(() =>
    window.skillsManager.createMcpUpsertPlan({
      projectRoots: [...projectRoots.value],
      sourceInstallationId,
      targets: cloneForIpc(targets),
    }),
  )
}

function planRemove(installationIds: string[]): Promise<McpOperationPlanView | null> {
  const { projectRoots } = useSettings()
  return createPlan(() =>
    window.skillsManager.createMcpRemovePlan({
      projectRoots: [...projectRoots.value],
      installationIds: [...installationIds],
    }),
  )
}

function planToggle(
  installationIds: string[],
  enabled: boolean,
): Promise<McpOperationPlanView | null> {
  const { projectRoots } = useSettings()
  return createPlan(() =>
    window.skillsManager.createMcpTogglePlan({
      projectRoots: [...projectRoots.value],
      installationIds: [...installationIds],
      enabled,
    }),
  )
}

async function applyPlan(): Promise<McpOperationRequestResult | null> {
  if (!currentPlan.value?.canApply) return null
  applying.value = true
  error.value = null
  try {
    const result = await window.skillsManager.applyMcpPlan(currentPlan.value.planId)
    currentPlan.value = null
    await refresh({ silent: true })
    return result
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    return null
  } finally {
    applying.value = false
  }
}

async function restore(operationId: string): Promise<boolean> {
  error.value = null
  try {
    const results = await window.skillsManager.restoreMcpOperation(operationId)
    const success = results.length > 0 && results.every((result) => result.ok)
    if (!success) {
      error.value = results.find((result) => !result.ok)?.error ?? '没有可撤销的 MCP 操作'
    }
    await refresh({ silent: true })
    return success
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    return false
  }
}

function closePlan(): void {
  if (!applying.value) currentPlan.value = null
}

let watcherWired = false
if (!watcherWired) {
  watcherWired = true
  let timer: ReturnType<typeof setTimeout> | undefined
  window.skillsManager.onMcpChanged(() => {
    if (!useSettings().autoRefresh.value) return
    clearTimeout(timer)
    timer = setTimeout(() => void refresh({ silent: true }), 300)
  })
}

export function useMcpServers() {
  return {
    scanResult: readonly(scanResult),
    servers: computed(() => scanResult.value.servers),
    platforms: computed(() => scanResult.value.platforms),
    scanErrors: computed(() => scanResult.value.errors),
    filteredServers,
    loading: readonly(loading),
    planning: readonly(planning),
    applying: readonly(applying),
    error: readonly(error),
    lastCheckedAt: readonly(lastCheckedAt),
    search,
    currentPlan: readonly(currentPlan),
    refresh,
    planUpsert,
    planSync,
    planRemove,
    planToggle,
    applyPlan,
    restore,
    closePlan,
  }
}

export type { AggregatedMcpServer }
