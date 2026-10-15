import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AgentId } from '../types.js'
import { defineMcpCapabilities } from './capabilities.js'
import type {
  McpConfigSource,
  McpPlatformCapabilities,
  McpScope,
  McpSourceOrigin,
} from './types.js'
import type { McpConfigFormat } from './codecs/index.js'

export type McpNativeSchema = 'standard' | 'codex' | 'opencode' | 'antigravity'

export interface McpSourceTemplate {
  scope: McpScope
  /** 配置文件的字面路径；声明 `perSubdirectory` 时改为父目录。 */
  path: string
  projectRoot?: string
  format: McpConfigFormat
  nodePath: string[]
  origin: McpSourceOrigin
  readOnly?: boolean
  /** 同组模板按声明顺序选择第一个已存在来源；均不存在时选择第一项作为写入目标。 */
  fallbackGroup?: string
  /**
   * 子目录展开：把 `path` 当作父目录，对其每个直接子目录追加该相对路径，
   * 命中存在的文件各自成为一个来源。目录不存在或没有子目录时展开为空。
   * 用于配置落在动态命名子目录里的平台，例如 Antigravity 插件的
   * `<customization-root>/plugins/<name>/mcp_config.json`。
   */
  perSubdirectory?: string
}

export interface McpPlatformProfile {
  agent: AgentId
  surface: string
  displayName: string
  schema: McpNativeSchema
  capabilities: McpPlatformCapabilities
  detectPaths(homeDir: string): string[]
  sourceTemplates(homeDir: string, projectRoots: string[]): McpSourceTemplate[]
}

function projectTemplates(
  projectRoots: string[],
  relativePath: string,
  format: McpConfigFormat,
  nodePath: string[],
): McpSourceTemplate[] {
  return projectRoots.map((projectRoot) => ({
    scope: 'project',
    projectRoot: resolve(projectRoot),
    path: join(resolve(projectRoot), relativePath),
    format,
    nodePath,
    origin: 'project',
  }))
}

/**
 * Antigravity 的工作区定制根支持四种同义写法（`language_server` 中以
 * `{.agents,_agents,.agent,_agent}` 展开）。插件的 MCP 配置就写在根下的 `plugins/` 里，
 * 而插件目录名是动态的，所以只能靠子目录展开、不能写成字面路径。
 */
const ANTIGRAVITY_ROOT_VARIANTS = ['.agents', '.agent', '_agents', '_agent'] as const

/**
 * 插件内 MCP 配置的只读来源：`<root>/<variant>/plugins/<name>/mcp_config.json`。
 * 这些文件由插件自身拥有，SkillBuddy 只扫描不写入。
 */
function antigravityPluginTemplates(projectRoots: string[]): McpSourceTemplate[] {
  return projectRoots.flatMap((projectRoot) => {
    const root = resolve(projectRoot)
    return ANTIGRAVITY_ROOT_VARIANTS.map((variant) => ({
      scope: 'project' as const,
      projectRoot: root,
      path: join(root, variant, 'plugins'),
      perSubdirectory: 'mcp_config.json',
      format: 'json' as const,
      nodePath: ['mcpServers'],
      origin: 'project' as const,
      readOnly: true,
    }))
  })
}

const STANDARD_FEATURES = {
  prompts: true,
  resources: true,
}

function editorUserMcpPath(homeDir: string, application: string): string {
  if (process.platform === 'darwin') {
    return join(homeDir, 'Library', 'Application Support', application, 'User', 'mcp.json')
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homeDir, 'AppData', 'Roaming'), application, 'User', 'mcp.json')
  }
  return join(homeDir, '.config', application, 'User', 'mcp.json')
}

