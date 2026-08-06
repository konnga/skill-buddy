import { computed, ref } from 'vue'
import type { AggregatedSkill, PlatformStatus, Skill } from '@skills-manager/core'
import type { InstallTarget, TargetResult } from '../../../shared/ipc.js'
import { useSettings } from './useSettings.js'

const skills = ref<AggregatedSkill[]>([])
const platforms = ref<PlatformStatus[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const search = ref('')
/** null = all platforms */
const platformFilter = ref<string | null>(null)
const driftOnly = ref(false)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return skills.value.filter((s) => {
    if (platformFilter.value && !s.installations.some((i) => i.agent === platformFilter.value))
      return false
    if (driftOnly.value && !s.hasDrift) return false
    if (!q) return true
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
    )
  })
})

const detectedPlatforms = computed(() => platforms.value.filter((p) => p.detected))

/** Count of skills per platform, for sidebar badges. */
const countByPlatform = computed(() => {
  const counts = new Map<string, number>()
  for (const s of skills.value) {
    for (const agent of new Set(s.installations.map((i) => i.agent))) {
      counts.set(agent, (counts.get(agent) ?? 0) + 1)
    }
  }
  return counts
})

async function refresh(): Promise<void> {
  const { projectRoots } = useSettings()
  loading.value = true
  error.value = null
  try {
    const [scanned, platformList] = await Promise.all([
      window.skillsManager.scanSkills([...projectRoots.value]),
      window.skillsManager.listPlatforms(),
    ])
    skills.value = scanned
    platforms.value = platformList
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

/** Install/write a concrete skill payload to the given targets. */
async function installSkill(skill: Skill, targets: InstallTarget[]): Promise<TargetResult[]> {
  const results = await window.skillsManager.installSkill(skill, targets)
  await refresh()
  return results
}

async function install(
  skill: AggregatedSkill,
  targets: InstallTarget[],
): Promise<TargetResult[]> {
  return installSkill(skill.installations[0]!.skill, targets)
}

async function uninstall(name: string, targets: InstallTarget[]): Promise<TargetResult[]> {
  const results = await window.skillsManager.uninstallSkill(name, targets)
  await refresh()
  return results
}

export function useSkills() {
  return {
    skills,
    platforms,
    detectedPlatforms,
    countByPlatform,
    loading,
    error,
    search,
    platformFilter,
    driftOnly,
    filtered,
    refresh,
    install,
    installSkill,
    uninstall,
  }
}
