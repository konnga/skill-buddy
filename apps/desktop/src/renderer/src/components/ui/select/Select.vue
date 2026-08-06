<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
const model = defineModel<string>()
</script>

<template>
  <div :class="cn('relative inline-flex', props.class)">
    <select
      v-model="model"
      class="h-8 w-full appearance-none truncate rounded-md border border-input bg-background py-1 pl-2.5 pr-8 text-sm shadow-sm transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
    >
      <slot />
    </select>
    <ChevronDown
      class="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
    />
  </div>
</template>
