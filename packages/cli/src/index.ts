#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { Command } from 'commander'
import {
  aggregateSkills,
  allMcpAdapters,
  findSkills,
  getAdapter,
  getMcpAdapter,
  listPlatformStatus,
  readSkillDir,
  rebaseMcpMutation,
  RegistryClient,
  scanInstalledSkills,
  transactionalWriteMcpConfig,
  toSkill,
  validateMcpDefinition,
  type InstallScope,
  type McpServerDefinition,
  type McpTarget,
  type Skill,
} from '@skillbuddy/core'

interface Config {
  registry?: string
  token?: string
}

async function loadConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(join(homedir(), '.config', 'skm', 'config.json'), 'utf8')
    return JSON.parse(raw) as Config
  } catch {
    return {}
  }
}

async function clientFrom(opts: { registry?: string; token?: string }): Promise<RegistryClient> {
  const config = await loadConfig()
  const registry = opts.registry ?? process.env.SKM_REGISTRY ?? config.registry
  const token = opts.token ?? process.env.SKM_TOKEN ?? config.token
  if (!registry) fail('registry url required (--registry, SKM_REGISTRY, or ~/.config/skm/config.json)')
  if (!token) fail('token required (--token, SKM_TOKEN, or ~/.config/skm/config.json)')
  return new RegistryClient(registry!, token!)
}

function fail(message: string): never {
  console.error(`error: ${message}`)
  process.exit(1)
}

function parseAgents(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function installToAgents(
  skill: Skill,
  agents: string[],
  scope: InstallScope,
  projectRoot?: string,
): Promise<void> {
  for (const agent of agents) {
    const path = await getAdapter(agent).install(skill, scope, projectRoot)
    console.log(`installed ${skill.name} -> ${agent} (${path})`)
  }
}

function parseMcpTargets(value: string, projectRoot?: string): McpTarget[] {
  const targets = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [agent, surface] = entry.split(':')
      if (!agent) fail(`invalid MCP target: ${entry}`)
      // 省略 surface 时只在可写入口中选择；多个可写入口时要求显式指定，避免静默绑定错入口。
      const writable = allMcpAdapters().filter(
        (candidate) =>
          candidate.agent === agent && candidate.capabilities.management === 'read-write',
      )
      const adapter = surface
        ? getMcpAdapter(agent, surface)
        : writable.length === 1
          ? writable[0]
          : undefined
      if (!adapter) {
        fail(
          writable.length > 1
            ? `multiple MCP surfaces for ${agent}; use ${writable
                .map((candidate) => `${agent}:${candidate.surface}`)
                .join(' or ')}`
            : `no writable MCP surface for ${entry}`,
        )
      }
      return {
        agent,
        surface: adapter.surface,
        scope: projectRoot ? ('project' as const) : ('user' as const),
        ...(projectRoot ? { projectRoot: resolve(projectRoot) } : {}),
      }
    })
  if (targets.length === 0) fail('at least one MCP target is required')
  return targets
}

async function installMcpToTargets(
  definition: McpServerDefinition,
  targets: McpTarget[],
): Promise<void> {
  const mutations = new Map<string, { path: string; content: string; expectedHash: string | null }>()
  for (const target of targets) {
    const adapter = getMcpAdapter(target.agent, target.surface)
    const mutation = await adapter.prepareUpsert(definition, target)
    if (mutation.projection?.blockers.length) {
      fail(mutation.projection.blockers.map((issue) => issue.message).join('; '))
    }
    const path = mutation.source.configPath
    const existing = mutations.get(path)
    if (existing) {
      mutations.set(path, {
        path,
        content: rebaseMcpMutation(mutation, existing.content),
        expectedHash: existing.expectedHash,
      })
    } else {
      mutations.set(path, {
        path,
        content: mutation.afterText,
        expectedHash: mutation.beforeHash,
      })
    }
  }
  for (const mutation of mutations.values()) {
    await transactionalWriteMcpConfig(mutation)
    console.log(`installed MCP ${definition.name} -> ${mutation.path}`)
  }
}

