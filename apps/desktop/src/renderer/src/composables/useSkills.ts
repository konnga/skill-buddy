import { computed, ref } from 'vue'
import type { AggregatedSkill, PlatformStatus, Skill } from '@skillbuddy/core'
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
/** active group name filter (sidebar) */
const groupFilter = ref<string | null>(null)
/** null = all; managed = editable installs; agent = read-only installs */
const ownershipFilter = ref<'managed' | 'agent' | null>(null)
const sortBy = ref<'name' | 'recent'>('name')

const lastModified = (s: AggregatedSkill): number =>
  Math.max(0, ...s.installations.map((i) => i.modifiedAt ?? 0))

/** Convert Vue reactive values into contextBridge-safe plain data. */
function cloneForIpc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Return a relevance score when every search token matches at least one field. */
function searchScore(skill: AggregatedSkill, query: string, tokens: string[]): number | null {
  const name = skill.name.toLowerCase()
  const description = skill.description.toLowerCase()
  const tags = skill.tags.map((tag) => tag.toLowerCase())
  const fields = [name, description, ...tags]

  if (!tokens.every((token) => fields.some((field) => field.includes(token)))) return null

  let score = 0
  if (name === query) score += 1000
  else if (name.startsWith(query)) score += 800
  else if (name.includes(query)) score += 600

  for (const token of tokens) {
    if (name === token) score += 300
    else if (name.startsWith(token)) score += 120
    else if (name.includes(token)) score += 90

    if (tags.some((tag) => tag === token)) score += 70
    else if (tags.some((tag) => tag.includes(token))) score += 50
    if (description.includes(token)) score += 20
  }
  return score
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const tokens = q ? q.split(/\s+/) : []
  const matches = skills.value.flatMap((s) => {
    if (platformFilter.value && !s.installations.some((i) => i.agent === platformFilter.value))
      return []
    if (projectFilter.value === 'user' && !s.installations.some((i) => i.scope === 'user'))
      return []
    if (
      projectFilter.value &&
      projectFilter.value !== 'user' &&
      !s.installations.some((i) => i.projectRoot === projectFilter.value)
    )
      return []
    if (groupFilter.value) {
      const { groups } = useSettings()
      const group = groups.value.find((g) => g.name === groupFilter.value)
      if (!group || !group.skills.includes(s.name)) return []
    }
    if (
      ownershipFilter.value === 'managed' &&
      !s.installations.some((installation) => !installation.readOnly)
    )
      return []
    if (
      ownershipFilter.value === 'agent' &&
      !s.installations.some((installation) => installation.readOnly)
    )
      return []
    if (driftOnly.value && !s.hasDrift) return []
    const score = q ? searchScore(s, q, tokens) : 0
    return score === null ? [] : [{ skill: s, score }]
  })

  return matches
    .sort((a, b) => {
      if (q && b.score !== a.score) return b.score - a.score
      if (sortBy.value === 'recent') {
        const recentDiff = lastModified(b.skill) - lastModified(a.skill)
        if (recentDiff !== 0) return recentDiff
      }
      return a.skill.name.localeCompare(b.skill.name)
    })
    .map(({ skill }) => skill)
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
async function installSkill(
  skill: Skill,
  targets: InstallTarget[],
  options: { refresh?: boolean } = {},
): Promise<TargetResult[]> {
  const results = await window.skillsManager.installSkill(
    cloneForIpc(skill),
    cloneForIpc(targets),
  )
  if (options.refresh !== false) await refresh()
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

async function setEnabled(
  name: string,
  targets: InstallTarget[],
  enabled: boolean,
): Promise<TargetResult[]> {
  const results = await window.skillsManager.setSkillEnabled(name, targets, enabled)
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
    groupFilter,
    ownershipFilter,
    sortBy,
    filtered,
    refresh,
    install,
    installSkill,
    uninstall,
    setEnabled,
  }
}
