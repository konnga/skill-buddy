import { homedir } from 'node:os'
import { join } from 'node:path'
import type { InstructionBridgeStrategy, InstructionRuleProfile, SurfaceRef } from './types.js'

const home = homedir()
const surface = (vendorId: string, productId: string, surfaceId: string): SurfaceRef => ({
  vendorId,
  productId,
  surfaceId,
})

const base = {
  platformId: null,
  localOverlayCandidates: [],
  supportsNested: true as const,
  traversal: 'merge-root-to-leaf' as const,
  sameDirectoryPrecedence: ['AGENTS.md'],
  projectFallbacks: [],
  bridgeStrategies: ['markdown-import'] as InstructionBridgeStrategy[],
  evidence: 'official' as const,
}

/** 首期只注册有稳定公开约定的 Surface；规则属性可独立扩展，不依赖 Skill Adapter。 */
export const INSTRUCTION_PROFILES: InstructionRuleProfile[] = [
  {
    ...base,
    key: surface('openai', 'codex', 'cli'),
    displayName: 'Codex',
    platformId: 'codex',
    globalPaths: [join(home, '.codex', 'AGENTS.md')],
    projectFileCandidates: ['AGENTS.md'],
  },
  {
    ...base,
    key: surface('cursor', 'cursor', 'ide'),
    displayName: 'Cursor',
    platformId: 'cursor',
    globalPaths: [],
    projectFileCandidates: ['AGENTS.md'],
    rulesDirCandidates: ['.cursor/rules'],
  },
  {
    ...base,
    key: surface('anthropic', 'claude-code', 'cli'),
    displayName: 'Claude Code',
    platformId: 'claude-code',
    globalPaths: [join(home, '.claude', 'CLAUDE.md')],
    projectFileCandidates: ['CLAUDE.md'],
    sameDirectoryPrecedence: ['CLAUDE.md'],
  },
  {
    ...base,
    key: surface('deepseek', 'harness', 'cli'),
    displayName: 'DeepSeek Harness',
    platformId: 'deepseek-harness',
    globalPaths: [join(home, '.dsh', 'AGENTS.md')],
    projectFileCandidates: ['AGENTS.md', 'CLAUDE.md'],
    localOverlayCandidates: ['AGENTS.local.md', 'CLAUDE.local.md'],
    sameDirectoryPrecedence: [
      'AGENTS.md',
      'CLAUDE.md',
      'AGENTS.local.md',
      'CLAUDE.local.md',
    ],
    traversal: 'dynamic-root-to-target',
  },
  {
    ...base,
    key: surface('sst', 'opencode', 'cli'),
    displayName: 'OpenCode',
    platformId: 'opencode',
    globalPaths: [join(home, '.config', 'opencode', 'AGENTS.md')],
    projectFileCandidates: ['AGENTS.md'],
    projectFallbacks: ['CLAUDE.md'],
    traversal: 'nearest-match',
    sameDirectoryPrecedence: ['AGENTS.md', 'CLAUDE.md'],
  },
  {
    ...base,
    key: surface('badlogic', 'pi', 'cli'),
    displayName: 'Pi Coding Agent',
    globalPaths: [join(home, '.pi', 'agent', 'AGENTS.md')],
    projectFileCandidates: ['AGENTS.md', 'CLAUDE.md'],
    overrideCandidates: ['AGENTS.override.md'],
    sameDirectoryPrecedence: ['AGENTS.override.md', 'AGENTS.md', 'CLAUDE.md'],
  },
  {
    ...base,
    key: surface('tencent', 'codebuddy', 'cli'),
    displayName: 'CodeBuddy Code',
    platformId: 'codebuddy',
    globalPaths: [join(home, '.codebuddy', 'CODEBUDDY.md')],
    projectFileCandidates: ['CODEBUDDY.md', '.codebuddy/CODEBUDDY.md'],
    localOverlayCandidates: ['CODEBUDDY.local.md'],
    projectFallbacks: ['AGENTS.md'],
    rulesDirCandidates: ['.codebuddy/rules'],
    sameDirectoryPrecedence: ['CODEBUDDY.md', 'CODEBUDDY.local.md', 'AGENTS.md'],
  },
  {
    ...base,
    key: surface('google', 'google-antigravity', 'ide'),
    displayName: 'Google Antigravity',
    platformId: 'google-antigravity',
    /**
     * 全局根为 `~/.gemini/config/`，根内可放独立的 `GEMINI.md` / `AGENTS.md`。
     * 注意不是 `~/.gemini/GEMINI.md`：该文件是 v1 遗留，2.x 迁移时未触碰。
     * 依据：应用自带文档 `builtin/skills/agy-customizations/SKILL.md`（2.12.2）。
     */
    globalPaths: [
      join(home, '.gemini', 'config', 'GEMINI.md'),
      join(home, '.gemini', 'config', 'AGENTS.md'),
    ],
    projectFileCandidates: ['GEMINI.md', 'AGENTS.md'],
    /**
     * 工作区规则是两种机制并存：逐级 `GEMINI.md` / `AGENTS.md` 文件，加上规则目录。
     * customization 根支持 `.agents/`、`.agent/`、`_agents/`、`_agent/` 四种写法，
     * 只登记 `.agents/` 会漏掉另外三种。
     */
    rulesDirCandidates: ['.agents/rules', '.agent/rules', '_agents/rules', '_agent/rules'],
    sameDirectoryPrecedence: ['GEMINI.md', 'AGENTS.md'],
  },
  {
    ...base,
    key: surface('google', 'gemini-cli', 'cli'),
    displayName: 'Gemini CLI',
    platformId: 'gemini-cli',
    globalPaths: [join(home, '.gemini', 'GEMINI.md')],
    projectFileCandidates: ['GEMINI.md', 'AGENTS.md'],
    sameDirectoryPrecedence: ['GEMINI.md', 'AGENTS.md'],
  },
  {
    ...base,
    key: surface('tencent', 'workbuddy', 'desktop'),
    displayName: 'WorkBuddy',
    platformId: 'workbuddy',
    globalPaths: [],
    projectFileCandidates: [],
    supportsNested: false,
    traversal: 'tool-defined',
    sameDirectoryPrecedence: [],
    bridgeStrategies: [],
  },
  {
    ...base,
    key: surface('zcode', 'zcode', 'ide'),
    displayName: 'ZCode',
    platformId: 'zcode',
    globalPaths: [join(home, '.zcode', 'AGENTS.md')],
    projectFileCandidates: ['AGENTS.md'],
    supportsNested: 'unknown',
    traversal: 'tool-defined',
    evidence: 'community',
    bridgeStrategies: [],
  },
  {
    ...base,
    key: surface('xai', 'grok-build', 'cli'),
    displayName: 'Grok Build',
    globalPaths: [join(home, '.grok', 'AGENTS.md')],
    projectFileCandidates: ['AGENTS.md', 'Agents.md'],
    projectFallbacks: ['CLAUDE.md', 'Claude.md'],
    rulesDirCandidates: ['.grok/rules', '.claude/rules', '.cursor/rules'],
    sameDirectoryPrecedence: ['AGENTS.md', 'Agents.md', 'CLAUDE.md', 'Claude.md'],
    traversal: 'merge-root-to-leaf',
  },
]

export function listInstructionProfiles(): InstructionRuleProfile[] {
  return INSTRUCTION_PROFILES.map((profile) => ({ ...profile, bridgeStrategies: [...profile.bridgeStrategies] }))
}

export function findInstructionProfile(ref: SurfaceRef): InstructionRuleProfile | undefined {
  return INSTRUCTION_PROFILES.find((profile) => profile.key.vendorId === ref.vendorId && profile.key.productId === ref.productId && profile.key.surfaceId === ref.surfaceId)
}
