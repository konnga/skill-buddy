import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AggregatedSkill } from '@skillbuddy/core'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
import { agentLabel } from '@/lib/agents'
import type { ToggleRequest, UninstallRequest } from '@/lib/skill-action-types'
import { manageableSkillInstallations } from '@/lib/skill-installations'

export function useSkillItemActions() {
  const { t } = useI18n()
  const { platformFilter, projectFilter, ownershipFilter, refresh, setEnabled } = useSkills()
  const removing = ref(new Set<string>())
  const toggling = ref(new Set<string>())
  const pendingUninstall = ref<UninstallRequest | null>(null)
  const pendingToggle = ref<ToggleRequest | null>(null)
  const busySkillNames = computed(() => new Set([...removing.value, ...toggling.value]))

  async function uninstallSkill(request: UninstallRequest): Promise<void> {
    if (removing.value.has(request.skill.name)) return
    const paths = request.installations.map((installation) => installation.path)
    removing.value = new Set([...removing.value, request.skill.name])
    try {
      const { token, results } = await window.skillsManager.trashUndoable(paths)
      const completed = results.filter((result) => result.ok).length
      const failed = results.length - completed
      if (completed > 0) {
        await refresh({ silent: true })
        showToast({
          message:
            failed > 0
              ? t('card.uninstallPartial', { completed, failed })
              : t('common.trashedN', { n: completed }),
          actionLabel: t('common.undo'),
          onAction: async () => {
            if (await window.skillsManager.undoTrash(token)) {
              await refresh({ silent: true })
              showToast({ message: t('common.restored') })
            }
          },
        })
      } else {
        showToast({ message: t('card.uninstallFailed') })
      }
    } catch {
      showToast({ message: t('card.uninstallFailed') })
    } finally {
      const next = new Set(removing.value)
      next.delete(request.skill.name)
      removing.value = next
    }
  }

  async function confirmUninstall(): Promise<void> {
    const request = pendingUninstall.value
    if (!request) return
    await uninstallSkill(request)
    pendingUninstall.value = null
  }

  function requestUninstall(
    skill: AggregatedSkill,
    platformId: string | null,
    requestedProjectFilter: string | null = projectFilter.value,
  ): void {
    const installations = manageableSkillInstallations(skill, {
      platformId,
      projectFilter: requestedProjectFilter,
      ownershipFilter: ownershipFilter.value,
    })
    if (installations.length === 0) return
    pendingUninstall.value = {
      skill,
      platformId,
      projectFilter: requestedProjectFilter,
      installations,
    }
  }

  function updateUninstallDialog(open: boolean): void {
    if (
      !open &&
      pendingUninstall.value &&
      !removing.value.has(pendingUninstall.value.skill.name)
    ) {
      pendingUninstall.value = null
    }
  }

  async function toggleSkill(request: ToggleRequest): Promise<void> {
    if (toggling.value.has(request.skill.name)) return
    toggling.value = new Set([...toggling.value, request.skill.name])
    try {
      const results = await setEnabled(
        request.skill.name,
        request.installations.map((installation) => ({
          agent: installation.agent,
          scope: installation.scope,
          projectRoot: installation.projectRoot,
        })),
        request.enabled,
      )
      const failed = results.filter((result) => !result.ok)
      const completed = results.length - failed.length
      if (completed > 0) {
        const message =
          request.context === 'agent'
            ? t(request.enabled ? 'card.enabledOnPlatform' : 'card.disabledOnPlatform', {
                platform: agentLabel(request.platformId ?? ''),
                n: completed,
              })
            : request.context === 'scopeAgent'
              ? t(
                  request.enabled
                    ? 'card.enabledInScopeOnPlatform'
                    : 'card.disabledInScopeOnPlatform',
                  {
                    platform: agentLabel(request.platformId ?? ''),
                    n: completed,
                  },
                )
              : request.context === 'scope'
                ? t(request.enabled ? 'card.enabledInScope' : 'card.disabledInScope', {
                    n: completed,
                  })
                : t(request.enabled ? 'card.enabledN' : 'card.disabledN', { n: completed })
        showToast({ message })
      }
      if (failed.length > 0) {
        showToast({ message: failed.map((result) => result.error).join('；') })
      }
    } finally {
      const next = new Set(toggling.value)
      next.delete(request.skill.name)
      toggling.value = next
    }
  }

  function requestToggle(
    skill: AggregatedSkill,
    requestedPlatformId: string | null = platformFilter.value,
    requestedProjectFilter: string | null = projectFilter.value,
  ): void {
    const installations = manageableSkillInstallations(skill, {
      platformId: requestedPlatformId,
      projectFilter: requestedProjectFilter,
      ownershipFilter: ownershipFilter.value,
    })
    if (installations.length === 0) return
    pendingToggle.value = {
      skill,
      platformId: requestedPlatformId,
      enabled: installations.every((installation) => installation.enabled === false),
      context:
        requestedProjectFilter && requestedPlatformId
          ? 'scopeAgent'
          : requestedProjectFilter
            ? 'scope'
            : requestedPlatformId
              ? 'agent'
              : 'global',
      installations,
    }
  }

  async function confirmToggle(): Promise<void> {
    const request = pendingToggle.value
    if (!request) return
    pendingToggle.value = null
    await toggleSkill(request)
  }

  function updateToggleDialog(open: boolean): void {
    if (!open && pendingToggle.value && !toggling.value.has(pendingToggle.value.skill.name)) {
      pendingToggle.value = null
    }
  }

  return {
    removing,
    toggling,
    pendingUninstall,
    pendingToggle,
    busySkillNames,
    requestUninstall,
    updateUninstallDialog,
    confirmUninstall,
    requestToggle,
    updateToggleDialog,
    confirmToggle,
  }
}
