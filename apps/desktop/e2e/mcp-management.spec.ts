import { execFile, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const execFileAsync = promisify(execFile)

/** 为团队库 E2E 提供 Git smart HTTP，覆盖应用拒绝 git:// 地址后的真实连接路径。 */
async function startGitHttpServer(root: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    const child = spawn('git', ['http-backend'], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: root,
        GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: decodeURIComponent(requestUrl.pathname),
        QUERY_STRING: requestUrl.search.slice(1),
        REQUEST_METHOD: request.method ?? 'GET',
        CONTENT_TYPE: typeof request.headers['content-type'] === 'string' ? request.headers['content-type'] : '',
        CONTENT_LENGTH: typeof request.headers['content-length'] === 'string' ? request.headers['content-length'] : '',
        REMOTE_ADDR: '127.0.0.1',
      },
    })
    const output: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk))
    child.stderr.resume()
    request.pipe(child.stdin)
    child.on('close', (code) => {
      if (code !== 0) {
        response.statusCode = 502
        response.end('git http-backend failed')
        return
      }
      const payload = Buffer.concat(output)
      const separator = payload.indexOf('\r\n\r\n')
      if (separator < 0) {
        response.statusCode = 502
        response.end('invalid git http-backend response')
        return
      }
      const headers = payload.subarray(0, separator).toString('utf8').split('\r\n')
      for (const header of headers) {
        const separatorIndex = header.indexOf(':')
        if (separatorIndex <= 0) continue
        const name = header.slice(0, separatorIndex)
        const value = header.slice(separatorIndex + 1).trim()
        if (name.toLowerCase() === 'status') {
          response.statusCode = Number.parseInt(value, 10) || 200
        } else {
          response.setHeader(name, value)
        }
      }
      response.end(payload.subarray(separator + 4))
    })
  })
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose())),
    ),
  }
}

test('扫描 MCP、查看详情并预览新安装计划', async () => {
  const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-mcp-e2e-'))
  await fs.mkdir(join(home, '.claude'), { recursive: true })
  await fs.mkdir(join(home, '.codex'), { recursive: true })
  await fs.writeFile(
    join(home, '.claude.json'),
    JSON.stringify(
      {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            env: { ROOT: '${HOME}' },
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  )
  await fs.writeFile(
    join(home, '.codex', 'config.toml'),
    '[mcp_servers.node_repl]\ncommand = "node"\nargs = ["server.js"]\nenabled = true\n',
    'utf8',
  )

  let application: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    application = await electron.launch({
      args: [
        `--user-data-dir=${join(home, 'user-data')}`,
        join(desktopRoot, 'out', 'main', 'index.js'),
      ],
      env: { ...process.env, HOME: home },
    })
    const page = await application.firstWindow()
    await page.evaluate(() => {
      localStorage.setItem('skm.language', JSON.stringify('zh-CN'))
    })
    await page.reload()
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(960, 600)
    })

    await page.getByRole('button', { name: 'MCP Servers', exact: true }).click()
    await expect(page.getByText('filesystem', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('@modelcontextprotocol/server-filesystem')).toBeVisible()

    await page.getByText('node_repl', { exact: true }).first().click()
    await page.getByRole('button', { name: '禁用', exact: true }).click()
    const togglePlan = page.getByRole('dialog', { name: '确认 MCP 变更' })
    await expect(togglePlan.getByText('禁用 node_repl', { exact: true })).toBeVisible()
    await expect(togglePlan.getByText('将禁用', { exact: true })).toBeVisible()
    await expect(togglePlan.getByRole('button', { name: '确认禁用' })).toBeVisible()
    await expect(togglePlan).not.toContainText('toggle')
    await togglePlan.getByRole('button', { name: '取消' }).click()

    await expect
      .poll(() =>
        page.evaluate(() => {
          const browser = globalThis as unknown as {
            document: { documentElement: { scrollWidth: number; clientWidth: number } }
          }
          return (
            browser.document.documentElement.scrollWidth <=
            browser.document.documentElement.clientWidth
          )
        }),
      )
      .toBe(true)

    const screenshotDirectory = process.env.SKILLBUDDY_SCREENSHOT_DIR
    if (screenshotDirectory) {
      await fs.mkdir(screenshotDirectory, { recursive: true })
      await page.screenshot({ path: join(screenshotDirectory, 'mcp-overview.png') })
    }

    await page.getByRole('button', { name: '新建 MCP Server' }).click()
    const form = page.getByRole('dialog', { name: '新建 MCP Server' })
    await form.getByLabel('名称').fill('docs')
    await form.getByLabel('命令').fill('npx')
    await form.getByLabel('参数（每行一项）').fill('-y\n@modelcontextprotocol/server-filesystem')
    await form.locator('button[aria-expanded]').first().click()
    await form.getByRole('checkbox').first().check()
    await form.getByRole('button', { name: '预览变更' }).click()

    const plan = page.getByRole('dialog', { name: '确认 MCP 变更' })
    await expect(plan).toBeVisible()
    await expect(plan.getByText('docs')).toBeVisible()
    if (screenshotDirectory) {
      await page.screenshot({ path: join(screenshotDirectory, 'mcp-plan.png') })
    }
  } finally {
    await application?.close()
    await fs.rm(home, { recursive: true, force: true })
  }
})

