<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

const props = defineProps<{
  open: boolean
  projectRoot: string
  projectAgents: string[]
  projectOptions: { value: string; label: string }[]
  platforms: { id: string; displayName: string }[]
  selectedCount: number
  busy: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  'update:projectRoot': [root: string]
  toggleAgent: [id: string]
  confirm: []
}>()

const { t } = useI18n()

function handleProjectRootChange(root: string | undefined): void {
  if (root !== undefined) emit('update:projectRoot', root)
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
      >
        <DialogTitle class="text-base font-semibold">{{ t('batch.addProjectTitle') }}</DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          {{ t('batch.addProjectHint', { n: props.selectedCount }) }}
        </DialogDescription>
        <div class="mt-4 flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">{{ t('batch.project') }}</span>
            <Select
              :model-value="props.projectRoot"
              :options="props.projectOptions"
              @update:model-value="handleProjectRootChange"
            />
          </div>
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">{{ t('batch.agents') }}</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="platform in props.platforms"
                :key="platform.id"
                type="button"
                :class="[
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                  props.projectAgents.includes(platform.id)
                    ? 'border-foreground bg-foreground text-background'
                    : 'hover:border-foreground/40',
                ]"
                @click="emit('toggleAgent', platform.id)"
              >
                <PlatformIcon :id="platform.id" :size="14" />
                {{ platform.displayName }}
              </button>
            </div>
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            :disabled="props.busy"
            @click="emit('update:open', false)"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            class="cursor-pointer"
            :disabled="!props.projectRoot || props.projectAgents.length === 0"
            :loading="props.busy"
            @click="emit('confirm')"
          >
            {{ t('batch.addProjectAction') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
