<script setup lang="ts">
import { shallowRef } from 'vue'
import AppToast from '@/components/AppToast.vue'
import ImportAppsModal from '@/components/ImportAppsModal.vue'
import ImportSheet from '@/components/ImportSheet.vue'
import SettingsPage from '@/components/SettingsPage.vue'
import Sidebar from '@/components/Sidebar.vue'
import { useAppLifecycle } from '@/composables/useAppLifecycle'
import { useSettings } from '@/composables/useSettings'
import type { WorkspaceView } from '@/lib/navigation'
import Workspace from '@/views/WorkspaceView.vue'

const { sidebarCollapsed } = useSettings()
const view = shallowRef<WorkspaceView>('dashboard')
const navigationRevision = shallowRef(0)
const settingsOpen = shallowRef(false)
const importOpen = shallowRef(false)
const advancedImportOpen = shallowRef(false)

useAppLifecycle()

function openSettings(): void {
  settingsOpen.value = true
}

/** Navigate from the sidebar and reset the destination to its default page. */
function navigate(viewName: WorkspaceView): void {
  view.value = viewName
  navigationRevision.value += 1
}
</script>

<template>
  <AppToast />
  <SettingsPage v-if="settingsOpen" @back="settingsOpen = false" />
  <div v-else class="relative flex h-screen flex-col">
    <div class="flex min-h-0 flex-1">
      <Sidebar :view="view" @navigate="navigate" @open-settings="openSettings" />
      <Workspace
        :view="view"
        :navigation-revision="navigationRevision"
        :inset="sidebarCollapsed"
        @open-settings="openSettings"
        @import-skills="importOpen = true"
      />
      <ImportAppsModal
        :open="importOpen"
        @close="importOpen = false"
        @advanced="((importOpen = false), (advancedImportOpen = true))"
      />
      <ImportSheet :open="advancedImportOpen" @close="advancedImportOpen = false" />
    </div>
  </div>
</template>

<style>
.app-drag {
  -webkit-app-region: drag;
}

.app-no-drag {
  -webkit-app-region: no-drag;
}
</style>
