import { computed, readonly, ref, shallowRef, watch } from 'vue'
import type {
  TeamLibraryCatalog,
  TeamLibraryBundleSummary,
  TeamLibraryConfig,
  TeamLibraryInstallRecord,
  TeamLibraryMcpSummary,
  TeamLibrarySkillSummary,
} from '../../../shared/ipc.js'
import { teamLibraryConfigKey } from '../../../shared/team-library.js'
import { blockedTeamAssetReason, teamAssetPolicyState } from '../../../shared/team-policy.js'
import { useSettings } from './useSettings.js'

const catalogs = ref<TeamLibraryCatalog[]>([])
const installations = ref<TeamLibraryInstallRecord[]>([])
const loading = shallowRef(false)
const errors = ref<Record<string, string>>({})
const warnings = ref<Record<string, string>>({})
let initialized = false

async function syncOne(config: TeamLibraryConfig): Promise<void> {
  const configKey = teamLibraryConfigKey(config)
  try {
    const result = await window.skillsManager.teamLibrarySync(config)
    const duplicate = catalogs.value.find((catalog) =>
      teamLibraryConfigKey(catalog.source) !== configKey &&
      catalog.source.libraryId === result.catalog.source.libraryId,
    )
    if (duplicate) {
      catalogs.value = catalogs.value.filter(
        (catalog) => teamLibraryConfigKey(catalog.source) !== configKey,
      )
      throw new Error(`团队库 ID ${result.catalog.source.libraryId} 已被 ${duplicate.source.libraryName} 使用`)
    }
    catalogs.value = [
      ...catalogs.value.filter((catalog) => teamLibraryConfigKey(catalog.source) !== configKey),
      result.catalog,
    ]
    const nextErrors = { ...errors.value }
    delete nextErrors[configKey]
    errors.value = nextErrors
    const nextWarnings = { ...warnings.value }
    if (result.warning) nextWarnings[configKey] = result.warning
    else delete nextWarnings[configKey]
    warnings.value = nextWarnings
  } catch (cause) {
    errors.value = {
      ...errors.value,
      [configKey]: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

async function refreshInstallations(): Promise<void> {
  installations.value = await window.skillsManager.teamLibraryInstallations()
}

async function syncAll(): Promise<void> {
  const { teamLibraries } = useSettings()
  loading.value = true
  try {
    const validKeys = new Set(teamLibraries.value.map(teamLibraryConfigKey))
    catalogs.value = catalogs.value.filter((catalog) => validKeys.has(teamLibraryConfigKey(catalog.source)))
    errors.value = Object.fromEntries(
      Object.entries(errors.value).filter(([key]) => validKeys.has(key)),
    )
    warnings.value = Object.fromEntries(
      Object.entries(warnings.value).filter(([key]) => validKeys.has(key)),
    )
    for (const library of teamLibraries.value) {
      await syncOne(library)
    }
    await refreshInstallations()
  } finally {
    loading.value = false
  }
}

export function useTeamLibraries() {
  const { teamLibraries } = useSettings()
  if (!initialized) {
    initialized = true
    watch(teamLibraries, () => void syncAll(), { deep: true })
    void syncAll()
  }
  const order = computed(() => new Map(
    teamLibraries.value.map((library, index) => [teamLibraryConfigKey(library), index]),
  ))
  const skills = computed<TeamLibrarySkillSummary[]>(() =>
    catalogs.value
      .flatMap((catalog) => catalog.skills)
      .sort((left, right) =>
        (order.value.get(teamLibraryConfigKey(left)) ?? 0) -
          (order.value.get(teamLibraryConfigKey(right)) ?? 0) ||
        left.name.localeCompare(right.name),
      ),
  )
  const mcpServers = computed<TeamLibraryMcpSummary[]>(() =>
    catalogs.value
      .flatMap((catalog) => catalog.mcpServers)
      .sort((left, right) =>
        (order.value.get(teamLibraryConfigKey(left)) ?? 0) -
          (order.value.get(teamLibraryConfigKey(right)) ?? 0) ||
        left.name.localeCompare(right.name),
      ),
  )
  const bundles = computed<TeamLibraryBundleSummary[]>(() =>
    catalogs.value
      .flatMap((catalog) => catalog.bundles)
      .sort((left, right) =>
        (order.value.get(teamLibraryConfigKey(left)) ?? 0) -
          (order.value.get(teamLibraryConfigKey(right)) ?? 0) ||
        left.name.localeCompare(right.name),
      ),
  )
  const attentionCount = computed(() => {
    const installed = new Set(installations.value
      .filter((item) => item.status !== 'missing')
      .map((item) => `${item.type}:${item.libraryId}:${item.path}`))
    return catalogs.value.reduce((total, catalog) => total +
      catalog.policy.required.skills.filter((path) => !installed.has(`skill:${catalog.source.libraryId}:${path}`)).length +
      catalog.policy.required.mcp.filter((path) => !installed.has(`mcp:${catalog.source.libraryId}:${path}`)).length,
    0)
  })
  const compliance = computed(() => {
    const installed = new Set(
      installations.value
        .filter((item) => item.status !== 'missing')
        .map((item) => `${item.type}:${item.libraryId}:${item.path}`),
    )
    const missingRequired = catalogs.value.flatMap((catalog) => [
      ...catalog.policy.required.skills
        .filter((path) => !installed.has(`skill:${catalog.source.libraryId}:${path}`))
        .map((path) => ({
          type: 'skill' as const,
          libraryId: catalog.source.libraryId,
          libraryName: catalog.source.libraryName,
          path,
        })),
      ...catalog.policy.required.mcp
        .filter((path) => !installed.has(`mcp:${catalog.source.libraryId}:${path}`))
        .map((path) => ({
          type: 'mcp' as const,
          libraryId: catalog.source.libraryId,
          libraryName: catalog.source.libraryName,
          path,
        })),
    ])
    const currentFingerprints = new Map([
      ...skills.value.map((item) =>
        [`skill:${item.libraryId}:${item.path}`, item.contentHash] as const,
      ),
      ...mcpServers.value.map((item) =>
        [`mcp:${item.libraryId}:${item.path}`, item.definitionHash] as const,
      ),
    ])
    const updateAvailable = new Set(
      installations.value
        .filter((item) => {
          const current = currentFingerprints.get(`${item.type}:${item.libraryId}:${item.path}`)
          const installed = item.type === 'skill' ? item.contentHash : item.definitionHash
          return item.status === 'outdated' ||
            (item.status !== 'missing' && current !== undefined && current !== installed)
        })
        .map((item) => `${item.type}:${item.libraryId}:${item.path}`),
    )
    const catalogById = new Map(
      catalogs.value.map((catalog) => [catalog.source.libraryId, catalog]),
    )
    const blockedInstalled = installations.value.flatMap((item) => {
      const catalog = catalogById.get(item.libraryId)
      if (!catalog) return []
      const reason = blockedTeamAssetReason(catalog.policy, item.path, item.version)
      return reason ? [{ ...item, reason }] : []
    })
    const recommendedMissing = catalogs.value.reduce((total, catalog) => total +
      catalog.policy.recommended.skills.filter(
        (path) => !installed.has(`skill:${catalog.source.libraryId}:${path}`),
      ).length +
      catalog.policy.recommended.mcp.filter(
        (path) => !installed.has(`mcp:${catalog.source.libraryId}:${path}`),
      ).length,
    0)
    return {
      missingRequired,
      blockedInstalled,
      updateAvailable: updateAvailable.size,
      recommendedMissing,
    }
  })

  function policyState(
    item: TeamLibrarySkillSummary | TeamLibraryMcpSummary,
  ) {
    const catalog = catalogs.value.find(
      (candidate) => candidate.source.libraryId === item.libraryId,
    )
    return catalog
      ? teamAssetPolicyState(catalog.policy, item.type, item.path, item.version)
      : { required: false, recommended: false, blockedReason: null }
  }
  return {
    catalogs: readonly(catalogs),
    installations: readonly(installations),
    skills,
    mcpServers,
    bundles,
    loading: readonly(loading),
    errors: readonly(errors),
    warnings: readonly(warnings),
    attentionCount,
    compliance,
    policyState,
    syncOne,
    syncAll,
    refreshInstallations,
  }
}
