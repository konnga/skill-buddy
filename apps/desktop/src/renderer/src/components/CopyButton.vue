<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Copy } from '@lucide/vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ text: string; class?: string }>()
const { t } = useI18n()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy(): Promise<void> {
  await navigator.clipboard.writeText(props.text)
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 1200)
}
</script>

<template>
  <button
    type="button"
    :title="copied ? t('common.copied') : t('common.copy')"
    :class="
      cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground',
        props.class,
      )
    "
    @click.stop="copy"
  >
    <Check v-if="copied" class="size-3.5 text-emerald-500" />
    <Copy v-else class="size-3.5" />
  </button>
</template>
