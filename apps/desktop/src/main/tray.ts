import {
  app,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
  type MenuItemConstructorOptions,
  type NativeImage,
} from 'electron'
import { join } from 'node:path'
import type { TrayCommand, TrayStatus } from '#shared/ipc'

type TrayLocale = TrayStatus['locale']
type TrayIconState = 'normal' | 'attention' | 'error'

interface TrayMessages {
  title: string
  normal: string
  scanning: string
  attention: (count: number) => string
  error: string
  lastChecked: (time: string) => string
  neverChecked: string
  open: string
  refresh: string
  autoRefresh: string
  settings: string
  quit: string
}

const MESSAGES: Record<TrayLocale, TrayMessages> = {
  'zh-CN': {
    title: 'SkillBuddy',
    normal: '状态正常',
    scanning: '正在扫描',
    attention: (count) => `${count} 项需要处理`,
    error: '扫描失败，点击重试',
    lastChecked: (time) => `上次检查：${time}`,
    neverChecked: '尚未完成检查',
    open: '打开主界面',
    refresh: '立即刷新',
    autoRefresh: '自动监控',
    settings: '设置',
    quit: '退出',
  },
  en: {
    title: 'SkillBuddy',
    normal: 'All systems normal',
    scanning: 'Scanning',
    attention: (count) => `${count} item${count === 1 ? '' : 's'} need attention`,
    error: 'Scan failed — click to retry',
    lastChecked: (time) => `Last checked: ${time}`,
    neverChecked: 'Not checked yet',
    open: 'Open main window',
    refresh: 'Refresh now',
    autoRefresh: 'Automatic monitoring',
    settings: 'Settings',
    quit: 'Quit',
  },
}

const DEFAULT_STATUS: TrayStatus = {
  phase: 'idle',
  attentionCount: 0,
  lastCheckedAt: null,
  autoRefresh: true,
  locale: 'zh-CN',
}

export interface TrayControllerOptions {
  showWindow: () => void
  sendCommand: (command: TrayCommand) => void
  quit: () => void
}

function trayResourcePath(name: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tray', name)
    : join(import.meta.dirname, '../../resources/tray', name)
}

function desktopTrayIconPath(): string {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  return app.isPackaged
    ? join(process.resourcesPath, iconName)
    : join(import.meta.dirname, `../../resources/icons/${iconName}`)
}

/** 管理原生菜单栏/系统托盘图标及其动态菜单。 */
export class TrayController {
  readonly #options: TrayControllerOptions
  #tray: Tray | null = null
  #status: TrayStatus = { ...DEFAULT_STATUS }

  constructor(options: TrayControllerOptions) {
    this.#options = options
  }

  setEnabled(enabled: boolean): void {
    if (enabled && !this.#tray) this.#create()
    if (!enabled && this.#tray) {
      this.#tray.destroy()
      this.#tray = null
    }
  }

  updateStatus(status: TrayStatus): void {
    this.#status = {
      phase: status.phase,
      attentionCount: Math.max(0, Math.floor(status.attentionCount)),
      lastCheckedAt: status.lastCheckedAt,
      autoRefresh: status.autoRefresh,
      locale: status.locale === 'en' ? 'en' : 'zh-CN',
      ...(status.errorMessage ? { errorMessage: status.errorMessage } : {}),
    }
    this.#refresh()
  }

  dispose(): void {
    this.#tray?.destroy()
    this.#tray = null
  }

  #create(): void {
    this.#tray = new Tray(this.#loadIcon(this.#iconState()))
    if (process.platform !== 'darwin') this.#tray.on('click', this.#options.showWindow)
    this.#refresh()
  }

  #refresh(): void {
    if (!this.#tray) return
    this.#tray.setImage(this.#loadIcon(this.#iconState()))
    this.#tray.setToolTip(this.#tooltip())
    this.#tray.setContextMenu(Menu.buildFromTemplate(this.#menuTemplate()))
  }

  #iconState(): TrayIconState {
    if (this.#status.phase === 'error') return 'error'
    return this.#status.attentionCount > 0 ? 'attention' : 'normal'
  }

  #loadIcon(state: TrayIconState): NativeImage {
    if (process.platform !== 'darwin') return nativeImage.createFromPath(desktopTrayIconPath())
    const suffix = state === 'normal' ? '' : state === 'attention' ? 'Attention' : 'Error'
    const image = nativeImage.createFromPath(trayResourcePath(`tray${suffix}Template.png`))
    image.setTemplateImage(true)
    return image
  }

  #statusLabel(): string {
    const messages = MESSAGES[this.#status.locale]
    if (this.#status.phase === 'error') return messages.error
    if (this.#status.phase === 'scanning') return messages.scanning
    if (this.#status.attentionCount > 0) return messages.attention(this.#status.attentionCount)
    return messages.normal
  }

  #tooltip(): string {
    return `${MESSAGES[this.#status.locale].title} · ${this.#statusLabel()}`
  }

  #lastCheckedLabel(): string {
    const messages = MESSAGES[this.#status.locale]
    if (this.#status.lastCheckedAt === null) return messages.neverChecked
    const time = new Intl.DateTimeFormat(this.#status.locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(this.#status.lastCheckedAt)
    return messages.lastChecked(time)
  }

  #menuTemplate(): MenuItemConstructorOptions[] {
    const messages = MESSAGES[this.#status.locale]
    const statusCommand: TrayCommand | null =
      this.#status.phase === 'error'
        ? 'refresh'
        : this.#status.attentionCount > 0 && this.#status.phase !== 'scanning'
          ? 'open-attention'
          : null

    return [
      { label: messages.open, click: this.#options.showWindow },
      {
        label: messages.refresh,
        enabled: this.#status.phase !== 'scanning',
        click: () => this.#options.sendCommand('refresh'),
      },
      {
        label: messages.autoRefresh,
        type: 'checkbox',
        checked: this.#status.autoRefresh,
        click: () => this.#options.sendCommand('toggle-auto-refresh'),
      },
      { type: 'separator' },
      {
        label: this.#statusLabel(),
        enabled: statusCommand !== null,
        ...(statusCommand
          ? {
              click: () => {
                if (statusCommand === 'open-attention') this.#options.showWindow()
                this.#options.sendCommand(statusCommand)
              },
            }
          : {}),
      },
      { label: this.#lastCheckedLabel(), enabled: false },
      { type: 'separator' },
      {
        label: messages.settings,
        click: () => {
          this.#options.showWindow()
          this.#options.sendCommand('open-settings')
        },
      },
      { label: messages.quit, click: this.#options.quit },
    ]
  }
}

/** 注册渲染进程向托盘推送状态的 IPC。 */
export function registerTrayIpc(controller: TrayController): void {
  ipcMain.handle('tray:update-status', (_event, status: TrayStatus) => {
    controller.updateStatus(status)
  })
}
