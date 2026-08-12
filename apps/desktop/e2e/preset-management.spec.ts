import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function createSkill(root: string, name: string): Promise<void> {
  const directory = join(root, name)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(
    join(directory, 'SKILL.md'),
    `---
name: ${name}
description: ${name} fixture
---

# ${name}
`,
    'utf8',
  )
}

test('管理 Preset 状态、整组启停和可移植 JSON', async () => {
  const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-preset-e2e-'))
  const skillsRoot = join(home, '.agents', 'skills')
  const codexHome = join(home, '.codex')
  await fs.mkdir(codexHome, { recursive: true })
  await createSkill(skillsRoot, 'alpha')
  await createSkill(skillsRoot, 'beta')

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
    await page.evaluate(() => {
      localStorage.setItem('skm.language', JSON.stringify('zh-CN'))
      localStorage.setItem(
        'skm.groups',
        JSON.stringify([{ name: 'E2E Preset', skills: ['alpha', 'beta'] }]),
      )
    })
    await page.reload()
    await application.evaluate(({ BrowserWindow, dialog }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(960, 600)
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
    })

    await page.getByRole('button', { name: /^技能合集/ }).click()
    await expect(page.getByText('已启用', { exact: true })).toBeVisible()
    await expect(page.getByText(/已安装 2\/2 个 Skill/)).toBeVisible()

    await page.getByRole('button', { name: '全部禁用' }).click()
    await expect(page.getByText('已禁用', { exact: true })).toBeVisible()
    await expect.poll(() => fs.stat(join(skillsRoot, 'alpha', 'SKILL.md.disabled')).then(
      () => true,
      () => false,
    )).toBe(true)
    await expect.poll(() => fs.stat(join(skillsRoot, 'beta', 'SKILL.md.disabled')).then(
      () => true,
      () => false,
    )).toBe(true)

    await page.getByRole('button', { name: '合集操作' }).click()
    await page.getByRole('menuitem', { name: '复制 Preset JSON' }).click()
    await expect(page.getByText('已复制合集「E2E Preset」的 Preset JSON')).toBeVisible()
    const exported = await application.evaluate(({ clipboard }) => clipboard.readText())
    expect(JSON.parse(exported)).toEqual({
      kind: 'skillbuddy-preset',
      version: 1,
      preset: { name: 'E2E Preset', skills: ['alpha', 'beta'] },
    })

    const imported = JSON.stringify({
      kind: 'skillbuddy-preset',
      version: 1,
      preset: { name: 'E2E Preset', skills: ['beta', 'gamma'] },
    })
    for (const expectedToast of [
      '已向合集「E2E Preset」追加 1 个 Skill',
      '合集「E2E Preset」没有新增 Skill',
    ]) {
      await page.getByRole('button', { name: '导入合集' }).first().click()
      const dialog = page.getByRole('dialog', { name: '导入技能合集' })
      await dialog.getByPlaceholder('粘贴 skillbuddy-preset JSON…').fill(imported)
      await dialog.getByRole('button', { name: '导入合集' }).click()
      await expect(page.getByText(expectedToast)).toBeVisible()
    }

    await expect(page.getByText('3 个 Skill', { exact: true })).toBeVisible()
    await expect(page.getByText('部分启用', { exact: true })).toBeVisible()
    await expect(page.getByText('未安装：gamma')).toBeVisible()

    await page.getByText('E2E Preset', { exact: true }).click()
    const toolbar = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'E2E Preset' }),
    })
    await expect(toolbar).toBeVisible()
    await expect(toolbar.getByText('部分启用', { exact: true })).toBeVisible()
    await expect(toolbar.getByText('当前筛选下缺失：gamma')).toBeVisible()
  } finally {
    await application?.close()
    await fs.rm(home, { recursive: true, force: true })
  }
})
