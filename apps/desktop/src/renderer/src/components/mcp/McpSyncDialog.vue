<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { McpInstallation, McpPlatformStatus, McpTarget } from '@skillbuddy/core'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import McpTargetPicker from '@/components/mcp/McpTargetPicker.vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  source: McpInstallation | null
  platforms: McpPlatformStatus[]
  projectRoots: string[]
  installedTargets: McpTarget[]
  planning: boolean
}>()
const emit = defineEmits<{
  close: []
  review: [source: McpInstallation, targets: McpTarget[]]
}>()
const { t } = useI18n()
const targets = ref<McpTarget[]>([])

const sourceTargets = computed<McpTarget[]>(() =>
  props.source
    ? [
        {
          agent: props.source.source.agent,
          surface: props.source.source.surface,
          scope: props.source.source.scope,
          ...(props.source.source.projectRoot
            ? { projectRoot: props.source.source.projectRoot }
            : {}),
        },
      ]
    : [],
)

function review(): void {
  if (!props.source || targets.value.length === 0) return
  emit(
    'review',
    props.source,
    targets.value.map((target) => ({ ...target })),
  )
}

watch(
  () => props.source?.id ?? null,
  () => {
    targets.value = []
  },
)
</script>

<template>
  <DialogRoot :open="props.source !== null" @update:open="(open) => !open && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[min(540px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-5 shadow-xl outline-none"
      >
        <DialogTitle class="text-base font-semibold">{{ t('mcp.sync.title') }}</DialogTitle>
        <DialogDescription class="mt-1 text-sm text-muted-foreground">
          {{ props.source?.definition.name }} · {{ props.source?.source.agent }}
        </DialogDescription>
        <div class="mt-4">
          <McpTargetPicker
            v-model="targets"
            :platforms="props.platforms"
            :project-roots="props.projectRoots"
            :excluded="sourceTargets"
            :excluded-label="t('mcp.target.syncSource')"
            :installed="props.installedTargets"
          />
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" class="cursor-pointer" @click="emit('close')">
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            class="cursor-pointer"
            :disabled="targets.length === 0"
            :loading="props.planning"
            @click="review"
          >
            {{ t('mcp.form.review') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