function standardCapabilities(
  input: Partial<{
    management: McpPlatformCapabilities['management']
    scopes: McpScope[]
    transports: McpPlatformCapabilities['transports']
    formats: McpConfigFormat[]
    oauth: boolean
    toggle: McpPlatformCapabilities['toggle']
  }> = {},
): McpPlatformCapabilities {
  return defineMcpCapabilities({
    management: input.management,
    scopes: input.scopes ?? ['user', 'project'],
    transports: input.transports ?? ['stdio', 'streamable-http', 'sse'],
    configFormats: input.formats ?? ['json'],
    supportsOAuth: input.oauth ?? true,
    supportsEnvReferences: true,
    supportsHeaderReferences: true,
    toggle: input.toggle ?? 'unsupported',
    protocolFeatures: STANDARD_FEATURES,
  })
}

/**
 * MCP 接入面的声明顺序 = 平台在 `BUILTIN_PLATFORMS` 中的先后顺序，同一平台的多个接入面相邻。
 *
 * 声明顺序**不决定**用户看到的顺序：`scanMcpServers` 与技能侧的 `listPlatformStatus`
 * 都在运行时用 `comparePlatformDisplayName` 按显示名排序。它仍然是「哪个平台有哪些
 * 接入面」的登记顺序，两张表要保持一致，否则新增平台时容易漏掉一侧；`catalog.test.ts`
 * 有断言锁定该不变量。
 */
