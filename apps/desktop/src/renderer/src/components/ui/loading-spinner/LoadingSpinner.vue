<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { LoaderCircle } from '@lucide/vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class']
    size?: string
  }>(),
  { size: 'size-4' },
)
</script>

<template>
  <LoaderCircle
    :class="cn('shrink-0 animate-spin', props.size, props.class)"
    aria-hidden="true"
  />
</template>
