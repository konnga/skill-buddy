import { describe, expect, it } from 'vitest'
import { BUILTIN_PLATFORMS } from './platforms.js'

describe('BUILTIN_PLATFORMS', () => {
  it('registers Qwen Code with personal and project Skills roots', () => {
    expect(BUILTIN_PLATFORMS).toContainEqual({
      id: 'qwen-code',
      displayName: 'Qwen Code',
      userSkillsDir: '~/.qwen/skills',
      projectSkillsDir: '.qwen/skills',
      detectPath: '~/.qwen',
    })
  })

  it.each([
    ['pi', 'Pi', '~/.pi/agent/skills', '.pi/skills', '~/.pi/agent'],
    ['omp', 'OMP Agent', '~/.omp/agent/skills', '.omp/skills', '~/.omp/agent'],
  ] as const)(
    'registers %s with asymmetric personal and project Skills roots',
    (id, displayName, userSkillsDir, projectSkillsDir, detectPath) => {
      expect(BUILTIN_PLATFORMS).toContainEqual({
        id,
        displayName,
        userSkillsDir,
        projectSkillsDir,
        detectPath,
      })
    },
  )

  it.each([
    ['deepseek-harness', 'DeepSeek Harness', '~/.dsh/skills', '.dsh/skills', '~/.dsh'],
    ['hermes', 'Hermes', '~/.hermes/skills', '.hermes/skills', '~/.hermes'],
  ] as const)(
    'registers %s with user and project Skills roots',
    (id, displayName, userSkillsDir, projectSkillsDir, detectPath) => {
      expect(BUILTIN_PLATFORMS).toContainEqual({
        id,
        displayName,
        userSkillsDir,
        projectSkillsDir,
        detectPath,
      })
    },
  )
})
