import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('扫描本机 Skill 并在 Skills 页面展示', async () => {
  const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-e2e-'))
  const skillDirectory = join(home, '.agents', 'skills', 'e2e-skill')
  const codexHome = join(home, '.codex')
  await fs.mkdir(skillDirectory, { recursive: true })
  await fs.mkdir(codexHome, { recursive: true })
  await fs.writeFile(
    join(skillDirectory, 'SKILL.md'),
    `---
name: e2e-skill
description: Electron end-to-end fixture
version: 1.0.0
---

# E2E Skill
`,
    'utf8',
  )

  let application: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    application = await electron.launch({
      args: [
        `--user-data-dir=${join(home, 'user-data')}`,
        join(desktopRoot, 'out', 'main', 'index.js'),
      ],
      env: {
        ...process.env,
        HOME: home,
        CODEX_HOME: codexHome,
      },
    })
    const page = await application.firstWindow()
    await expect(page.getByText('SkillBuddy', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Skills/ }).click()
    await expect(page.getByText('e2e-skill', { exact: true })).toBeVisible()
  } finally {
    await application?.close()
    await fs.rm(home, { recursive: true, force: true })
  }
})