async function loadMcpDefinition(client: RegistryClient, ref: string): Promise<McpServerDefinition> {
  const match = /^([a-z0-9-]+)\/([a-z0-9-]+)(?:@(.+))?$/.exec(ref)
  if (!match) fail('MCP ref must be org/name or org/name@version')
  const remote = await client.getMcpServer(match[1]!, match[2]!, match[3])
  // registry 返回内容不可直接信任：写入本地 agent 配置前必须过与桌面端相同的校验。
  validateMcpDefinition(remote.definition, { source: 'user-input' })
  return remote.definition
}

const program = new Command()
program
  .name('skm')
  .description('Manage AI agent skills across platforms')
  .version('0.1.0')
  .option('--registry <url>', 'registry base url')
  .option('--token <token>', 'registry token')

program
  .command('platforms')
  .description('List platforms and detection status')
  .action(async () => {
    for (const p of await listPlatformStatus()) {
      console.log(`${p.detected ? '✓' : '✗'} ${p.id} (${p.displayName})`)
    }
  })

program
  .command('scan')
  .description('Scan locally installed skills')
  .option('--project <path...>', 'project roots to include')
  .option('--json', 'machine-readable output')
  .action(async (opts: { project?: string[]; json?: boolean }) => {
    const items = await scanInstalledSkills((opts.project ?? []).map((p) => resolve(p)))
    const aggregated = await aggregateSkills(items)
    if (opts.json) {
      console.log(JSON.stringify(aggregated, null, 2))
      return
    }
    for (const s of aggregated) {
      const agents = [...new Set(s.installations.map((i) => i.agent))].join(', ')
      console.log(`${s.name}${s.hasDrift ? ' [drift]' : ''} — ${agents}`)
    }
  })

program
  .command('install <ref>')
  .description('Install org/name[@version] from the registry into agents')
  .requiredOption('--agents <list>', 'comma-separated agent ids (e.g. claude-code,cursor)')
  .option('--project <path>', 'install into a project instead of user scope')
  .action(async (ref: string, opts: { agents: string; project?: string }) => {
    const match = /^([a-z0-9-]+)\/([a-z0-9-]+)(?:@(.+))?$/.exec(ref)
    if (!match) fail('ref must be org/name or org/name@version')
    const [, org, name, version] = match
    const client = await clientFrom(program.opts())
    const remote = await client.getSkill(org!, name!, version)
    const skill = await toSkill(remote)
    const scope: InstallScope = opts.project ? 'project' : 'user'
    await installToAgents(skill, parseAgents(opts.agents), scope, opts.project && resolve(opts.project))
  })

program
  .command('publish <source>')
  .description('Publish a skill folder (path to dir containing SKILL.md) to the registry')
  .requiredOption('--org <org>', 'organization')
  .option('--skill-version <semver>', 'override the version from SKILL.md frontmatter')
  .action(async (source: string, opts: { org: string; skillVersion?: string }) => {
    const skill = await readSkillDir(resolve(source))
    if (!skill) fail(`no SKILL.md found in ${source}`)
    const version = opts.skillVersion ?? skill!.version
    if (!version) fail('no version: set `version:` in SKILL.md frontmatter or pass --skill-version')
    const client = await clientFrom(program.opts())
    await client.publish(opts.org, skill!, version!)
    console.log(`published ${opts.org}/${skill!.name}@${version}`)
  })

program
  .command('sync')
  .description("Install all of the org's required skills (policy) into agents")
  .requiredOption('--org <org>', 'organization')
  .requiredOption('--agents <list>', 'comma-separated agent ids')
  .option('--project <path>', 'install into a project instead of user scope')
  .action(async (opts: { org: string; agents: string; project?: string }) => {
    const client = await clientFrom(program.opts())
    const required = await client.requiredSkills(opts.org)
    if (required.length === 0) {
      console.log('no required skills configured')
      return
    }
    const scope: InstallScope = opts.project ? 'project' : 'user'
    for (const name of required) {
      const remote = await client.getSkill(opts.org, name)
      const skill = await toSkill(remote)
      await installToAgents(skill, parseAgents(opts.agents), scope, opts.project && resolve(opts.project))
    }
    console.log(`synced ${required.length} required skill(s) for ${opts.org}`)
  })

program
  .command('search [query]')
  .description('Search skills on the registry')
  .action(async (query?: string) => {
    const client = await clientFrom(program.opts())
    for (const s of await client.search(query)) {
      console.log(`${s.org}/${s.name}@${s.version} — ${s.description}`)
    }
  })

const mcp = program.command('mcp').description('Manage MCP servers in the registry and local agents')