test('从团队库选择 MCP 目标并预览安装计划', async () => {
  const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-team-mcp-e2e-'))
  const source = join(home, 'team-library-source')
  const remote = join(home, 'team-library.git')
  await fs.mkdir(join(source, 'mcp'), { recursive: true })
  await fs.mkdir(join(source, 'policies'), { recursive: true })
  await fs.writeFile(
    join(source, 'team-library.yaml'),
    'version: 1\nid: acme-team\nname: Acme Team\npolicies:\n  organization: policies/organization.yaml\n',
    'utf8',
  )
  await fs.writeFile(
    join(source, 'policies', 'organization.yaml'),
    'required:\n  skills: []\n  mcp: []\nrecommended:\n  skills: []\n  mcp: []\nblocked: []\n',
    'utf8',
  )
  await fs.writeFile(
    join(source, 'mcp', 'github.json'),
    JSON.stringify({
      name: 'github',
      description: 'GitHub tools for the team',
      version: '1.0.0',
      definition: {
        name: 'github',
        description: 'GitHub tools for the team',
        transport: {
          kind: 'stdio',
          command: 'github-mcp-server',
          args: [],
          env: { GITHUB_TOKEN: { kind: 'env', name: 'GITHUB_TOKEN' } },
        },
        requiredSecrets: ['GITHUB_TOKEN'],
      },
    }, null, 2),
    'utf8',
  )
  await execFileAsync('git', ['init', '--initial-branch', 'main', source])
  await execFileAsync('git', ['-C', source, 'config', 'user.name', 'SkillBuddy E2E'])
  await execFileAsync('git', ['-C', source, 'config', 'user.email', 'skillbuddy-e2e@localhost'])
  await execFileAsync('git', ['-C', source, 'add', '.'])
  await execFileAsync('git', ['-C', source, 'commit', '-m', 'test: 初始化团队库'])
  await execFileAsync('git', ['clone', '--bare', source, remote])
  const gitHttp = await startGitHttpServer(home)
  await fs.mkdir(join(home, '.claude'), { recursive: true })

  let application: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    application = await electron.launch({
      args: [
        `--user-data-dir=${join(home, 'user-data')}`,
        join(desktopRoot, 'out', 'main', 'index.js'),
      ],
      env: { ...process.env, HOME: home },
    })
    const page = await application.firstWindow()
    await page.evaluate((remoteUrl) => {
      localStorage.setItem('skm.language', JSON.stringify('zh-CN'))
      localStorage.setItem('skm.teamLibraries', JSON.stringify([{ remoteUrl, branch: 'main' }]))
    }, `${gitHttp.url}/team-library.git`)
    await page.reload()
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(960, 600)
    })

    await page.getByRole('button', { name: '团队库', exact: true }).click()
    await page.getByRole('tab', { name: 'MCP' }).click()
    await expect(page.getByText('github', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '安装' }).click()
    await expect(page.getByText('GITHUB_TOKEN', { exact: true })).toBeVisible()
    const mcpItem = page.locator('li').filter({ hasText: 'github' }).first()
    await mcpItem.locator('button[aria-expanded]').first().click()
    await mcpItem.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: '预览安装计划' }).click()
    await expect(page.getByRole('dialog', { name: '确认 MCP 变更' })).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const browser = globalThis as unknown as {
            document: { documentElement: { scrollWidth: number; clientWidth: number } }
          }
          return (
            browser.document.documentElement.scrollWidth <=
            browser.document.documentElement.clientWidth
          )
        }),
      )
      .toBe(true)

    const screenshotDirectory = process.env.SKILLBUDDY_SCREENSHOT_DIR
    if (screenshotDirectory) {
      await fs.mkdir(screenshotDirectory, { recursive: true })
      await page.screenshot({ path: join(screenshotDirectory, 'team-mcp-plan.png') })
    }
  } finally {
    await application?.close()
    await gitHttp.close()
    await fs.rm(home, { recursive: true, force: true })
  }
})
