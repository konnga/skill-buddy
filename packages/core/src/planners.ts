/**
 * Pure planning functions for multi-target install operations. The
 * desktop renderer orchestrates IPC around these; keeping the decision
 * logic here makes it unit-testable without an Electron harness.
 */

export interface TargetRef {
  agent: string
  scope: string
  projectRoot?: string
}

export const targetKey = (t: TargetRef): string =>
  `${t.agent}:${t.scope}:${t.projectRoot ?? ''}`

export interface AggregatedLike {
  name: string
  installations: TargetRef[]
}

export interface AdditivePlan<T extends TargetRef = TargetRef> {
  /** member names with no local copy at all — nothing to install from */
  missing: string[]
  /** per member, the subset of targets it is not yet installed on */
  installs: { name: string; targets: T[] }[]
}

/**
 * Additive install plan: never overwrite, only fill gaps. Used by group
 * apply, temporary enable and bulk import flows. Generic over the target
 * type so callers keep their precise scope literals through the plan.
 */
export function planAdditiveInstall<T extends TargetRef>(
  memberNames: string[],
  skills: AggregatedLike[],
  targets: T[],
): AdditivePlan<T> {
  const byName = new Map(skills.map((s) => [s.name, s]))
  const missing: string[] = []
  const installs: { name: string; targets: T[] }[] = []
  for (const name of memberNames) {
    const skill = byName.get(name)
    if (!skill) {
      missing.push(name)
      continue
    }
    const have = new Set(skill.installations.map(targetKey))
    const need = targets.filter((t) => !have.has(targetKey(t)))
    if (need.length > 0) installs.push({ name, targets: need })
  }
  return { missing, installs }
}

export interface SyncPairLike {
  source: string
  target: string
  scope: string
  projectRoot?: string
  /** names already handled — each syncs at most once */
  synced: string[]
}

export interface SyncAction {
  pairIndex: number
  name: string
  /** false = already present on target; still marked synced */
  install: boolean
}

/**
 * Standing import-sync plan: for every pair, skills that appeared on the
 * source (user scope) and were never handled. Additive and once-only —
 * deletions on the target are never re-forced.
 */
export function planImportSync(
  pairs: SyncPairLike[],
  skills: AggregatedLike[],
): SyncAction[] {
  const actions: SyncAction[] = []
  pairs.forEach((pair, pairIndex) => {
    const handled = new Set(pair.synced)
    for (const skill of skills) {
      if (handled.has(skill.name)) continue
      const onSource = skill.installations.some(
        (i) => i.agent === pair.source && i.scope === 'user',
      )
      if (!onSource) continue
      const alreadyThere = skill.installations.some(
        (i) =>
          i.agent === pair.target &&
          i.scope === pair.scope &&
          (i.projectRoot ?? '') === (pair.projectRoot ?? ''),
      )
      actions.push({ pairIndex, name: skill.name, install: !alreadyThere })
    }
  })
  return actions
}
