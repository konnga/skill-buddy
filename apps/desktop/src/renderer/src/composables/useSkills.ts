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
/** null = all; 'user' = user scope only; other = a project root path */
const projectFilter = ref<string | null>(null)
const driftOnly = ref(false)
const sortBy = ref<'name' | 'recent'>('name')

const lastModified = (s: AggregatedSkill): number =>
  Math.max(0, ...s.installations.map((i) => i.modifiedAt ?? 0))

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = skills.value.filter((s) => {
    if (platformFilter.value && !s.installations.some((i) => i.agent === platformFilter.value))
      return false
    if (projectFilter.value === 'user' && !s.installations.some((i) => i.scope === 'user'))
      return false
    if (
      projectFilter.value &&
      projectFilter.value !== 'user' &&
      !s.installations.some((i) => i.projectRoot === projectFilter.value)
    )
      return false
    if (driftOnly.value && !s.hasDrift) return false
    if (!q) return true
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
    )
  })
  return sortBy.value === 'recent'
    ? [...list].sort((a, b) => lastModified(b) - lastModified(a))
    : list
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

/** Count of skills per project root, for the sidebar projects section. */
const countByProject = computed(() => {
  const counts = new Map<string, number>()
  for (const s of skills.value) {
    for (const root of new Set(
      s.installations.flatMap((i) => (i.projectRoot ? [i.projectRoot] : [])),
    )) {
      counts.set(root, (counts.get(root) ?? 0) + 1)
    }
  }
  return counts
})

async function refresh(options: { silent?: boolean } = {}): Promise<void> {
  const { projectRoots } = useSettings()
  if (!options.silent) loading.value = true
  error.value = null
  try {
    const [scanned, platformList] = await Promise.all([
      window.skillsManager.scanSkills([...projectRoots.value]),
      window.skillsManager.listPlatforms(),
    ])
    skills.value = scanned
    platforms.value = platformList
    void window.skillsManager.watchStart([...projectRoots.value])
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (!options.silent) loading.value = false
  }
}

/* auto-refresh (silently) when skills dirs change on disk */
let watcherWired = false
if (!watcherWired) {
  watcherWired = true
  let timer: ReturnType<typeof setTimeout> | undefined
  window.skillsManager.onSkillsChanged(() => {
    clearTimeout(timer)
    timer = setTimeout(() => void refresh({ silent: true }), 300)
  })
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
    projectFilter,
    countByProject,
    driftOnly,
    sortBy,
    filtered,
    refresh,
    install,
    installSkill,
    uninstall,
  }
}
