<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PanelLeft } from '@lucide/vue'
import { useSettings } from '@/composables/useSettings'

const { sidebarCollapsed } = useSettings()
const { t } = useI18n()
</script>

<template>
  <button
    v-if="sidebarCollapsed"
    class="app-no-drag absolute left-[78px] top-1.5 z-20 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
    :title="`${t('app.toggleSidebar')} (⌘B)`"
    :aria-label="t('app.toggleSidebar')"
    @click="sidebarCollapsed = false"
  >
    <PanelLeft class="size-4" />
  </button>
</template>
