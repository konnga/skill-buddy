import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_PLATFORMS } from '../platforms.js'
import { HermesAdapter } from './hermes-adapter.js'

describe('HermesAdapter', () => {
  let home: string
  let adapter: HermesAdapter

  beforeEach(async () => {
    home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-hermes-'))
    const definition = BUILTIN_PLATFORMS.find((platform) => platform.id === 'hermes')!
    adapter = new HermesAdapter(definition, home)
  })

  afterEach(async () => {
    await fs.rm(home, { recursive: true, force: true })
  })

  async function writeSkill(relativeDirectory: string, name: string): Promise<string> {
    const directory = join(home, '.hermes', 'skills', relativeDirectory)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(
      join(directory, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${name} description\n---\n\n# ${name}\n`,
      'utf8',
    )
    return directory
  }

  it('recursively lists Skills below Hermes category directories', async () => {
    await writeSkill('algorithmic-art', 'algorithmic-art')
    const nestedPath = await writeSkill('software-development/systematic-debugging', 'systematic-debugging')

    const skills = await adapter.list('user')

    expect(skills.map((installation) => installation.skill.name).sort()).toEqual([
      'algorithmic-art',
      'systematic-debugging',
    ])
    expect(skills.find((installation) => installation.skill.name === 'systematic-debugging')?.path)
      .toBe(nestedPath)
  })

  it('toggles and uninstalls a Skill at its nested Hermes path', async () => {
    const nestedPath = await writeSkill('software-development/systematic-debugging', 'systematic-debugging')

    await adapter.setEnabled('systematic-debugging', false, 'user')
    expect(await fs.stat(join(nestedPath, 'SKILL.md.disabled'))).toBeDefined()

    await adapter.setEnabled('systematic-debugging', true, 'user')
    expect(await fs.stat(join(nestedPath, 'SKILL.md'))).toBeDefined()

    await adapter.uninstall('systematic-debugging', 'user')
    await expect(fs.stat(nestedPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
