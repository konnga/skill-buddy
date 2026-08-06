#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { Command } from 'commander'
import {
  aggregateSkills,
  findSkills,
  getAdapter,
  listPlatformStatus,
  readSkillDir,
  RegistryClient,
  scanInstalledSkills,
  toSkill,
  type InstallScope,
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
    const aggregated = aggregateSkills(items)
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
