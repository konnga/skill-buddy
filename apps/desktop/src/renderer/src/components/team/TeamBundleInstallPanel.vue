<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { AlertTriangle, CheckCircle2, KeyRound } from '@lucide/vue'
import type { McpOperationPlanView, McpTarget } from '@skillbuddy/core'
import type {
  InstallTarget,
  TeamLibraryBundleSummary,
  TeamLibraryMcp,
  TeamLibraryMcpSummary,
} from '../../../../shared/ipc.js'
import { teamLibraryConfigKey } from '../../../../shared/team-library.js'
import { useI18n } from 'vue-i18n'
import McpTargetPicker from '@/components/mcp/McpTargetPicker.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import TeamBundleMemberList from '@/components/team/TeamBundleMemberList.vue'
import { Button } from '@/components/ui/button'
import { useMcpServers } from '@/composables/useMcpServers'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { useTeamLibraries } from '@/composables/useTeamLibraries'
import { agentLabel } from '@/lib/agents'

const props = defineProps<{ bundle: TeamLibraryBundleSummary }>()
const { t } = useI18n()
const { teamLibraries, projectRoots } = useSettings()
const { refresh: refreshSkills } = useSkills()
const { platforms, refresh: refreshMcp } = useMcpServers()
const {
  skills,
  mcpServers,
  policyState,
  refreshInstallations,
} = useTeamLibraries()

interface PreparedMcpPlan {
  source: TeamLibraryMcpSummary
  detail: TeamLibraryMcp
  plan: McpOperationPlanView
}

interface PreparedBundlePlan {
  signature: string
  mcpPlans: PreparedMcpPlan[]
}

const agents = shallowRef<string[]>([])
const scope = shallowRef('user')
const mcpTargets = shallowRef<McpTarget[]>([])
const preparing = shallowRef(false)
const installing = shallowRef(false)
const prepared = shallowRef<PreparedBundlePlan | null>(null)
const error = shallowRef<string | null>(null)
const success = shallowRef<string | null>(null)

const skillMembers = computed(() => {
  const byPath = new Map(
    skills.value
      .filter((item) => item.libraryId === props.bundle.libraryId)
      .map((item) => [item.path, item]),
  )
  return props.bundle.skills.flatMap((ref) => byPath.get(ref) ?? [])
})

const mcpMembers = computed(() => {
  const byPath = new Map(
    mcpServers.value
      .filter((item) => item.libraryId === props.bundle.libraryId)
      .map((item) => [item.path, item]),
  )
  return props.bundle.mcpServers.flatMap((ref) => byPath.get(ref) ?? [])
})

const blockedReasons = computed<Record<string, string>>(() => Object.fromEntries(
  [...skillMembers.value, ...mcpMembers.value].flatMap((item): [string, string][] => {
    const reason = policyState(item).blockedReason
    return reason ? [[item.path, reason]] : []
  }),
))

const blockedEntries = computed(() => Object.entries(blockedReasons.value))
const requiredSecrets = computed(() => [...new Set(
  mcpMembers.value.flatMap((item) => item.requiredSecrets),
)])
const hasMissing = computed(() =>
  props.bundle.missingSkills.length + props.bundle.missingMcpServers.length > 0,
)

function targetKey(target: McpTarget): string {
  return [target.agent, target.surface, target.scope, target.projectRoot ?? ''].join(':')
}

const selectionSignature = computed(() => JSON.stringify({
  agents: [...agents.value].sort(),
  scope: scope.value,
  mcpTargets: mcpTargets.value.map(targetKey).sort(),
}))

const selectionReady = computed(() =>
  !hasMissing.value &&
  blockedEntries.value.length === 0 &&
  (skillMembers.value.length === 0 || agents.value.length > 0) &&
  (mcpMembers.value.length === 0 || mcpTargets.value.length > 0),
)

