import { dirname, isAbsolute, resolve, relative, sep } from 'node:path'
import { findInstructionProfile } from './profiles.js'
import { instructionEffectiveDirectory } from './paths.js'
import { surfaceKey } from './types.js'
import type { EffectiveInstructionChain, InstructionDiagnostic, InstructionDocument, SurfaceRef } from './types.js'

function inRoot(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

export function deriveEffectiveInstructionChain(
  surface: SurfaceRef,
  projectRoot: string,
  targetDirectory: string,
  documents: InstructionDocument[],
): EffectiveInstructionChain {
  const profile = findInstructionProfile(surface)
  const root = resolve(projectRoot)
  const target = resolve(targetDirectory)
  const warnings: InstructionDiagnostic[] = []
  if (!profile) {
    warnings.push({ code: 'unknown-surface', severity: 'error', message: '未找到该工具的规则注册信息', paths: [], fixable: false })
    return { surface, projectRoot: root, targetDirectory: target, documents: [], warnings, includesGlobal: false }
  }
  if (!inRoot(root, target)) {
    warnings.push({ code: 'target-outside-project', severity: 'error', message: '目标目录不在已登记项目内', paths: [target], fixable: false })
    return { surface, projectRoot: root, targetDirectory: target, documents: [], warnings, includesGlobal: false }
  }
  if (profile.evidence === 'community' || profile.evidence === 'unknown') {
    warnings.push({ code: 'unverified-rule', severity: 'warning', message: `规则证据等级：${profile.evidence}`, paths: [], fixable: false })
    return { surface, projectRoot: root, targetDirectory: target, documents: [], warnings, includesGlobal: false }
  }
  const projectDocuments = documents.filter((document) => document.scope === 'project' && document.projectRoot === root)
  const levels: string[] = []
  let cursor = target
  while (inRoot(root, cursor)) {
    levels.unshift(cursor)
    if (cursor === root) break
    cursor = dirname(cursor)
  }
  const selected: InstructionDocument[] = []
  for (const level of levels) {
    const matches = projectDocuments.filter((document) => instructionEffectiveDirectory(document, profile) === level && document.bindings.some((binding) =>
      surfaceKey(binding.surface) === surfaceKey(surface)
      && binding.role !== 'requires-config'
      && binding.role !== 'unsupported'
      && binding.role !== 'shadowed',
    ))
    const precedence = (fileName: string): number => {
      const index = profile.sameDirectoryPrecedence.findIndex((candidate) => candidate.split(/[\\/]/).at(-1) === fileName)
      return index === -1 ? Number.MAX_SAFE_INTEGER : index
    }
    const overrides = profile.overrideCandidates?.map((candidate) => candidate.split(/[\\/]/).at(-1)) ?? []
    const effectiveMatches = matches.some((document) => overrides.includes(document.fileName))
      ? matches.filter((document) => overrides.includes(document.fileName))
      : matches
    const byPrecedence = [...effectiveMatches].sort((a, b) => precedence(a.fileName) - precedence(b.fileName))
    if (profile.traversal === 'nearest-match' && byPrecedence.length > 0) {
      selected.splice(0, selected.length)
      const nearest = byPrecedence[0]
      if (nearest) selected.push(nearest)
    } else {
      selected.push(...byPrecedence)
    }
  }
  const globalDocuments = documents.filter((document) => document.scope === 'user' && document.bindings.some((binding) => surfaceKey(binding.surface) === surfaceKey(surface)))
  const chain = [...globalDocuments, ...selected]
  const requiresConfig = documents.some((document) => document.bindings.some((binding) =>
    surfaceKey(binding.surface) === surfaceKey(surface) && binding.role === 'requires-config',
  ))
  if (requiresConfig) warnings.push({ code: 'requires-config', severity: 'info', message: '发现需要工具配置后才会生效的候选指令', paths: [], fixable: false })
  const unsupportedProjectInstructions = ['workbuddy', 'workbuddy-ai'].includes(profile.key.productId)
  if (unsupportedProjectInstructions) warnings.push({ code: 'unsupported', severity: 'info', message: '该工具没有已验证的项目指令文件机制', paths: [], fixable: false })
  if (chain.length === 0 && !unsupportedProjectInstructions) warnings.push({ code: 'no-instructions', severity: 'warning', message: '目标目录没有发现该工具的指令文件', paths: [target], fixable: false })
  // community / unknown 已在上面提前返回，此处只会命中 verified：给出链但标注证据等级。
  if (profile.evidence !== 'official') warnings.push({ code: 'unverified-rule', severity: 'info', message: `规则证据等级：${profile.evidence}`, paths: [], fixable: false })
  return { surface, projectRoot: root, targetDirectory: target, documents: chain, warnings, includesGlobal: globalDocuments.length > 0 }
}
