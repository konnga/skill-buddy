<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Primitive, type PrimitiveProps } from 'reka-ui'
import { cn } from '@/lib/utils'
import { LoadingSpinner } from '../loading-spinner'
import { type ButtonVariants, buttonVariants } from './index'

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
  disabled?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
})
</script>

<template>
  <Primitive
    :as="props.as"
    :as-child="props.asChild"
    :disabled="props.disabled || props.loading || undefined"
    :aria-busy="props.loading || undefined"
    :class="cn(buttonVariants({ variant: props.variant, size: props.size }), props.class)"
  >
    <LoadingSpinner v-if="props.loading" />
    <slot />
  </Primitive>
</template>
