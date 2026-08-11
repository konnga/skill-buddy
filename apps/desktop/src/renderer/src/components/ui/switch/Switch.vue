<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{
  disabled?: boolean
  class?: HTMLAttributes['class']
}>()

const model = defineModel<boolean>({ default: false })
</script>

<template>
  <SwitchRoot
    v-model="model"
    :disabled="props.disabled"
    :class="
      cn(
        'inline-flex h-[22px] w-9 shrink-0 items-center rounded-full border border-transparent bg-input transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <SwitchThumb
      class="pointer-events-none block size-[18px] translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-[15px]"
    />
  </SwitchRoot>
</template>
