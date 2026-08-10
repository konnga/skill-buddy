import { promises as fs } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('扫描 MCP、查看详情并预览新安装计划', async () => {
  const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-mcp-e2e-'))
  await fs.mkdir(join(home, '.claude'), { recursive: true })
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
  const registry = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/api/mcp-servers') {
      response.end(
        JSON.stringify([
          {
            org: 'acme',
            name: 'github',
            description: 'GitHub tools for the team',
            version: '1.0.0',
            transport: 'stdio',
            requiredSecrets: ['GITHUB_TOKEN'],
            createdAt: Date.now(),
          },
        ]),
      )
      return
    }
    if (request.url === '/api/mcp-servers/acme/github') {
      response.end(
        JSON.stringify({
          org: 'acme',
          name: 'github',
          description: 'GitHub tools for the team',
          version: '1.0.0',
          transport: 'stdio',
          requiredSecrets: ['GITHUB_TOKEN'],
          createdAt: Date.now(),
          publishedBy: 'team-admin',
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
        }),
      )
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ error: 'not found' }))
  })
  await new Promise<void>((resolveListen) => registry.listen(0, '127.0.0.1', resolveListen))
  const address = registry.address() as AddressInfo
  const home = await fs.mkdtemp(join(tmpdir(), 'skillbuddy-team-mcp-e2e-'))
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
    await page.evaluate((registryUrl) => {
      localStorage.setItem('skm.language', JSON.stringify('zh-CN'))
      localStorage.setItem('skm.registryUrl', JSON.stringify(registryUrl))
      localStorage.setItem('skm.registryToken', JSON.stringify('team-token'))
    }, `http://127.0.0.1:${address.port}`)
    await page.reload()
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(960, 600)
    })

    await page.getByRole('button', { name: '团队库', exact: true }).click()
    await page.getByRole('tab', { name: 'MCP Servers' }).click()
    await expect(page.getByText('acme/github')).toBeVisible()
    await page.getByRole('button', { name: '安装' }).click()
    await expect(page.getByText('GITHUB_TOKEN', { exact: true })).toBeVisible()
    await page.getByRole('checkbox').first().check()
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
    await new Promise<void>((resolveClose, rejectClose) =>
      registry.close((error) => (error ? rejectClose(error) : resolveClose())),
    )
    await fs.rm(home, { recursive: true, force: true })
  }
})
