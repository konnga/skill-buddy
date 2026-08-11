<script setup lang="ts">
import { ArrowLeft, ArrowRight, ExternalLink, RotateCw, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { useInAppBrowser } from '@/composables/useInAppBrowser'

/**
 * 应用内浏览器的顶部工具栏。网页内容本身由主进程的 WebContentsView
 * 渲染在工具栏（48px，与主进程 TOOLBAR_HEIGHT 一致）以下的区域。
 */
const { t } = useI18n()
const { state, back, forward, reload, close } = useInAppBrowser()

const isMac = navigator.platform.toLowerCase().includes('mac')

/** 转到系统浏览器继续看，同时关闭应用内浏览器。 */
function openExternal(): void {
  void window.skillsManager.openExternal(state.value.url)
  close()
}
</script>

<template>
  <div
    v-if="state.open"
    class="app-drag fixed inset-x-0 top-0 z-[90] flex h-12 items-center gap-1 border-b bg-background px-3"
    :class="isMac ? 'pl-[84px]' : ''"
  >
    <Button
      variant="ghost"
      size="icon"
      class="app-no-drag size-8"
      :disabled="!state.canGoBack"
      :title="t('browser.back')"
      @click="back"
    >
      <ArrowLeft class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="app-no-drag size-8"
      :disabled="!state.canGoForward"
      :title="t('browser.forward')"
      @click="forward"
    >
      <ArrowRight class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="app-no-drag size-8"
      :title="t('browser.reload')"
      @click="reload"
    >
      <RotateCw class="size-4" />
    </Button>

    <div class="min-w-0 flex-1 px-2 text-center">
      <p class="truncate text-sm font-medium" :title="state.url">
        {{ state.title || state.url }}
      </p>
    </div>

    <Button
      variant="ghost"
      size="icon"
      class="app-no-drag size-8 text-muted-foreground"
      :title="t('browser.openExternal')"
      @click="openExternal"
    >
      <ExternalLink class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="app-no-drag size-8"
      :title="t('browser.close')"
      @click="close"
    >
      <X class="size-4" />
    </Button>

    <!-- 加载指示：工具栏底部的细进度条 -->
    <div v-if="state.loading" class="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-primary" />
  </div>
</template>
