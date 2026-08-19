import { computed, ref, shallowRef } from 'vue'
import type { AggregatedSkill, PlatformStatus, Skill } from '@skillbuddy/core'
import type { InstallTarget, TargetResult } from '#shared/ipc'
import { i18n } from '../i18n'
import { matchesSkillInstallation } from '../lib/skill-installations'
import { useSettings } from './useSettings'

const skills = ref<AggregatedSkill[]>([])
const platforms = ref<PlatformStatus[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const lastCheckedAt = shallowRef<number | null>(null)

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
  const installationFilter = {
    platformId: platformFilter.value,
    projectFilter: projectFilter.value,
    ownershipFilter: ownershipFilter.value,
  }
  const matches = skills.value.flatMap((s) => {
    if (
      (platformFilter.value || projectFilter.value || ownershipFilter.value) &&
      !s.installations.some((installation) =>
        matchesSkillInstallation(installation, installationFilter),
      )
    )
      return []
    if (groupFilter.value) {
      const { groups } = useSettings()
      const group = groups.value.find((g) => g.name === groupFilter.value)
      if (!group || !group.skills.includes(s.name)) return []
    }
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

export interface ProjectPlatformCount {
  id: string
  displayName: string
  count: number
}

/** Count skills by platform within each project scope for the sidebar hierarchy. */
const projectPlatformCounts = computed<Map<string, ProjectPlatformCount[]>>(() => {
  const countsByProject = new Map<string, Map<string, number>>()
  for (const skill of skills.value) {
    const agentsByProject = new Map<string, Set<string>>()
    for (const installation of skill.installations) {
      if (!installation.projectRoot) continue
      const agents = agentsByProject.get(installation.projectRoot) ?? new Set<string>()
      agents.add(installation.agent)
      agentsByProject.set(installation.projectRoot, agents)
    }
    for (const [projectRoot, agents] of agentsByProject) {
      const counts = countsByProject.get(projectRoot) ?? new Map<string, number>()
      for (const agent of agents) counts.set(agent, (counts.get(agent) ?? 0) + 1)
      countsByProject.set(projectRoot, counts)
    }
  }

  const platformOrder = new Map(platforms.value.map((platform, index) => [platform.id, index]))
  return new Map<string, ProjectPlatformCount[]>(
    [...countsByProject].map(([projectRoot, counts]) => {
      const projectPlatforms = [...counts.entries()]
        .sort(
          ([a], [b]) =>
            (platformOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
            (platformOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
        )
        .map(([id, count]) => ({
          id,
          displayName: platforms.value.find((platform) => platform.id === id)?.displayName ?? id,
          count,
        }))
      return [projectRoot, projectPlatforms] as [string, ProjectPlatformCount[]]
    }),
  )
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
    lastCheckedAt.value = Date.now()
    notifyDriftIfNeeded(scanned)
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
    if (!useSettings().autoRefresh.value) return
    clearTimeout(timer)
    timer = setTimeout(() => void refresh({ silent: true }), 300)
  })
}

/** 漂移数量相比上次扫描增加时发系统通知（可在设置中开启）。 */
let lastDriftCount: number | null = null
function notifyDriftIfNeeded(scanned: AggregatedSkill[]): void {
  const driftCount = scanned.filter((s) => s.hasDrift).length
  const previous = lastDriftCount
  lastDriftCount = driftCount
  if (previous === null || driftCount <= previous) return
  if (!useSettings().notifyDrift.value) return
  new Notification('SkillBuddy', {
    body: i18n.global.t('notifications.driftDetected', { n: driftCount }),
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
  if (useSettings().confirmUninstall.value) {
    const confirmed = await window.skillsManager.confirmDialog({
      title: i18n.global.t('settings.confirmUninstallTitle'),
      message: i18n.global.t('settings.confirmUninstallMsg', { name, n: targets.length }),
      confirmLabel: i18n.global.t('settings.confirmUninstallAction'),
      cancelLabel: i18n.global.t('common.cancel'),
      danger: true,
    })
    if (!confirmed) return []
  }
  const results = await window.skillsManager.uninstallSkill(name, targets)
  await refresh()
  return results
}

async function setEnabled(
  name: string,
  targets: InstallTarget[],
  enabled: boolean,
  options: { refresh?: boolean } = {},
): Promise<TargetResult[]> {
  const results = await window.skillsManager.setSkillEnabled(name, targets, enabled)
  if (options.refresh !== false) await refresh()
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
    lastCheckedAt,
    search,
    platformFilter,
    projectFilter,
    countByProject,
    projectPlatformCounts,
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