const planCurrent = computed(() => prepared.value?.signature === selectionSignature.value)
const planCanApply = computed(() =>
  planCurrent.value && prepared.value?.mcpPlans.every((item) => item.plan.canApply) === true,
)
const planWarnings = computed(() => prepared.value?.mcpPlans.flatMap((item) =>
  item.plan.warnings.map((issue) => `${item.source.name}: ${issue.message}`),
) ?? [])
const planBlockers = computed(() => prepared.value?.mcpPlans.flatMap((item) =>
  item.plan.blockers.map((issue) => `${item.source.name}: ${issue.message}`),
) ?? [])

watch(selectionSignature, () => {
  prepared.value = null
  success.value = null
})

function configForBundle() {
  const bundleKey = teamLibraryConfigKey(props.bundle)
  const config = teamLibraries.value.find((item) => teamLibraryConfigKey(item) === bundleKey)
  if (!config) throw new Error(t('team.bundleLibraryMissing'))
  return config
}

async function prepare(): Promise<void> {
  if (!selectionReady.value) return
  preparing.value = true
  error.value = null
  success.value = null
  prepared.value = null
  try {
    const config = configForBundle()
    const mcpPlans: PreparedMcpPlan[] = []
    for (const source of mcpMembers.value) {
      await window.skillsManager.teamLibraryAssertMcpInstall(config, source.path, mcpTargets.value)
      const detail = await window.skillsManager.teamLibraryGetMcp(config, source.path)
      const plan = await window.skillsManager.createMcpUpsertPlan({
        projectRoots: [...projectRoots.value],
        definition: JSON.parse(JSON.stringify(detail.definition)),
        targets: JSON.parse(JSON.stringify(mcpTargets.value)),
      })
      mcpPlans.push({ source, detail, plan })
    }
    prepared.value = { signature: selectionSignature.value, mcpPlans }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    preparing.value = false
  }
}

