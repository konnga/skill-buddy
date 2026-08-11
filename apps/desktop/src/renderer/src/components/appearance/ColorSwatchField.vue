<script setup lang="ts">
import { computed } from 'vue'
import { readableOn } from '@/composables/useAppearance'

/**
 * ChatGPT 风格的颜色胶囊：底色即当前颜色、居中显示十六进制值，
 * 点击唤起系统取色器。
 */
const model = defineModel<string>({ required: true })

const textColor = computed(() => readableOn(model.value))

function onInput(event: Event): void {
  model.value = (event.target as HTMLInputElement).value.toLowerCase()
}
</script>

<template>
  <label
    class="relative inline-flex h-9 w-44 cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-medium shadow-sm ring-1 ring-inset ring-black/10 transition-shadow hover:shadow dark:ring-white/15"
    :style="{ background: model, color: textColor }"
  >
    <span
      class="size-3.5 rounded-full border"
      :style="{ borderColor: `color-mix(in srgb, ${textColor} 45%, transparent)` }"
    />
    <span class="uppercase tracking-wide">{{ model }}</span>
    <input
      type="color"
      class="absolute inset-0 size-full cursor-pointer opacity-0"
      :value="model"
      @input="onInput"
    />
  </label>
</template>
