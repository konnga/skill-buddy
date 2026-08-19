import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'

const execFileAsync = promisify(execFile)
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function availablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('unable to allocate Git test port')
  await new Promise<void>((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  )
  return address.port
}

test('从设置页备份并恢复 Git 快照', async () => {
  const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-git-backup-e2e-'))
  const remote = join(home, 'remote.git')
  const skillDirectory = join(home, '.agents', 'skills', 'backup-e2e')
  const codexHome = join(home, '.codex')
  await execFileAsync('git', ['init', '--bare', remote])
  const gitPort = await availablePort()
  let gitDaemon: ChildProcess | undefined
  await fs.mkdir(skillDirectory, { recursive: true })
  await fs.mkdir(codexHome, { recursive: true })
  await fs.writeFile(
    join(skillDirectory, 'SKILL.md'),
    '---\nname: backup-e2e\ndescription: original\n---\n\n# Original\n',
    'utf8',
  )

  let application: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    gitDaemon = spawn(
      'git',
      [
        'daemon',
        '--reuseaddr',
        '--export-all',
        '--enable=receive-pack',
        '--listen=127.0.0.1',
        `--port=${gitPort}`,
        `--base-path=${home}`,
        home,
      ],
      { stdio: 'ignore' },
    )
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    application = await electron.launch({
      args: [
        `--user-data-dir=${join(home, 'user-data')}`,
        join(desktopRoot, 'out', 'main', 'index.js'),
      ],
      env: { ...process.env, HOME: home, CODEX_HOME: codexHome },
    })
    const page = await application.firstWindow()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (entry) => {
      if (entry.type() === 'error') pageErrors.push(entry.text())
    })
    await page.evaluate(() => {
      localStorage.setItem('skm.language', JSON.stringify('zh-CN'))
      localStorage.setItem(
        'skm.groups',
        JSON.stringify([{ name: 'Backup Preset', skills: ['backup-e2e'] }]),
      )
    })
    await page.reload()
    await application.evaluate(({ BrowserWindow, dialog }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(960, 600)
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
    })

    await page.getByRole('button', { name: '设置' }).click()
    await page.getByRole('button', { name: '数据' }).click()
    await page.waitForTimeout(100)
    expect(pageErrors, pageErrors.join('\n')).toEqual([])
    await expect(page.getByText('Git 多设备备份')).toBeVisible()
    await page
      .getByPlaceholder('git@github.com:you/skills-backup.git')
      .fill(`git://127.0.0.1:${gitPort}/remote.git`)
    await page.getByPlaceholder('main').fill('devices')
    await page.getByRole('button', { name: '立即备份' }).click()
    await expect(page.getByText('已备份 1 个 Skill 和 1 个 Preset')).toBeVisible()

    const checkout = join(home, 'checkout')
    await execFileAsync('git', ['clone', '--branch', 'devices', remote, checkout])
    expect(JSON.parse(await fs.readFile(join(checkout, 'skillbuddy-backup.json'), 'utf8'))).toMatchObject({
      kind: 'skillbuddy-backup',
      version: 1,
      presets: [{ name: 'Backup Preset', skills: ['backup-e2e'] }],
    })

    await fs.writeFile(
      join(skillDirectory, 'SKILL.md'),
      '---\nname: backup-e2e\ndescription: changed\n---\n\n# Changed\n',
      'utf8',
    )
    await page.getByRole('button', { name: '预览恢复' }).click()
    await expect(page.getByText(/1 个 Skill · 1 个 Preset/)).toBeVisible()
    await page.getByRole('button', { name: 'Codex' }).click()
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: '恢复快照' }).click()
    await expect(page.getByText('已完成 1 处 Skill 安装')).toBeVisible()
    await expect.poll(() => fs.readFile(join(skillDirectory, 'SKILL.md'), 'utf8')).toContain(
      '# Original',
    )
  } finally {
    await application?.close()
    gitDaemon?.kill()
    await fs.rm(home, { recursive: true, force: true })
  }
})