export const INITIAL_MCP_PROFILES: readonly McpPlatformProfile[] = [
  {
    agent: 'claude-code',
    surface: 'cli',
    displayName: 'Claude Code',
    schema: 'standard',
    capabilities: defineMcpCapabilities({
      scopes: ['user', 'project', 'local'],
      transports: ['stdio', 'streamable-http', 'sse', 'websocket'],
      configFormats: ['json'],
      supportsOAuth: true,
      supportsEnvReferences: true,
      supportsHeaderReferences: true,
      toggle: 'unsupported',
      protocolFeatures: STANDARD_FEATURES,
    }),
    detectPaths: (homeDir) => [join(homeDir, '.claude')],
    sourceTemplates: (homeDir, projectRoots) => [
      {
        scope: 'user',
        path: join(homeDir, '.claude.json'),
        format: 'json',
        nodePath: ['mcpServers'],
        origin: 'user',
      },
      ...projectTemplates(projectRoots, '.mcp.json', 'json', ['mcpServers']),
      ...projectRoots.map((projectRoot) => ({
        scope: 'local' as const,
        projectRoot: resolve(projectRoot),
        path: join(homeDir, '.claude.json'),
        format: 'json' as const,
        nodePath: ['projects', resolve(projectRoot), 'mcpServers'],
        origin: 'local' as const,
      })),
    ],
  },
  {
    agent: 'codex',
    surface: 'cli',
    displayName: 'Codex',
    schema: 'codex',
    capabilities: defineMcpCapabilities({
      scopes: ['user', 'project'],
      transports: ['stdio', 'streamable-http'],
      configFormats: ['toml'],
      supportsOAuth: true,
      supportsEnvReferences: true,
      supportsHeaderReferences: true,
      toggle: 'native',
      protocolFeatures: STANDARD_FEATURES,
    }),
    detectPaths: (homeDir) => [process.env.CODEX_HOME || join(homeDir, '.codex')],
    sourceTemplates: (homeDir, projectRoots) => {
      const codexHome = process.env.CODEX_HOME || join(homeDir, '.codex')
      return [
        {
          scope: 'user',
          path: join(codexHome, 'config.toml'),
          format: 'toml',
          nodePath: ['mcp_servers'],
          origin: 'user',
        },
        ...projectTemplates(projectRoots, '.codex/config.toml', 'toml', ['mcp_servers']),
      ]
    },
  },
  {
    agent: 'cursor',
    surface: 'editor',
    displayName: 'Cursor',
    schema: 'standard',
    capabilities: defineMcpCapabilities({
      scopes: ['user', 'project'],
      transports: ['stdio', 'streamable-http', 'sse'],
      configFormats: ['json'],
      supportsOAuth: true,
      supportsEnvReferences: true,
      supportsHeaderReferences: true,
      toggle: 'unsupported',
      protocolFeatures: {
        tools: true,
        prompts: true,
        resources: true,
        roots: true,
        elicitation: true,
        apps: true,
      },
    }),
    detectPaths: (homeDir) => [join(homeDir, '.cursor')],
    sourceTemplates: (homeDir, projectRoots) => [
      {
        scope: 'user',
        path: join(homeDir, '.cursor', 'mcp.json'),
        format: 'json',
        nodePath: ['mcpServers'],
        origin: 'user',
      },
      ...projectTemplates(projectRoots, '.cursor/mcp.json', 'json', ['mcpServers']),
    ],
  },
  {
    agent: 'opencode',
    surface: 'cli',
    displayName: 'OpenCode',
    schema: 'opencode',
    capabilities: defineMcpCapabilities({
      scopes: ['user', 'project'],
      transports: ['stdio', 'streamable-http'],
      configFormats: ['jsonc'],
      supportsOAuth: true,
      supportsEnvReferences: true,
      supportsHeaderReferences: true,
      toggle: 'native',
      protocolFeatures: STANDARD_FEATURES,
    }),
    detectPaths: (homeDir) => [join(homeDir, '.config', 'opencode')],
    sourceTemplates: (homeDir, projectRoots) => [
      {
        scope: 'user',
        path: join(homeDir, '.config', 'opencode', 'opencode.json'),
        format: 'jsonc',
        nodePath: ['mcp'],
        origin: 'user',
      },
      ...projectTemplates(projectRoots, 'opencode.json', 'jsonc', ['mcp']),
    ],
  },
  {
    agent: 'copilot',
    surface: 'cli',
    displayName: 'GitHub Copilot CLI',
    schema: 'standard',
    capabilities: standardCapabilities({
      transports: ['stdio', 'streamable-http'],
    }),
    detectPaths: (homeDir) => [process.env.COPILOT_HOME || join(homeDir, '.copilot')],
    sourceTemplates: (homeDir) => {
      const copilotHome = process.env.COPILOT_HOME || join(homeDir, '.copilot')
      return [
        {
          scope: 'user',
          path: join(copilotHome, 'mcp-config.json'),
          format: 'json',
          nodePath: ['mcpServers'],
          origin: 'user',
        },
      ]
    },
  },
  {
    agent: 'copilot',
    surface: 'vscode',
    displayName: 'GitHub Copilot (VS Code)',
    schema: 'standard',
    capabilities: standardCapabilities({ toggle: 'unsupported' }),
    detectPaths: (homeDir) => [editorUserMcpPath(homeDir, 'Code')],
    sourceTemplates: (homeDir, projectRoots) => [
      {
        scope: 'user',
        path: editorUserMcpPath(homeDir, 'Code'),
        format: 'json',
        nodePath: ['servers'],
        origin: 'user',
      },
      ...projectTemplates(projectRoots, '.vscode/mcp.json', 'json', ['servers']),
    ],
  },
  {
    agent: 'copilot',
    surface: 'cloud',
    displayName: 'GitHub Copilot Cloud',
    schema: 'standard',
    capabilities: standardCapabilities({
      management: 'read-only',
      scopes: ['project'],
      transports: ['streamable-http'],
    }),
    detectPaths: () => [],
    sourceTemplates: () => [],
  },
  {
    agent: 'gemini-cli',
    surface: 'cli',
    displayName: 'Gemini CLI',
    schema: 'standard',
    capabilities: standardCapabilities({
      transports: ['stdio', 'streamable-http', 'sse'],
    }),
    detectPaths: (homeDir) => [join(homeDir, '.gemini')],
    sourceTemplates: (homeDir, projectRoots) => [
      {
        scope: 'user',
        path: join(homeDir, '.gemini', 'settings.json'),
        format: 'json',
        nodePath: ['mcpServers'],
        origin: 'user',
      },
      ...projectTemplates(projectRoots, '.gemini/settings.json', 'json', ['mcpServers']),
    ],
  },
  {
    agent: 'google-antigravity',
    surface: 'ide',
    displayName: 'Google Antigravity',
    schema: 'antigravity',
    capabilities: standardCapabilities({
      /**
       * 应用自带文档 `builtin/skills/agy-customizations/docs/mcp_servers.md`（2.12.2）只声明
       * Stdio 与 SSE 两种传输；远端统一用 `serverUrl` 表达，文件中没有区分传输的字段，
       * 因此这里不再声明 streamable-http，读取时也一律按 `sse` 还原。
       */
      transports: ['stdio', 'sse'],
      /**
       * MCP 只有两处落点：全局 `~/.gemini/config/mcp_config.json`，以及插件内
       * `plugins/<name>/mcp_config.json`。
       * 依据：`language_server` 二进制中 `mcp_config.json` 的路径形态只有上述两种，
       * 对照 `hooks.json` 确实存在 `.agents/hooks.json` —— 工作区根目录下并无 `mcp_config.json`。
       *
       * 这里只声明 `user`：`McpTargetPicker.vue` 直接按 scopes 生成写入目标，而插件来源是
       * 只读的，把 `project` 加进来会给出一个「能选但写必然失败」的目标。插件内 MCP 仍会被
       * 只读扫描出来，只是不作为写入目标。
       */
      scopes: ['user'],
    }),
    detectPaths: (homeDir) => [join(homeDir, '.gemini', 'config')],
    sourceTemplates: (homeDir, projectRoots) => [
      {
        scope: 'user',
        path: join(homeDir, '.gemini', 'config', 'mcp_config.json'),
        format: 'json',
        nodePath: ['mcpServers'],
        origin: 'user',
      },
      {
        scope: 'user',
        path: join(homeDir, '.gemini', 'config', 'plugins'),
        perSubdirectory: 'mcp_config.json',
        format: 'json',
        nodePath: ['mcpServers'],
        origin: 'user',
        readOnly: true,
      },
      ...antigravityPluginTemplates(projectRoots),
    ],
  },
  {
    agent: 'codebuddy',
    surface: 'cli',
    displayName: 'CodeBuddy',
    schema: 'standard',
    capabilities: standardCapabilities({
      scopes: ['user', 'project', 'local'],
      formats: ['jsonc'],
    }),
    detectPaths: (homeDir) => [join(homeDir, '.codebuddy')],
    sourceTemplates: (homeDir, projectRoots) => [
      {
        scope: 'user',
        path: join(homeDir, '.codebuddy', '.mcp.json'),
        format: 'jsonc',
        nodePath: ['mcpServers'],
        origin: 'user',
        fallbackGroup: 'codebuddy:user',
      },
      {
        scope: 'user',
        path: join(homeDir, '.codebuddy', 'mcp.json'),
        format: 'jsonc',
        nodePath: ['mcpServers'],
        origin: 'user',
        fallbackGroup: 'codebuddy:user',
      },
      {
        scope: 'user',
        path: join(homeDir, '.codebuddy.json'),
        format: 'jsonc',
        nodePath: ['mcpServers'],
        origin: 'user',
        fallbackGroup: 'codebuddy:user',
      },
      ...projectRoots.flatMap((projectRoot) => {
        const root = resolve(projectRoot)
        return [
          {
            scope: 'project' as const,
            projectRoot: root,
            path: join(root, '.mcp.json'),
            format: 'jsonc' as const,
            nodePath: ['mcpServers'],
            origin: 'project' as const,
            fallbackGroup: `codebuddy:project:${root}`,
          },
          {
            scope: 'project' as const,
            projectRoot: root,
            path: join(root, 'mcp.json'),
            format: 'jsonc' as const,
            nodePath: ['mcpServers'],
            origin: 'project' as const,
            fallbackGroup: `codebuddy:project:${root}`,
          },
          {
            scope: 'local' as const,
            projectRoot: root,
            path: join(homeDir, '.codebuddy.json'),
            format: 'jsonc' as const,
            nodePath: ['projects', root, 'mcpServers'],
            origin: 'local' as const,
          },
        ]
      }),
    ],
  },
  ...(['trae', 'trae-cn'] as const).map(
    (agent): McpPlatformProfile => ({
      agent,
      surface: 'editor',
      displayName: agent === 'trae' ? 'Trae' : 'Trae CN',
      schema: 'standard',
      capabilities: standardCapabilities(),
      detectPaths: (homeDir) => [join(homeDir, agent === 'trae' ? '.trae' : '.trae-cn')],
      sourceTemplates: (homeDir, projectRoots) => [
        {
          scope: 'user',
          path: editorUserMcpPath(homeDir, agent === 'trae' ? 'Trae' : 'Trae CN'),
          format: 'json',
          nodePath: ['mcpServers'],
          origin: 'user',
        },
        ...projectTemplates(projectRoots, '.trae/mcp.json', 'json', ['mcpServers']),
      ],
    }),
  ),
  {
    agent: 'workbuddy',
    surface: 'desktop',
    displayName: 'WorkBuddy',
    schema: 'standard',
    capabilities: standardCapabilities({ scopes: ['user'] }),
    detectPaths: (homeDir) => [join(homeDir, '.workbuddy')],
    sourceTemplates: (homeDir) => [
      {
        scope: 'user',
        path: join(homeDir, '.workbuddy', '.mcp.json'),
        format: 'json',
        nodePath: ['mcpServers'],
        origin: 'user',
      },
    ],
  },
  {
    agent: 'workbuddy',
    surface: 'connector',
    displayName: 'WorkBuddy Connector',
    schema: 'standard',
    capabilities: standardCapabilities({ management: 'read-only', scopes: ['user'] }),
    detectPaths: (homeDir) => [join(homeDir, '.workbuddy')],
    sourceTemplates: () => [],
  },
  {
    agent: 'kimi',
    surface: 'cli',
    displayName: 'Kimi Code',
    schema: 'standard',
    capabilities: standardCapabilities({ scopes: ['user'] }),
    detectPaths: (homeDir) => [join(homeDir, '.kimi')],
    sourceTemplates: (homeDir) => [
      {
        scope: 'user',
        path: join(homeDir, '.kimi', 'mcp.json'),
        format: 'json',
        nodePath: ['mcpServers'],
        origin: 'user',
      },
    ],
  },
  {
    agent: 'zcode',
    surface: 'native',
    displayName: 'ZCode',
    schema: 'standard',
    capabilities: standardCapabilities({ management: 'read-only' }),
    detectPaths: (homeDir) => [join(homeDir, '.zcode')],
    sourceTemplates: (homeDir, projectRoots) => [
      {
        scope: 'user',
        path: join(homeDir, '.zcode', 'settings.json'),
        format: 'json',
        nodePath: ['mcp', 'servers'],
        origin: 'user',
        readOnly: true,
      },
      ...projectTemplates(projectRoots, '.zcode/settings.json', 'json', ['mcp', 'servers']).map(
        (source) => ({ ...source, readOnly: true }),
      ),
    ],
  },
  {
    agent: 'zcode',
    surface: 'agents-compat',
    displayName: 'ZCode (.agents)',
    schema: 'standard',
    capabilities: standardCapabilities({ management: 'read-only', scopes: ['project'] }),
    detectPaths: (homeDir) => [join(homeDir, '.zcode')],
    sourceTemplates: (_homeDir, projectRoots) =>
      projectTemplates(projectRoots, '.agents/mcp.json', 'json', ['mcpServers']).map(
        (source) => ({ ...source, readOnly: true }),
      ),
  },
]

export function defaultMcpProfiles(): readonly McpPlatformProfile[] {
  return INITIAL_MCP_PROFILES
}

export function defaultMcpHome(): string {
  return homedir()
}

export function sourceIdentity(source: Omit<McpConfigSource, 'id'>): string {
  return [
    source.agent,
    source.surface,
    source.scope,
    source.projectRoot ?? '',
    source.configPath,
    source.nodePath.join('.'),
  ].join(':')
}
