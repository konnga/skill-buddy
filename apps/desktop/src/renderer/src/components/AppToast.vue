<script setup lang="ts">
import { dismissToast, useToast } from '@/composables/useToast'

const { toast } = useToast()

async function runAction(): Promise<void> {
  const action = toast.value?.onAction
  dismissToast()
  await action?.()
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200"
    enter-from-class="translate-y-2 opacity-0"
    leave-active-class="transition duration-150"
    leave-to-class="translate-y-2 opacity-0"
  >
    <div
      v-if="toast"
      class="fixed bottom-6 left-1/2 z-[90] flex max-w-[calc(100vw-3rem)] -translate-x-1/2 items-center gap-3 rounded-lg border bg-background px-4 py-2.5 text-sm shadow-lg"
      role="status"
      aria-live="polite"
    >
      <span class="min-w-0">{{ toast.message }}</span>
      <button
        v-if="toast.actionLabel"
        type="button"
        class="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
        @click="runAction"
      >
        {{ toast.actionLabel }}
      </button>
    </div>
  </Transition>
</template>
