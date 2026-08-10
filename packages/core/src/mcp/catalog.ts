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

export type McpNativeSchema = 'standard' | 'codex' | 'opencode'

export interface McpSourceTemplate {
  scope: McpScope
  path: string
  projectRoot?: string
  format: McpConfigFormat
  nodePath: string[]
  origin: McpSourceOrigin
  readOnly?: boolean
  /** 同组模板按声明顺序选择第一个已存在来源；均不存在时选择第一项作为写入目标。 */
  fallbackGroup?: string
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
    displayName: 'Z Code',
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
    displayName: 'Z Code (.agents)',
    schema: 'standard',
    capabilities: standardCapabilities({ management: 'read-only', scopes: ['project'] }),
    detectPaths: (homeDir) => [join(homeDir, '.zcode')],
    sourceTemplates: (_homeDir, projectRoots) =>
      projectTemplates(projectRoots, '.agents/mcp.json', 'json', ['mcpServers']).map(
        (source) => ({ ...source, readOnly: true }),
      ),
  },
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
