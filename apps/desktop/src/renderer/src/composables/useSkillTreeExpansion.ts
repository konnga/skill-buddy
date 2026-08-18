import { shallowRef, watch, type Ref } from 'vue'
import type { SkillTreeRoot } from '@/lib/skill-agent-tree'

export function useSkillTreeExpansion(tree: Readonly<Ref<SkillTreeRoot[]>>) {
  const expandedRoots = shallowRef(new Set<string>())
  const expandedBranches = shallowRef(new Set<string>())
  const knownRoots = new Set<string>()
  const knownBranches = new Set<string>()

  /** 新出现的节点默认展开，用户主动收起的已知节点保持原状态。 */
  watch(
    tree,
    (roots) => {
      const nextRoots = new Set(expandedRoots.value)
      const nextBranches = new Set(expandedBranches.value)
      for (const root of roots) {
        if (!knownRoots.has(root.key)) {
          knownRoots.add(root.key)
          nextRoots.add(root.key)
        }
        for (const branch of root.branches) {
          const key = `${root.key}:${branch.key}`
          if (knownBranches.has(key)) continue
          knownBranches.add(key)
          nextBranches.add(key)
        }
      }
      expandedRoots.value = nextRoots
      expandedBranches.value = nextBranches
    },
    { immediate: true },
  )

  function toggleRoot(key: string): void {
    const next = new Set(expandedRoots.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    expandedRoots.value = next
  }

  function toggleBranch(key: string): void {
    const next = new Set(expandedBranches.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    expandedBranches.value = next
  }

  return { expandedRoots, expandedBranches, toggleRoot, toggleBranch }
}
