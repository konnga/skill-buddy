<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { platformIcon } from '@/lib/platform-icons'

const props = withDefaults(
  defineProps<{
    id: string
    /** Tailwind size utility value in px terms; default 16 */
    size?: number
    class?: string
  }>(),
  { size: 16 },
)

const def = computed(() => platformIcon(props.id))
</script>

<template>
  <svg
    v-if="def.path"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    :class="cn('shrink-0', props.class)"
    aria-hidden="true"
  >
    <path :d="def.path" />
  </svg>
  <span
    v-else
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.52}px` }"
    :class="
      cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-[4px] bg-foreground/80 font-semibold leading-none text-background',
        props.class,
      )
    "
    aria-hidden="true"
  >
    {{ def.monogram }}
  </span>
</template>
