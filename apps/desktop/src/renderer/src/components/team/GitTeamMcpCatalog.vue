<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { CloudDownload, GitCommitHorizontal, KeyRound, Search, ServerCog } from '@lucide/vue'
import type { McpTarget } from '@skillbuddy/core'
import { useI18n } from 'vue-i18n'
import type { TeamLibraryMcpSummary } from '#shared/ipc'
import { teamLibraryConfigKey } from '#shared/team-library'
import McpPlanDialog from '@/components/mcp/McpPlanDialog.vue'
import McpTargetPicker from '@/components/mcp/McpTargetPicker.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMcpServers } from '@/composables/useMcpServers'
import { useSettings } from '@/composables/useSettings'
import { useTeamLibraries } from '@/composables/useTeamLibraries'

const { t } = useI18n()
const { teamLibraries, projectRoots } = useSettings()
const { mcpServers, catalogs, installations, refreshInstallations, policyState } = useTeamLibraries()
const { platforms, currentPlan, planning, applying, planUpsert, applyPlan, closePlan, refresh } = useMcpServers()
const query = shallowRef('')
const expanded = shallowRef<string | null>(null)
const detail = shallowRef<Awaited<ReturnType<typeof window.skillsManager.teamLibraryGetMcp>> | null>(null)
const targets = shallowRef<McpTarget[]>([])
const error = shallowRef<string | null>(null)

const visibleItems = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return needle
    ? mcpServers.value.filter((item) => [item.name, item.description, item.libraryName].some((value) => value.toLowerCase().includes(needle)))
    : mcpServers.value
})
const required = computed(() => new Set(catalogs.value.flatMap((catalog) =>
  catalog.policy.required.mcp.map((path) => `${catalog.source.libraryId}:${path}`),
)))
const installationStates = computed(() => {
  const states = new Map<string, 'current' | 'outdated' | 'missing'>()
  const rank = { missing: 0, outdated: 1, current: 2 }
  for (const item of installations.value) {
    if (item.type !== 'mcp') continue
    const key = `${item.libraryId}:${item.path}`
    const status = item.status ?? (item.actualHash === item.definitionHash ? 'current' : 'outdated')
    const previous = states.get(key)
    if (!previous || rank[status] > rank[previous]) states.set(key, status)
  }
  return states
})
const policyStates = computed(() => new Map(
  mcpServers.value.map((item) => [
    `${item.libraryId}:${item.path}`,
    policyState(item),
  ]),
))

function configFor(item: TeamLibraryMcpSummary) {
  const itemKey = teamLibraryConfigKey(item)
  const config = teamLibraries.value.find((library) => teamLibraryConfigKey(library) === itemKey)
  if (!config) throw new Error(t('team.libraryConfigMissing', { id: item.libraryId }))
  return config
}

