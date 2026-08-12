<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Download, Layers, Plus, Search } from '@lucide/vue'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import GroupCreateDialog from '@/components/groups/GroupCreateDialog.vue'
import GroupImportDialog from '@/components/groups/GroupImportDialog.vue'
import GroupManageCard from '@/components/groups/GroupManageCard.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGroups } from '@/composables/useGroups'
import { useSkills } from '@/composables/useSkills'
import { deriveGroupRuntimeState } from '@/lib/group-runtime'
import type { SkillInstallationFilter } from '@/lib/skill-installations'
import type { WorkspaceView } from '@/lib/navigation'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{ navigate: [view: WorkspaceView] }>()

const { t } = useI18n()
const { skills } = useSkills()
const {
  groups,
  tempApplications,
  groupToggleBusy,
  groupApplyBusy,
  openGroupFilter,
  renameGroup,
  deleteGroup,
  exportGroup,
  setGroupEnabledFor,
  endTemp,
} = useGroups()

const search = shallowRef('')
const createOpen = shallowRef(false)
const importOpen = shallowRef(false)
const renameTarget = shallowRef<string | null>(null)
const renameValue = ref('')

/** 管理页始终以全局视角推导状态，不跟随 Skills 页的筛选。 */
const globalFilter: SkillInstallationFilter = {
  platformId: null,
  projectFilter: null,
  ownershipFilter: null,
}

const stateByName = computed(
  () =>
    new Map(
      groups.value.map((group) => [
        group.name,
        deriveGroupRuntimeState(group, skills.value, globalFilter),
      ]),
    ),
)
const tempByName = computed(
  () => new Map(tempApplications.value.map((record) => [record.group, record])),
)
const busy = computed(() => groupToggleBusy.value || groupApplyBusy.value)

const filteredGroups = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return groups.value
  return groups.value.filter((group) => group.name.toLowerCase().includes(query))
})

function openGroup(name: string): void {
  openGroupFilter(name)
  emit('navigate', 'skills')
}

function startRename(name: string): void {
  renameTarget.value = name
  renameValue.value = name
}

function closeRename(): void {
  renameTarget.value = null
  renameValue.value = ''
}

const renameDuplicate = computed(() => {
  const name = renameValue.value.trim()
  return (
    !!name &&
    name !== renameTarget.value &&
    groups.value.some((group) => group.name === name)
  )
})

function submitRename(): void {
  if (!renameTarget.value) return
  if (renameGroup(renameTarget.value, renameValue.value)) closeRename()
}
</script>

<template>
  <div class="flex h-full min-w-0 flex-col">
    <header
      :class="[
        'app-drag relative flex h-14 shrink-0 items-center gap-3 border-b px-6',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <div class="app-no-drag relative w-72">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input v-model="search" :placeholder="t('groups.searchPh')" class="pl-8" />
      </div>
      <div class="flex-1" />
      <Button
        variant="outline"
        size="icon"
        class="app-no-drag"
        :title="t('groups.importAction')"
        :aria-label="t('groups.importAction')"
        @click="importOpen = true"
      >
        <Download />
      </Button>
      <Button
        variant="outline"
        size="icon"
        class="app-no-drag"
        :title="t('groups.createTitle')"
        :aria-label="t('groups.createTitle')"
        @click="createOpen = true"
      >
        <Plus />
      </Button>
    </header>

    <ScrollArea class="flex-1" viewport-class="px-6 py-5">
      <div
        v-if="groups.length === 0"
        class="flex flex-col items-center justify-center gap-3 py-24 text-center"
      >
        <Layers class="size-10 text-muted-foreground/50" />
        <div>
          <p class="text-sm font-medium">{{ t('groups.empty') }}</p>
          <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {{ t('groups.emptyHint') }}
          </p>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <Button size="sm" class="cursor-pointer" @click="createOpen = true">
            <Plus class="size-4" />
            {{ t('groups.createTitle') }}
          </Button>
          <Button variant="outline" size="sm" class="cursor-pointer" @click="importOpen = true">
            <Download class="size-4" />
            {{ t('groups.importAction') }}
          </Button>
        </div>
      </div>
      <p
        v-else-if="filteredGroups.length === 0"
        class="py-24 text-center text-sm text-muted-foreground"
      >
        {{ t('groups.noMatch', { q: search.trim() }) }}
      </p>
      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
        <GroupManageCard
          v-for="group in filteredGroups"
          :key="group.name"
          :state="stateByName.get(group.name)!"
          :temp="tempByName.get(group.name)"
          :busy="busy"
          @open="openGroup(group.name)"
          @enable="setGroupEnabledFor(group.name, true)"
          @disable="setGroupEnabledFor(group.name, false)"
          @export="exportGroup(group)"
          @rename="startRename(group.name)"
          @delete="deleteGroup(group.name)"
          @end-temp="endTemp(group.name)"
        />
      </div>
    </ScrollArea>

    <GroupCreateDialog v-model:open="createOpen" />
    <GroupImportDialog v-model:open="importOpen" />

    <DialogRoot :open="renameTarget !== null" @update:open="(open) => !open && closeRename()">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6 outline-none"
          @open-auto-focus.prevent
        >
          <DialogTitle class="mb-4 text-base font-semibold tracking-tight">
            {{ t('groups.renameTitle') }}
          </DialogTitle>
          <Input
            v-model="renameValue"
            :placeholder="t('groups.createPh')"
            class="text-sm"
            autofocus
            @keydown.enter.prevent="submitRename"
          />
          <p v-if="renameDuplicate" class="mt-2 text-sm text-destructive">
            {{ t('groups.renameDuplicate') }}
          </p>
          <div class="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" class="cursor-pointer" @click="closeRename">
              {{ t('common.cancel') }}
            </Button>
            <Button
              size="sm"
              class="cursor-pointer"
              :disabled="!renameValue.trim() || renameDuplicate"
              @click="submitRename"
            >
              {{ t('groups.renameAction') }}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
