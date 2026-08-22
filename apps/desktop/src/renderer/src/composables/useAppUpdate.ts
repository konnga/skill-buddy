import { computed, onMounted, shallowRef } from 'vue'
import type { UpdateCheckResult, UpdateDownloadProgress } from '#shared/ipc'

const appInfo = shallowRef<Awaited<ReturnType<typeof window.skillsManager.getAppInfo>> | null>(null)
const updateResult = shallowRef<UpdateCheckResult | null>(null)
const checking = shallowRef(false)
const downloading = shallowRef(false)
const downloaded = shallowRef(false)
const downloadPercent = shallowRef(0)
const downloadError = shallowRef('')
let initialized = false
let listenerRegistered = false

function handleProgress(progress: UpdateDownloadProgress): void {
  if (progress.status === 'downloading') {
    downloading.value = true
    downloaded.value = false
    downloadPercent.value = progress.percent
    return
  }
  if (progress.status === 'completed') {
    downloading.value = false
    downloaded.value = true
    downloadPercent.value = 100
    return
  }
  downloading.value = false
  downloadError.value = progress.message
}

async function checkUpdate(): Promise<UpdateCheckResult> {
  checking.value = true
  downloadError.value = ''
  try {
    updateResult.value = await window.skillsManager.checkUpdate()
    return updateResult.value
  } finally {
    checking.value = false
  }
}

async function downloadUpdate(): Promise<void> {
  if (updateResult.value?.status !== 'update' || downloading.value || downloaded.value) return
  downloading.value = true
  downloaded.value = false
  downloadPercent.value = 0
  downloadError.value = ''
  try {
    await window.skillsManager.downloadUpdate(updateResult.value.latest)
  } catch (error) {
    downloading.value = false
    downloadError.value = error instanceof Error ? error.message : String(error)
  }
}

function initialize(): void {
  if (initialized) return
  initialized = true
  void window.skillsManager.getAppInfo()
    .then((value) => { appInfo.value = value })
    .catch(() => undefined)
  if (!listenerRegistered) {
    listenerRegistered = true
    window.skillsManager.onUpdateDownloadProgress(handleProgress)
  }
  void checkUpdate().catch(() => undefined)
}

export function useAppUpdate() {
  onMounted(initialize)
  const hasDownload = computed(
    () => updateResult.value?.status === 'update' && Boolean(updateResult.value.asset),
  )
  return {
    appInfo,
    updateResult,
    checking,
    downloading,
    downloaded,
    downloadPercent,
    downloadError,
    hasDownload,
    checkUpdate,
    downloadUpdate,
    initialize,
  }
}