async function toggle(item: TeamLibraryMcpSummary): Promise<void> {
  const key = `${item.libraryId}:${item.path}`
  expanded.value = expanded.value === key ? null : key
  detail.value = null
  targets.value = []
  error.value = null
  if (expanded.value !== key) return
  try {
    detail.value = await window.skillsManager.teamLibraryGetMcp(configFor(item), item.path)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function review(): Promise<void> {
  if (!detail.value || targets.value.length === 0) return
  const state = policyState(detail.value)
  if (state.blockedReason) {
    error.value = t('team.mcpPolicyBlocked', { reason: state.blockedReason })
    return
  }
  try {
    await window.skillsManager.teamLibraryAssertMcpInstall(
      configFor(detail.value),
      detail.value.path,
      targets.value,
    )
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    return
  }
  await planUpsert(detail.value.definition, targets.value)
}

async function apply(): Promise<void> {
  const plannedTargets = currentPlan.value?.actions.map((action) => ({
    sourceId: action.sourceId,
    target: action.target,
  })) ?? []
  const result = await applyPlan()
  if (!result || !detail.value) return
  const succeeded = new Set(result.results.filter((item) => item.ok).map((item) => item.sourceId))
  const installedTargets = plannedTargets
    .filter((item) => succeeded.has(item.sourceId))
    .map((item) => ({ ...item.target }))
  if (installedTargets.length > 0) {
    await window.skillsManager.teamLibraryRecordMcpInstall(
      configFor(detail.value),
      detail.value.path,
      installedTargets,
    )
    await refreshInstallations()
  }
  expanded.value = null
  await refresh({ silent: true })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="relative">
      <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="query" :placeholder="t('team.mcpSearchPh')" class="pl-8" />
    </div>
    <p v-if="error" class="break-all text-sm text-destructive">{{ error }}</p>
    <p v-if="visibleItems.length === 0" class="py-16 text-center text-sm text-muted-foreground">{{ t('team.mcpEmpty') }}</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="item in visibleItems" :key="`${item.libraryId}:${item.path}`" class="rounded-md border px-4 py-3">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 text-sm font-medium">
              <ServerCog class="size-4 text-muted-foreground" />
              <span>{{ item.name }}</span>
              <Badge variant="outline">{{ item.libraryName }}</Badge>
              <Badge variant="secondary">{{ item.transport }}</Badge>
              <Badge v-if="item.version" variant="secondary">v{{ item.version }}</Badge>
              <Badge
                v-if="required.has(`${item.libraryId}:${item.path}`)"
                variant="outline"
                class="border-amber-500/50 text-amber-700 dark:text-amber-400"
              >{{ t('team.required') }}</Badge>
              <Badge v-if="policyStates.get(`${item.libraryId}:${item.path}`)?.recommended" variant="secondary">{{ t('team.recommended') }}</Badge>
              <Badge
                v-if="policyStates.get(`${item.libraryId}:${item.path}`)?.blockedReason"
                variant="outline"
                class="border-destructive/50 text-destructive"
              >{{ t('team.blocked') }}</Badge>
            </div>
            <p class="line-clamp-1 text-sm text-muted-foreground">{{ item.description || t('team.bundleNoDescription') }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Badge
              v-if="installationStates.get(`${item.libraryId}:${item.path}`) === 'current'"
              variant="success"
            >{{ t('team.installedFromSource') }}</Badge>
            <Badge
              v-else-if="installationStates.get(`${item.libraryId}:${item.path}`) === 'outdated'"
              variant="outline"
              class="border-amber-500/50 text-amber-700 dark:text-amber-400"
            >{{ t('team.updateAvailable') }}</Badge>
            <Badge v-else-if="installationStates.get(`${item.libraryId}:${item.path}`) === 'missing'" variant="outline" class="border-destructive/50 text-destructive">{{ t('team.localInstallMissing') }}</Badge>
            <Button variant="outline" size="sm" class="cursor-pointer" @click="toggle(item)"><CloudDownload />{{ t('team.install') }}</Button>
          </div>
        </div>
        <div v-if="expanded === `${item.libraryId}:${item.path}`" class="mt-3 flex flex-col gap-3 border-t pt-3">
          <template v-if="detail">
            <div class="grid gap-2 rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-2">
              <span>{{ detail.path }}</span>
              <span class="flex items-center gap-1 font-mono"><GitCommitHorizontal class="size-3.5" />{{ detail.revision.slice(0, 12) }}</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <KeyRound class="size-4" />
              <span>{{ detail.requiredSecrets.length ? detail.requiredSecrets.join(', ') : t('team.noRequiredSecrets') }}</span>
            </div>
            <McpTargetPicker v-model="targets" :platforms="platforms" :project-roots="projectRoots" />
            <p v-if="policyStates.get(`${item.libraryId}:${item.path}`)?.blockedReason" class="text-sm text-destructive">
              {{ t('team.blockedReason', { reason: policyStates.get(`${item.libraryId}:${item.path}`)?.blockedReason }) }}
            </p>
            <Button
              size="sm"
              class="w-fit cursor-pointer"
              :disabled="planning || applying || targets.length === 0 || Boolean(policyStates.get(`${item.libraryId}:${item.path}`)?.blockedReason)"
              @click="review"
            >
              {{ planning ? t('team.preparingPlan') : t('team.reviewMcpInstall') }}
            </Button>
          </template>
        </div>
      </li>
    </ul>
    <McpPlanDialog :plan="currentPlan" :applying="applying" @close="closePlan" @apply="apply" />
  </div>
</template>
