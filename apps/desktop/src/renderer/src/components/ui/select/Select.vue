<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { Check, ChevronDown } from '@lucide/vue'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

const props = defineProps<{
  options: SelectOption[]
  placeholder?: string
  class?: HTMLAttributes['class']
}>()

const model = defineModel<string>()
</script>

<template>
  <SelectRoot v-model="model">
    <SelectTrigger
      :class="
        cn(
          'flex h-8 items-center justify-between gap-2 rounded-md border border-input bg-background py-1 pl-2.5 pr-2 text-sm shadow-sm transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate',
          props.class,
        )
      "
    >
      <SelectValue :placeholder="placeholder" />
      <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="4"
        class="z-[70] max-h-72 min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
      >
        <SelectViewport class="p-1">
          <SelectItem
            v-for="opt in options"
            :key="opt.value"
            :value="opt.value"
            class="relative flex cursor-pointer select-none items-center rounded-[5px] py-1.5 pl-2.5 pr-8 text-sm outline-none data-[highlighted]:bg-accent"
          >
            <SelectItemText>{{ opt.label }}</SelectItemText>
            <SelectItemIndicator class="absolute right-2 inline-flex items-center">
              <Check class="size-3.5" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
