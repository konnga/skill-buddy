import { computed, onMounted, ref, shallowRef, toValue, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import type { InstallTarget } from '../../../shared/ipc.js'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
import { agentLabel } from '@/lib/agents'
import {
  bundleText,
  matchFoundSkill,
  type BundleSkillRef,
  type SkillBundle,
} from '@/lib/bundles'

interface UseBundleSkillInstallOptions {
  bundle: MaybeRefOrGetter<SkillBundle>
  onInstalled: () => void
}

export function useBundleSkillInstall(options: UseBundleSkillInstallOptions) {
  const { t, locale } = useI18n()
  const { skills, detectedPlatforms, installSkill, refresh: refreshSkills } = useSkills()
  const { groups } = useSettings()
  const bundle = computed(() => toValue(options.bundle))
  const selectedSkills = shallowRef(new Set(bundle.value.skills.map((skill) => skill.name)))
  const targets = ref<InstallTarget[]>([])
  const busy = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const note = shallowRef<string | null>(null)
  const progress = shallowRef<{ n: number; total: number } | null>(null)

  const selectedCount = computed(() => selectedSkills.value.size)
  const installDisabled = computed(
    () => busy.value || selectedCount.value === 0 || targets.value.length === 0,
  )
  const localSkillNames = computed(() => new Set(skills.value.map((skill) => skill.name)))

  onMounted(() => {
    targets.value = detectedPlatforms.value.map((platform) => ({
      agent: platform.id,
      scope: 'user',
    }))
  })

  function toggleSkill(name: string): void {
    if (busy.value) return
    const next = new Set(selectedSkills.value)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    selectedSkills.value = next
  }

  function setTargets(value: InstallTarget[]): void {
    targets.value = value
  }

  async function installSelectedSkills(
    chosen: BundleSkillRef[],
    requestedTargets: InstallTarget[],
  ): Promise<boolean> {
    const failures: string[] = []
    const installedNames: string[] = []
    const roots: string[] = []
    const fetchCache = new Map<
      string,
      Awaited<ReturnType<typeof window.skillsManager.importFromGit>>
    >()

    try {
      for (const [index, skillRef] of chosen.entries()) {
        progress.value = { n: index + 1, total: chosen.length }
        try {
          const local = skills.value.find((skill) => skill.name === skillRef.name)
          if (local) {
            const missingTargets = requestedTargets.filter(
              (target) =>
                !local.installations.some(
                  (installation) =>
                    installation.agent === target.agent &&
                    installation.scope === target.scope &&
                    (installation.projectRoot ?? '') === (target.projectRoot ?? ''),
                ),
            )
            if (missingTargets.length > 0) {
              const results = await installSkill(local.installations[0]!.skill, missingTargets, {
                refresh: false,
              })
              failures.push(
                ...results
                  .filter((result) => !result.ok)
                  .map(
                    (result) =>
                      `${skillRef.name} → ${agentLabel(result.target.agent)}: ${result.error}`,
                  ),
              )
            }
            installedNames.push(skillRef.name)
            continue
          }

          let fetched: Awaited<ReturnType<typeof window.skillsManager.importFromGit>>
          if (skillRef.source === 'skills-sh') {
            const cached = fetchCache.get(skillRef.repo)
            if (cached) fetched = cached
            else {
              fetched = await window.skillsManager.importFromGit(
                `https://github.com/${skillRef.repo}`,
              )
              fetchCache.set(skillRef.repo, fetched)
              roots.push(fetched.root)
            }
          } else {
            fetched = await window.skillsManager.skillhubFetch(
              skillRef.slug,
              skillRef.namespace,
            )
            roots.push(fetched.root)
          }

          const wanted = skillRef.source === 'skills-sh' ? skillRef.skillId : skillRef.slug
          const found = matchFoundSkill(fetched.items, wanted, skillRef.source)
          if (!found) {
            failures.push(`${skillRef.name}: ${t('market.notFound')}`)
            continue
          }
          const results = await installSkill(found.skill, requestedTargets, { refresh: false })
          failures.push(
            ...results
              .filter((result) => !result.ok)
              .map(
                (result) =>
                  `${skillRef.name} → ${agentLabel(result.target.agent)}: ${result.error}`,
              ),
          )
          if (results.some((result) => result.ok)) installedNames.push(skillRef.name)
        } catch (cause) {
          failures.push(
            `${skillRef.name}: ${cause instanceof Error ? cause.message : String(cause)}`,
          )
        }
      }
    } finally {
      await Promise.allSettled(roots.map((root) => window.skillsManager.cleanupImport(root)))
      progress.value = null
    }

    const groupName = bundleText(bundle.value.name, locale.value)
    if (installedNames.length > 0) {
      const existing = groups.value.find((group) => group.name === groupName)
      groups.value = existing
        ? groups.value.map((group) =>
            group.name === groupName
              ? { ...group, skills: [...new Set([...group.skills, ...installedNames])] }
              : group,
          )
        : [...groups.value, { name: groupName, skills: installedNames }]
    }
    await refreshSkills()

    if (failures.length === 0) return true
    error.value = failures.join('；')
    if (installedNames.length > 0) {
      note.value = t('bundles.partial', { n: installedNames.length, group: groupName })
    }
    return false
  }

  async function beginInstall(): Promise<void> {
    if (installDisabled.value) return
    const requestedTargets = targets.value.map((target) => ({ ...target }))
    const chosen = bundle.value.skills.filter((skill) => selectedSkills.value.has(skill.name))
    error.value = null
    note.value = null
    busy.value = true
    try {
      const success = await installSelectedSkills(chosen, requestedTargets)
      if (!success) return
      showToast({
        message: t('bundles.installSuccess', {
          name: bundleText(bundle.value.name, locale.value),
        }),
      })
      options.onInstalled()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      busy.value = false
    }
  }

  return {
    selectedSkills,
    targets,
    busy,
    error,
    note,
    progress,
    selectedCount,
    installDisabled,
    localSkillNames,
    toggleSkill,
    setTargets,
    beginInstall,
  }
}
