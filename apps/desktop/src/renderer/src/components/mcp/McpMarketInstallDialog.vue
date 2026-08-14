<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { X } from '@lucide/vue'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import McpMarketDetail from '@/components/mcp/McpMarketDetail.vue'
import { Button } from '@/components/ui/button'
import type { McpMarketItem } from '@/lib/mcp-market'

const props = defineProps<{ item: McpMarketItem }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>

<template>
  <DialogRoot :open="true" @update:open="(open) => !open && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex h-[min(680px,82vh)] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none"
      >
        <header class="flex h-14 shrink-0 items-center gap-3 border-b px-5">
          <DialogTitle class="min-w-0 flex-1 truncate text-base font-semibold">
            {{ t('mcp.market.install') }} · {{ props.item.name }}
          </DialogTitle>
          <DialogDescription class="sr-only">
            {{ props.item.description || t('mcp.market.description') }}
          </DialogDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-8 shrink-0 cursor-pointer"
            :title="t('common.close')"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <X class="size-4" />
          </Button>
        </header>

        <McpMarketDetail
          :key="props.item.key"
          :item="props.item"
          install-only
          @reviewed="emit('close')"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
