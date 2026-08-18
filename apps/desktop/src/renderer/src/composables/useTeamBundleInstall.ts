import { computed, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import type { McpOperationPlanView, McpTarget } from '@skillbuddy/core'
import type {
  InstallTarget,
  TeamLibraryBundleSummary,
  TeamLibraryMcp,
  TeamLibraryMcpSummary,
} from '../../../shared/ipc.js'
import { teamLibraryConfigKey } from '../../../shared/team-library.js'
import { useMcpServers } from '@/composables/useMcpServers'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { useTeamLibraries } from '@/composables/useTeamLibraries'
import { agentLabel } from '@/lib/agents'

export interface PreparedMcpPlan {
  source: TeamLibraryMcpSummary
  detail: TeamLibraryMcp
  plan: McpOperationPlanView
}

export interface PreparedBundlePlan {
  signature: string
  mcpPlans: PreparedMcpPlan[]
}

export function useTeamBundleInstall(bundleInput: MaybeRefOrGetter<TeamLibraryBundleSummary>) {
  const { t } = useI18n()
  const { teamLibraries, projectRoots } = useSettings()
  const { refresh: refreshSkills } = useSkills()
  const { platforms, refresh: refreshMcp } = useMcpServers()
  const { skills, mcpServers, policyState, refreshInstallations } = useTeamLibraries()
  const skillTargets = ref<InstallTarget[]>([])
  const mcpTargets = ref<McpTarget[]>([])
  const preparing = shallowRef(false)
  const installing = shallowRef(false)
  const prepared = shallowRef<PreparedBundlePlan | null>(null)
  const error = shallowRef<string | null>(null)
  const success = shallowRef<string | null>(null)
  const bundle = computed(() => toValue(bundleInput))

  const skillMembers = computed(() => {
    const byPath = new Map(
      skills.value
        .filter((item) => item.libraryId === bundle.value.libraryId)
        .map((item) => [item.path, item]),
    )
    return bundle.value.skills.flatMap((ref) => byPath.get(ref) ?? [])
  })
  const mcpMembers = computed(() => {
    const byPath = new Map(
      mcpServers.value
        .filter((item) => item.libraryId === bundle.value.libraryId)
        .map((item) => [item.path, item]),
    )
    return bundle.value.mcpServers.flatMap((ref) => byPath.get(ref) ?? [])
  })
  const blockedReasons = computed<Record<string, string>>(() =>
    Object.fromEntries(
      [...skillMembers.value, ...mcpMembers.value].flatMap((item): [string, string][] => {
        const reason = policyState(item).blockedReason
        return reason ? [[item.path, reason]] : []
      }),
    ),
  )
  const blockedEntries = computed(() => Object.entries(blockedReasons.value))
  const requiredSecrets = computed(() => [
    ...new Set(mcpMembers.value.flatMap((item) => item.requiredSecrets)),
  ])
  const hasMissing = computed(
    () => bundle.value.missingSkills.length + bundle.value.missingMcpServers.length > 0,
  )

  function targetKey(target: McpTarget): string {
    return [target.agent, target.surface, target.scope, target.projectRoot ?? ''].join(':')
  }

  const selectionSignature = computed(() =>
    JSON.stringify({
      skillTargets: skillTargets.value
        .map((target) => [target.agent, target.scope, target.projectRoot ?? ''].join(':'))
        .sort(),
      mcpTargets: mcpTargets.value.map(targetKey).sort(),
    }),
  )
  const selectionReady = computed(
    () =>
      !hasMissing.value &&
      blockedEntries.value.length === 0 &&
      (skillMembers.value.length === 0 || skillTargets.value.length > 0) &&
      (mcpMembers.value.length === 0 || mcpTargets.value.length > 0),
  )
  const planCurrent = computed(() => prepared.value?.signature === selectionSignature.value)
  const planCanApply = computed(
    () =>
      planCurrent.value && prepared.value?.mcpPlans.every((item) => item.plan.canApply) === true,
  )
  const planWarnings = computed(
    () =>
      prepared.value?.mcpPlans.flatMap((item) =>
        item.plan.warnings.map((issue) => `${item.source.name}: ${issue.message}`),
      ) ?? [],
  )
  const planBlockers = computed(
    () =>
      prepared.value?.mcpPlans.flatMap((item) =>
        item.plan.blockers.map((issue) => `${item.source.name}: ${issue.message}`),
      ) ?? [],
  )

  watch(selectionSignature, () => {
    prepared.value = null
    success.value = null
  })

  function configForBundle() {
    const bundleKey = teamLibraryConfigKey(bundle.value)
    const config = teamLibraries.value.find((item) => teamLibraryConfigKey(item) === bundleKey)
    if (!config) throw new Error(t('team.bundleLibraryMissing'))
    return config
  }

  async function prepare(): Promise<void> {
    if (!selectionReady.value) return
    const requestedSignature = selectionSignature.value
    const requestedMcpTargets = mcpTargets.value.map((target) => ({ ...target }))
    preparing.value = true
    error.value = null
    success.value = null
    prepared.value = null
    try {
      const config = configForBundle()
      const mcpPlans: PreparedMcpPlan[] = []
      for (const source of mcpMembers.value) {
        await window.skillsManager.teamLibraryAssertMcpInstall(
          config,
          source.path,
          requestedMcpTargets,
        )
        const detail = await window.skillsManager.teamLibraryGetMcp(config, source.path)
        const plan = await window.skillsManager.createMcpUpsertPlan({
          projectRoots: [...projectRoots.value],
          definition: JSON.parse(JSON.stringify(detail.definition)),
          targets: JSON.parse(JSON.stringify(requestedMcpTargets)),
        })
        mcpPlans.push({ source, detail, plan })
      }
      /** 记录发起准备时的选择；期间目标变化后该计划不会被当成当前计划。 */
      prepared.value = { signature: requestedSignature, mcpPlans }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      preparing.value = false
    }
  }

  async function installPrepared(): Promise<void> {
    if (!prepared.value || !planCanApply.value) return
    const preparedPlan = prepared.value
    const requestedSkillTargets = skillTargets.value.map((target) => ({ ...target }))
    const requestedMcpTargets = mcpTargets.value.map((target) => ({ ...target }))
    installing.value = true
    error.value = null
    success.value = null
    const failures: string[] = []
    let installedSkills = 0
    let installedMcp = 0
    try {
      const config = configForBundle()
      for (const item of skillMembers.value) {
        try {
          const results = await window.skillsManager.teamLibraryInstallSkill(
            config,
            item.path,
            requestedSkillTargets,
          )
          if (results.some((result) => result.ok)) installedSkills += 1
          failures.push(
            ...results
              .filter((result) => !result.ok)
              .map(
                (result) =>
                  `${item.name} · ${agentLabel(result.target.agent)}: ${result.error}`,
              ),
          )
        } catch (cause) {
          failures.push(`${item.name}: ${cause instanceof Error ? cause.message : String(cause)}`)
        }
      }
      for (const item of preparedPlan.mcpPlans) {
        try {
          await window.skillsManager.teamLibraryAssertMcpInstall(
            config,
            item.source.path,
            requestedMcpTargets,
          )
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
          failures.push(
            ...result.results
              .filter((entry) => !entry.ok)
              .map(
                (entry) =>
                  `${item.source.name}: ${entry.error ?? entry.code ?? t('team.bundleUnknownError')}`,
              ),
          )
        } catch (cause) {
          failures.push(
            `${item.source.name}: ${cause instanceof Error ? cause.message : String(cause)}`,
          )
        }
      }
      await Promise.all([
        refreshSkills(),
        refreshMcp({ silent: true }),
        refreshInstallations(),
      ])
      success.value = t('team.bundleInstallSuccess', {
        skills: installedSkills,
        mcp: installedMcp,
      })
      if (failures.length > 0) error.value = failures.join('；')
      prepared.value = null
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      installing.value = false
    }
  }

  return {
    projectRoots,
    platforms,
    skillTargets,
    mcpTargets,
    preparing,
    installing,
    prepared,
    error,
    success,
    skillMembers,
    mcpMembers,
    blockedReasons,
    blockedEntries,
    requiredSecrets,
    selectionReady,
    planCurrent,
    planCanApply,
    planWarnings,
    planBlockers,
    prepare,
    installPrepared,
  }
}
