<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { FolderPlus, Layers, Power, PowerOff, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { BatchAction } from '@/lib/skill-action-types'

const props = defineProps<{
  selectedCount: number
  targetCount: number
  busy: boolean
  hasProjects: boolean
  hasProjectPlatforms: boolean
  hasGroups: boolean
}>()
const emit = defineEmits<{
  openProject: []
  openGroups: []
  request: [action: BatchAction]
}>()

const { t } = useI18n()
</script>

<template>
  <div
    v-if="props.selectedCount > 0"
    class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3"
  >
    <div class="flex items-center gap-2 text-sm">
      <span class="font-medium">{{ t('batch.selected', { n: props.selectedCount }) }}</span>
      <span class="text-muted-foreground">
        {{ t('batch.targets', { n: props.targetCount }) }}
      </span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        class="cursor-pointer"
        :disabled="props.busy || !props.hasProjects || !props.hasProjectPlatforms"
        @click="emit('openProject')"
      >
        <FolderPlus class="size-3.5" />
        {{ t('batch.addProject') }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="cursor-pointer"
        :disabled="props.busy || !props.hasGroups"
        @click="emit('openGroups')"
      >
        <Layers class="size-3.5" />
        {{ t('batch.addGroups') }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="cursor-pointer"
        :disabled="props.busy || props.targetCount === 0"
        @click="emit('request', 'enable')"
      >
        <Power class="size-3.5" />
        {{ t('batch.enable') }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="cursor-pointer"
        :disabled="props.busy || props.targetCount === 0"
        @click="emit('request', 'disable')"
      >
        <PowerOff class="size-3.5" />
        {{ t('batch.disable') }}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        class="cursor-pointer"
        :disabled="props.busy || props.targetCount === 0"
        @click="emit('request', 'uninstall')"
      >
        <Trash2 class="size-3.5" />
        {{ t('batch.uninstall') }}
      </Button>
    </div>
  </div>
</template>
