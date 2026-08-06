<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { type BadgeVariants, badgeVariants } from './index'

const props = defineProps<{
  variant?: BadgeVariants['variant']
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <span :class="cn(badgeVariants({ variant: props.variant }), props.class)">
    <slot />
  </span>
</template>
