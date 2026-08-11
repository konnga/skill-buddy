import { shallowRef } from 'vue'
import type { InAppBrowserState } from '../../../shared/ipc.js'

const closedState: InAppBrowserState = {
  open: false,
  url: '',
  title: '',
  canGoBack: false,
  canGoForward: false,
  loading: false,
}

const state = shallowRef<InAppBrowserState>(closedState)

window.skillsManager?.onBrowserState((next) => {
  state.value = next
})

/** 应用内浏览器（主进程 WebContentsView）的导航状态与操作。 */
export function useInAppBrowser() {
  return {
    state,
    back: (): void => void window.skillsManager.browserBack(),
    forward: (): void => void window.skillsManager.browserForward(),
    reload: (): void => void window.skillsManager.browserReload(),
    close: (): void => void window.skillsManager.browserClose(),
  }
}
