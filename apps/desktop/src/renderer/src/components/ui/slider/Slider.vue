<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue'
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    class?: HTMLAttributes['class']
  }>(),
  { min: 0, max: 100, step: 1 },
)

const model = defineModel<number>({ default: 0 })

/** reka-ui 的 Slider 以数组建模（支持多滑块），这里桥接为单值。 */
const values = computed<number[]>({
  get: () => [model.value],
  set: (v) => (model.value = v[0] ?? props.min),
})
</script>

<template>
  <SliderRoot
    v-model="values"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    :disabled="props.disabled"
    :class="
      cn(
        'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50',
        props.class,
      )
    "
  >
    <SliderTrack class="relative h-1 w-full grow overflow-hidden rounded-full bg-input">
      <SliderRange class="absolute h-full bg-primary" />
    </SliderTrack>
    <SliderThumb
      class="block size-4 rounded-full border border-black/10 bg-white shadow transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:border-white/20"
      :aria-label="'value'"
    />
  </SliderRoot>
</template>