async function installPrepared(): Promise<void> {
  if (!prepared.value || !planCanApply.value) return
  installing.value = true
  error.value = null
  success.value = null
  const failures: string[] = []
  let installedSkills = 0
  let installedMcp = 0
  try {
    const config = configForBundle()
    const skillTargets: InstallTarget[] = agents.value.map((agent) =>
      scope.value === 'user'
        ? { agent, scope: 'user' }
        : { agent, scope: 'project', projectRoot: scope.value },
    )
    for (const item of skillMembers.value) {
      try {
        const results = await window.skillsManager.teamLibraryInstallSkill(config, item.path, skillTargets)
        if (results.some((result) => result.ok)) installedSkills += 1
        failures.push(...results
          .filter((result) => !result.ok)
          .map((result) => `${item.name} · ${agentLabel(result.target.agent)}: ${result.error}`))
      } catch (cause) {
        failures.push(`${item.name}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
    for (const item of prepared.value.mcpPlans) {
      try {
        await window.skillsManager.teamLibraryAssertMcpInstall(config, item.source.path, mcpTargets.value)
        const result = await window.skillsManager.applyMcpPlan(item.plan.planId)
        const succeeded = new Set(
          result.results.filter((entry) => entry.ok).map((entry) => entry.sourceId),
        )
        const installedTargets = item.plan.actions
          .filter((action) => succeeded.has(action.sourceId))
          .map((action) => ({ ...action.target }))
        if (installedTargets.length > 0) {
          installedMcp += 1
          await window.skillsManager.teamLibraryRecordMcpInstall(
            config,
            item.source.path,
            installedTargets,
          )
        }
        failures.push(...result.results
          .filter((entry) => !entry.ok)
          .map((entry) => `${item.source.name}: ${entry.error ?? entry.code ?? t('team.bundleUnknownError')}`))
      } catch (cause) {
        failures.push(`${item.source.name}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
    await Promise.all([
      refreshSkills(),
      refreshMcp({ silent: true }),
      refreshInstallations(),
    ])
    success.value = t('team.bundleInstallSuccess', { skills: installedSkills, mcp: installedMcp })
    if (failures.length > 0) error.value = failures.join('；')
    prepared.value = null
  } finally {
    installing.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <TeamBundleMemberList
      :skills="skillMembers"
      :mcp-servers="mcpMembers"
      :missing-skills="bundle.missingSkills"
      :missing-mcp-servers="bundle.missingMcpServers"
      :blocked-reasons="blockedReasons"
    />

    <div v-if="requiredSecrets.length" class="flex flex-wrap items-center gap-2 text-sm">
      <KeyRound class="size-4 text-muted-foreground" />
      <span class="font-medium">{{ t('team.requiredSecrets') }}</span>
      <code v-for="secret in requiredSecrets" :key="secret" class="rounded bg-muted px-1.5 py-0.5 text-xs">
        {{ secret }}
      </code>
    </div>

    <div v-if="blockedEntries.length" class="space-y-1">
      <p v-for="entry in blockedEntries" :key="entry[0]" class="flex gap-2 text-sm text-destructive">
        <AlertTriangle class="mt-0.5 size-4 shrink-0" />
        <span><code>{{ entry[0] }}</code>：{{ entry[1] }}</span>
      </p>
    </div>

    <PlatformTargetPicker
      v-if="skillMembers.length"
      v-model:scope="scope"
      v-model:agents="agents"
      :label="t('team.bundleSkillTargets')"
    />

    <div v-if="mcpMembers.length" class="flex flex-col gap-2">
      <span class="text-sm font-medium">{{ t('team.bundleMcpTargets') }}</span>
      <McpTargetPicker v-model="mcpTargets" :platforms="platforms" :project-roots="projectRoots" />
    </div>

    <div v-if="prepared && planCurrent" class="rounded-md border bg-muted/20 px-3 py-3 text-sm">
      <p class="flex items-center gap-2 font-medium">
        <CheckCircle2 v-if="planCanApply" class="size-4 text-emerald-600" />
        <AlertTriangle v-else class="size-4 text-destructive" />
        {{ planCanApply ? t('team.bundlePlanReady') : t('team.bundlePlanBlocked') }}
      </p>
      <p class="mt-1 text-xs text-muted-foreground">
        {{ t('team.bundlePlanSummary', {
          skills: skillMembers.length,
          skillTargets: agents.length,
          mcp: mcpMembers.length,
          mcpTargets: mcpTargets.length,
        }) }}
      </p>
      <ul v-if="prepared.mcpPlans.length" class="mt-3 divide-y rounded-md border bg-background">
        <li v-for="item in prepared.mcpPlans" :key="item.source.path" class="px-3 py-2">
          <p class="text-sm font-medium">{{ item.source.name }}</p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ t('team.bundlePlanMcpActions', { n: item.plan.actions.length }) }}
          </p>
          <p
            v-for="action in item.plan.actions"
            :key="action.sourceId"
            class="mt-1 truncate font-mono text-xs text-muted-foreground"
            :title="action.configPath"
          >
            {{ action.target.agent }} · {{ action.target.surface }} · {{ action.target.scope }} · {{ action.configPath }}
          </p>
        </li>
      </ul>
      <p v-for="warning in planWarnings" :key="warning" class="mt-2 text-amber-700 dark:text-amber-400">
        {{ warning }}
      </p>
      <p v-for="blocker in planBlockers" :key="blocker" class="mt-2 text-destructive">
        {{ blocker }}
      </p>
    </div>

    <p v-if="error" class="break-all text-sm text-destructive">{{ error }}</p>
    <p v-if="success" class="text-sm text-emerald-700 dark:text-emerald-400">{{ success }}</p>

    <div class="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        :disabled="!selectionReady || preparing || installing"
        @click="prepare"
      >
        {{ preparing ? t('team.bundlePreparing') : t('team.bundlePrepare') }}
      </Button>
      <Button
        size="sm"
        :disabled="!planCanApply || installing"
        @click="installPrepared"
      >
        {{ installing ? t('team.bundleInstalling') : t('team.bundleInstall') }}
      </Button>
    </div>
  </div>
</template>
