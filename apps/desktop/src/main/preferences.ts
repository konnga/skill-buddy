import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  DEFAULT_DESKTOP_PREFERENCES,
  type DesktopPreferences,
} from '../shared/ipc.js'

let preferences: DesktopPreferences = { ...DEFAULT_DESKTOP_PREFERENCES }
let saveQueue = Promise.resolve()
let pendingSaves = 0
const listeners = new Set<(value: DesktopPreferences) => void>()

function preferencesPath(): string {
  return join(app.getPath('userData'), 'desktop-preferences.json')
}

function normalize(value: Partial<DesktopPreferences> | null | undefined): DesktopPreferences {
  return {
    backgroundMode:
      typeof value?.backgroundMode === 'boolean'
        ? value.backgroundMode
        : DEFAULT_DESKTOP_PREFERENCES.backgroundMode,
    launchHidden:
      typeof value?.launchHidden === 'boolean'
        ? value.launchHidden
        : DEFAULT_DESKTOP_PREFERENCES.launchHidden,
  }
}

async function persist(value: DesktopPreferences): Promise<void> {
  const path = preferencesPath()
  const temporaryPath = `${path}.${process.pid}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, path)
}

/** 在应用就绪后加载影响启动和窗口生命周期的桌面偏好。 */
export async function loadDesktopPreferences(): Promise<DesktopPreferences> {
  try {
    const raw = await readFile(preferencesPath(), 'utf8')
    preferences = normalize(JSON.parse(raw) as Partial<DesktopPreferences>)
  } catch {
    preferences = { ...DEFAULT_DESKTOP_PREFERENCES }
  }
  return getDesktopPreferences()
}

/** 返回桌面偏好的不可变快照。 */
export function getDesktopPreferences(): DesktopPreferences {
  return { ...preferences }
}

/** 更新并持久化桌面偏好。 */
export async function setDesktopPreferences(
  value: Partial<DesktopPreferences>,
): Promise<DesktopPreferences> {
  const next = normalize({ ...preferences, ...value })
  if (
    next.backgroundMode === preferences.backgroundMode &&
    next.launchHidden === preferences.launchHidden
  ) {
    return getDesktopPreferences()
  }

  preferences = next
  const snapshot = getDesktopPreferences()
  for (const listener of listeners) listener(snapshot)
  pendingSaves += 1
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => persist(snapshot))
    .finally(() => {
      pendingSaves -= 1
    })
  await saveQueue
  return snapshot
}

/** 返回是否仍有未完成的偏好落盘任务。 */
export function hasPendingDesktopPreferenceSaves(): boolean {
  return pendingSaves > 0
}

/** 等待当前偏好写入队列结束，供应用退出前收口。 */
export async function flushDesktopPreferences(): Promise<void> {
  await saveQueue.catch(() => undefined)
}

/** 订阅桌面偏好变化。 */
export function onDesktopPreferencesChanged(
  listener: (value: DesktopPreferences) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
