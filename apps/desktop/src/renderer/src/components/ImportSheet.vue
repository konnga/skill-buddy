<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { X } from '@lucide/vue'
import FoundSkillList from '@/components/import/FoundSkillList.vue'
import ImportSourcePicker from '@/components/import/ImportSourcePicker.vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSkillImportWorkflow } from '@/composables/useSkillImportWorkflow'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const {
  tab,
  gitUrl,
  fetching,
  items,
  searched,
  selected,
  previewDir,
  targets,
  busy,
  error,
  setTab,
  setGitUrl,
  setTargets,
  pickLocalDir,
  onDrop,
  fetchGit,
  toggleItem,
  togglePreview,
  runImport,
} = useSkillImportWorkflow({
  open: () => props.open,
  onComplete: () => emit('close'),
})
</script>

<template>
  <DialogRoot :open="props.open" @update:open="(open) => !open && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/30" />
      <DialogContent
        class="fixed inset-y-0 right-0 z-50 flex w-[600px] max-w-[92vw] flex-col border-l bg-background outline-none"
        @open-auto-focus.prevent
      >
        <header class="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle class="text-base font-semibold tracking-tight">
            {{ t('import.title') }}
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            class="cursor-pointer"
            @click="emit('close')"
          >
            <X />
          </Button>
        </header>

        <ScrollArea class="flex-1">
          <div class="flex flex-col gap-4 px-6 py-4">
            <ImportSourcePicker
              :tab="tab"
              :git-url="gitUrl"
              :fetching="fetching"
              @update:tab="setTab"
              @update:git-url="setGitUrl"
              @pick-local="pickLocalDir"
              @drop="onDrop"
              @fetch-git="fetchGit"
            />

            <template v-if="searched">
              <p v-if="items.length === 0" class="text-sm text-muted-foreground">
                {{ t('import.none') }}
              </p>
              <div v-else class="flex flex-col gap-2">
                <FoundSkillList
                  :items="items"
                  :selected="selected"
                  :preview-dir="previewDir"
                  :targets="targets"
                  @toggle="toggleItem"
                  @preview="togglePreview"
                  @update:targets="setTargets"
                />
              </div>
            </template>

            <p v-if="error" class="break-all text-sm text-destructive">{{ error }}</p>
          </div>
        </ScrollArea>

        <footer class="flex items-center justify-end gap-2 border-t px-6 py-3">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            :disabled="busy"
            @click="emit('close')"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            class="cursor-pointer"
            :disabled="busy || selected.size === 0 || targets.length === 0"
            @click="runImport"
          >
            {{ busy ? t('import.importing') : t('import.install', { n: selected.size }) }}
          </Button>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
