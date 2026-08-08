<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from 'reka-ui'
import { cn } from '@/lib/utils'

interface Props {
  class?: HTMLAttributes['class']
  viewportClass?: HTMLAttributes['class']
  orientation?: 'vertical' | 'horizontal' | 'both'
}

const props = withDefaults(defineProps<Props>(), {
  orientation: 'vertical',
})

const scrollbarClass =
  'z-10 flex touch-none select-none p-0.5 transition-colors data-[state=hidden]:opacity-0'
const thumbClass =
  'relative flex-1 rounded-full bg-[var(--scrollbar-thumb)] transition-colors hover:bg-[var(--scrollbar-thumb-hover)]'
</script>

<template>
  <ScrollAreaRoot
    type="hover"
    :scroll-hide-delay="600"
    :class="cn('relative min-h-0 min-w-0 overflow-hidden', props.class)"
  >
    <ScrollAreaViewport :class="cn('h-full w-full rounded-[inherit]', props.viewportClass)">
      <slot />
    </ScrollAreaViewport>

    <ScrollAreaScrollbar
      v-if="props.orientation === 'vertical' || props.orientation === 'both'"
      orientation="vertical"
      :class="cn(scrollbarClass, 'absolute right-0 top-0 h-full w-2.5')"
    >
      <ScrollAreaThumb :class="thumbClass" />
    </ScrollAreaScrollbar>

    <ScrollAreaScrollbar
      v-if="props.orientation === 'horizontal' || props.orientation === 'both'"
      orientation="horizontal"
      :class="cn(scrollbarClass, 'absolute bottom-0 left-0 h-2.5 w-full flex-row')"
    >
      <ScrollAreaThumb :class="thumbClass" />
    </ScrollAreaScrollbar>

    <ScrollAreaCorner
      v-if="props.orientation === 'both'"
      class="absolute bottom-0 right-0 size-2.5 bg-transparent"
    />
  </ScrollAreaRoot>
</template>
