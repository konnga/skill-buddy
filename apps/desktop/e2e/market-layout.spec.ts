/// <reference lib="dom" />
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { electronTestEnv } from './env.js'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(desktopRoot, 'out', 'main', 'index.js')

/** 桌面宿主窗口比默认视口高，标题栏与侧边栏都在其中，这里用真实窗口尺寸测量。 */
async function openMarketPage(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.setItem('skm.language', JSON.stringify('zh-CN')))
  await page.reload()
  await page.getByRole('button', { name: /MCP Servers/ }).click()
  await page.getByRole('button', { name: '从市场导入' }).first().click()
  await page.getByPlaceholder('搜索 MCP Server').waitFor()
}

/**
 * 向广场列表注入超高内容，模拟「卡片多到超出视口」。
 *
 * 只注入 DOM 而不依赖网络：这样断言的是布局约束本身，而不是市场接口是否可用。
 */
async function injectTallContent(page: Page): Promise<void> {
  await page.evaluate(() => {
    // 第一个滚动视口属于左侧边栏，第二个才是广场列表。
    const viewports = Array.from(document.querySelectorAll('[data-reka-scroll-area-viewport]'))
    const viewport = viewports[1]
    if (!viewport) throw new Error('market grid viewport not found')
    const filler = document.createElement('div')
    filler.id = 'market-layout-filler'
    filler.style.height = '3000px'
    viewport.append(filler)
  })
  await page.waitForTimeout(200)
}

test('MCP 广场内容超出视口时只在列表内部滚动，不顶高整个窗口', async () => {
  const home = await mkdtemp(join(tmpdir(), 'skillbuddy-market-layout-'))
  let application: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    application = await electron.launch({
      args: [`--user-data-dir=${join(home, 'user-data')}`, entry],
      env: electronTestEnv({ HOME: home }),
    })
    const page = await application.firstWindow()

    await openMarketPage(page)
    const before = await page.evaluate(() => ({
      docClientHeight: document.documentElement.clientHeight,
      docScrollHeight: document.documentElement.scrollHeight,
    }))

    await injectTallContent(page)

    const after = await page.evaluate(() => {
      const doc = document.documentElement
      const viewport = Array.from(document.querySelectorAll('[data-reka-scroll-area-viewport]'))[1]
      return {
        docClientHeight: doc.clientHeight,
        docScrollHeight: doc.scrollHeight,
        viewportClientHeight: viewport?.clientHeight ?? 0,
        viewportScrollHeight: viewport?.scrollHeight ?? 0,
      }
    })

    // 窗口本身不能出现滚动条：否则会连左侧边栏一起滚走。
    expect(after.docScrollHeight).toBeLessThanOrEqual(after.docClientHeight + 1)
    expect(after.docScrollHeight).toBe(before.docScrollHeight)
    // 溢出内容必须由列表自身的滚动区承接。
    expect(after.viewportScrollHeight).toBeGreaterThan(after.viewportClientHeight + 1)
    // 滚动列表时窗口不能跟着动。
    const scrolled = await page.evaluate(() => {
      const viewport = Array.from(document.querySelectorAll('[data-reka-scroll-area-viewport]'))[1]
      viewport!.scrollTop = 500
      return { listScrollTop: viewport!.scrollTop, windowScrollY: window.scrollY }
    })
    expect(scrolled.listScrollTop).toBeGreaterThan(0)
    expect(scrolled.windowScrollY).toBe(0)
  } finally {
    await application?.close()
    await rm(home, { recursive: true, force: true })
  }
})
