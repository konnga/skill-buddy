<script setup lang="ts">
import { AlertTriangle, Check, FileCog, X } from '@lucide/vue'
import type { McpOperationPlanView } from '@skillbuddy/core'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { Button } from '@/components/ui/button'
import PlatformIcon from '@/components/PlatformIcon.vue'
import type { DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ plan: DeepReadonly<McpOperationPlanView> | null; applying?: boolean }>()
const emit = defineEmits<{ close: []; apply: [] }>()
const { t } = useI18n()

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
</script>

<template>
  <DialogRoot :open="plan !== null" @update:open="(open) => !open && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex max-h-[82vh] w-[min(620px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-background shadow-xl outline-none"
      >
        <div class="flex items-start justify-between gap-4 border-b px-5 py-4">
          <span>
            <DialogTitle class="text-base font-semibold">{{ t('mcp.plan.title') }}</DialogTitle>
            <DialogDescription class="mt-1 text-sm text-muted-foreground">
              {{ plan?.name }} · {{ plan?.kind }}
            </DialogDescription>
          </span>
          <button
            type="button"
            class="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            :aria-label="t('mcp.plan.close')"
            :title="t('mcp.plan.close')"
            :disabled="applying"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div class="divide-y rounded-md border">
            <div
              v-for="action in plan?.actions"
              :key="`${action.sourceId}:${action.target.scope}`"
              class="flex items-center gap-3 px-3 py-2.5"
            >
              <PlatformIcon :id="action.target.agent" :size="18" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">
                  {{ action.target.agent }} · {{ action.target.surface }} · {{ action.target.scope }}
                </span>
                <span class="flex items-center gap-1 truncate text-xs text-muted-foreground" :title="action.configPath">
                  <FileCog class="size-3" />
                  {{ basename(action.configPath) }}
                </span>
              </span>
              <Check v-if="action.changed" class="size-4 text-emerald-600" />
              <span v-else class="text-xs text-muted-foreground">{{ t('mcp.plan.noChange') }}</span>
            </div>
          </div>

          <div v-if="plan?.warnings.length" class="mt-4 space-y-2">
            <p
              v-for="warning in plan.warnings"
              :key="`${warning.code}:${warning.field ?? ''}`"
              class="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle class="mt-0.5 size-4 shrink-0" />
              <span>{{ warning.message }}</span>
            </p>
          </div>

          <div v-if="plan?.blockers.length" class="mt-4 space-y-2">
            <p
              v-for="blocker in plan.blockers"
              :key="`${blocker.code}:${blocker.field ?? ''}`"
              class="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <AlertTriangle class="mt-0.5 size-4 shrink-0" />
              <span>{{ blocker.message }}</span>
            </p>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t px-5 py-4">
          <Button variant="ghost" size="sm" :disabled="applying" @click="emit('close')">
            {{ t('mcp.plan.cancel') }}
          </Button>
          <Button
            size="sm"
            :disabled="!plan?.canApply || applying"
            @click="emit('apply')"
          >
            {{ applying ? t('mcp.plan.applying') : t('mcp.plan.apply') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
