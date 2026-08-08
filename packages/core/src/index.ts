export * from './types.js'
export * from './platforms.js'
export * from './adapters/index.js'
export {
  scanInstalledSkills,
  listPlatformStatus,
  listSkillRoots,
  type PlatformStatus,
  type SkillRoot,
} from './scanner.js'
export { aggregateSkills, type AggregatedSkill, type Installation } from './aggregate.js'
export { readSkillDir, findSkills, type FoundSkill } from './skill-io.js'
export {
  RegistryClient,
  RegistryError,
  toSkill,
  type RegistrySkill,
  type RegistrySkillSummary,
} from './registry-client.js'
export { planAdditiveInstall, planImportSync, targetKey, type AdditivePlan, type SyncAction, type SyncPairLike, type TargetRef } from './planners.js'