mcp
  .command('search [query]')
  .description('Search MCP servers on the registry')
  .action(async (query?: string) => {
    const client = await clientFrom(program.opts())
    for (const server of await client.searchMcpServers(query)) {
      console.log(
        `${server.org}/${server.name}@${server.version} — ${server.transport} — ${server.description}`,
      )
    }
  })

mcp
  .command('publish <source>')
  .description('Publish a redacted canonical MCP definition JSON')
  .requiredOption('--org <org>', 'organization')
  .requiredOption('--server-version <semver>', 'MCP server version')
  .action(async (source: string, opts: { org: string; serverVersion: string }) => {
    const raw = await fs.readFile(resolve(source), 'utf8')
    const definition = JSON.parse(raw) as McpServerDefinition
    const client = await clientFrom(program.opts())
    await client.publishMcpServer(opts.org, definition, opts.serverVersion, definition.description)
    console.log(`published MCP ${opts.org}/${definition.name}@${opts.serverVersion}`)
  })

mcp
  .command('install <ref>')
  .description('Install an MCP server from the registry into local agent config')
  .requiredOption('--targets <list>', 'comma-separated agent:surface targets')
  .option('--project <path>', 'install into a project instead of user scope')
  .action(async (ref: string, opts: { targets: string; project?: string }) => {
    const client = await clientFrom(program.opts())
    const definition = await loadMcpDefinition(client, ref)
    await installMcpToTargets(definition, parseMcpTargets(opts.targets, opts.project))
  })

mcp
  .command('sync')
  .description('Install an organization’s required MCP servers')
  .requiredOption('--org <org>', 'organization')
  .requiredOption('--targets <list>', 'comma-separated agent:surface targets')
  .option('--project <path>', 'install into a project instead of user scope')
  .action(async (opts: { org: string; targets: string; project?: string }) => {
    const client = await clientFrom(program.opts())
    const required = await client.requiredMcpServers(opts.org)
    for (const name of required) {
      const definition = await loadMcpDefinition(client, `${opts.org}/${name}`)
      await installMcpToTargets(definition, parseMcpTargets(opts.targets, opts.project))
    }
    console.log(`synced ${required.length} required MCP server(s) for ${opts.org}`)
  })

const bundle = program.command('bundle').description('Manage mixed Skill and MCP bundles')

bundle
  .command('install <ref>')
  .description('Install all Skills and MCP servers referenced by a bundle')
  .requiredOption('--agents <list>', 'comma-separated Skill agent ids')
  .option('--mcp-targets <list>', 'comma-separated MCP agent:surface targets')
  .option('--project <path>', 'install into a project instead of user scope')
  .action(async (ref: string, opts: { agents: string; mcpTargets?: string; project?: string }) => {
    const match = /^([a-z0-9-]+)\/([a-z0-9-]+)(?:@(.+))?$/.exec(ref)
    if (!match) fail('bundle ref must be org/name or org/name@version')
    const client = await clientFrom(program.opts())
    const bundleRemote = await client.getBundle(match[1]!, match[2]!, match[3])
    const scope: InstallScope = opts.project ? 'project' : 'user'
    for (const skillRef of bundleRemote.skills) {
      const remote = await client.getSkill(match[1]!, skillRef.name, skillRef.version)
      await installToAgents(
        await toSkill(remote),
        parseAgents(opts.agents),
        scope,
        opts.project && resolve(opts.project),
      )
    }
    if (bundleRemote.mcpServers.length > 0 && !opts.mcpTargets) {
      fail('bundle contains MCP servers; --mcp-targets is required')
    }
    for (const mcpRef of bundleRemote.mcpServers) {
      const definition = await loadMcpDefinition(
        client,
        `${match[1]}/${mcpRef.name}${mcpRef.version ? `@${mcpRef.version}` : ''}`,
      )
      await installMcpToTargets(definition, parseMcpTargets(opts.mcpTargets!, opts.project))
    }
  })

program
  .command('discover <dir>')
  .description('Find SKILL.md folders under a directory')
  .action(async (dir: string) => {
    for (const f of await findSkills(resolve(dir))) {
      console.log(`${f.skill.name} — ${f.dir}`)
    }
  })

program.parseAsync().catch((e: unknown) => {
  fail(e instanceof Error ? e.message : String(e))
})
