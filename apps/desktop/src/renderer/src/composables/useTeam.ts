import { computed, ref, watch } from 'vue'
import type { InstallTarget, TargetResult } from '../../../shared/ipc.js'
import { useSettings } from './useSettings.js'
import { useSkills } from './useSkills.js'

export interface UpdateItem {
  org: string
  name: string
  localVersion: string
  remoteVersion: string
}

export interface MissingRequired {
  org: string
  name: string
}

const updates = ref<UpdateItem[]>([])
const missingRequired = ref<MissingRequired[]>([])
const checking = ref(false)

/** true when a is strictly older than b (loose semver, numeric parts) */
function versionLt(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da < db
  }
  return false
}

/**
 * Compare local skills against the registry: newer published versions
 * for skills we have, and required-policy skills we are missing.
 */
export async function checkTeamStatus(): Promise<void> {
  const { registryUrl, registryToken } = useSettings()
  const { skills } = useSkills()
  if (!registryUrl.value || !registryToken.value) {
    updates.value = []
    missingRequired.value = []
    return
  }
  const cfg = { url: registryUrl.value, token: registryToken.value }
  checking.value = true
  try {
    const [remote, orgs] = await Promise.all([
      window.skillsManager.registrySearch(cfg),
      window.skillsManager.registryOrgs(cfg),
    ])
    const localByName = new Map(skills.value.map((s) => [s.name, s]))

    updates.value = remote.flatMap((r) => {
      const local = localByName.get(r.name)
      if (
        !local?.version ||
        !local.installations.some((installation) => !installation.readOnly) ||
        !versionLt(local.version, r.version)
      ) return []
      return [{ org: r.org, name: r.name, localVersion: local.version, remoteVersion: r.version }]
    })

    const missing: MissingRequired[] = []
    for (const org of orgs) {
      const required = await window.skillsManager.registryRequired(cfg, org.name)
      for (const name of required) {
        if (!localByName.has(name)) missing.push({ org: org.name, name })
      }
    }
    missingRequired.value = missing
  } catch {
    // registry unreachable — keep silent, dashboard just shows nothing
  } finally {
    checking.value = false
  }
}

/** Upgrade: reinstall the registry version into every end it's on locally. */
export async function upgradeSkill(item: UpdateItem): Promise<TargetResult[]> {
  const { registryUrl, registryToken } = useSettings()
  const { skills, refresh } = useSkills()
  const local = skills.value.find((s) => s.name === item.name)
  const targets: InstallTarget[] = (local?.installations ?? [])
    .filter((installation) => !installation.readOnly)
    .map((installation) => ({
      agent: installation.agent,
      scope: installation.scope,
      projectRoot: installation.projectRoot,
    }))
  const results = await window.skillsManager.registryInstall(
    { url: registryUrl.value, token: registryToken.value },
    item.org,
    item.name,
    targets,
  )
  await refresh()
  await checkTeamStatus()
  return results
}

/** Install a missing required skill into all detected platforms (user scope). */
export async function installRequired(item: MissingRequired): Promise<TargetResult[]> {
  const { registryUrl, registryToken } = useSettings()
  const { detectedPlatforms, refresh } = useSkills()
  const targets: InstallTarget[] = detectedPlatforms.value.map((p) => ({
    agent: p.id,
    scope: 'user',
  }))
  const results = await window.skillsManager.registryInstall(
    { url: registryUrl.value, token: registryToken.value },
    item.org,
    item.name,
    targets,
  )
  await refresh()
  await checkTeamStatus()
  return results
}

let wired = false

export function useTeam() {
  if (!wired) {
    wired = true
    const { skills } = useSkills()
    // re-check whenever a scan lands
    watch(skills, () => void checkTeamStatus())
  }
  return {
    updates,
    missingRequired,
    checking,
    attentionCount: computed(() => updates.value.length + missingRequired.value.length),
  }
}
