<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { platformIcon } from '@/lib/platform-icons'

const props = withDefaults(
  defineProps<{
    id: string
    /** Icon size in px; default 16 */
    size?: number
    class?: string
  }>(),
  { size: 16 },
)

const def = computed(() => platformIcon(props.id))
</script>

<template>
  <span
    v-if="def.maskSrc"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: 'currentColor',
      maskImage: `url(${def.maskSrc})`,
      maskPosition: 'center',
      maskRepeat: 'no-repeat',
      maskSize: 'contain',
    }"
    :class="cn('inline-block shrink-0', props.class)"
    aria-hidden="true"
  />
  <img
    v-else-if="def.src"
    :src="def.src"
    :width="size"
    :height="size"
    :class="cn('shrink-0 rounded-[3px]', props.class)"
    alt=""
    aria-hidden="true"
  />
  <span
    v-else
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${size * 0.52}px`,
      background: def.bg,
    }"
    :class="
      cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-[4px] font-semibold leading-none',
        def.bg ? 'text-white' : 'bg-foreground/80 text-background',
        props.class,
      )
    "
    aria-hidden="true"
  >
    {{ def.monogram }}
  </span>
</template>
