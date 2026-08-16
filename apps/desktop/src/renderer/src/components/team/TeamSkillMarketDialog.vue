<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { LoaderCircle, Store, X } from '@lucide/vue'
import MarketDiscovery from '@/components/MarketDiscovery.vue'
import { Button } from '@/components/ui/button'
import type { MarketItem } from '@/lib/market'

defineProps<{
  open: boolean
  busy: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  close: []
  select: [item: MarketItem]
}>()
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 flex h-[min(820px,90vh)] w-[min(1040px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none">
        <div class="flex items-start gap-3 border-b px-5 py-4">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/25">
            <Store class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <DialogTitle class="text-base font-semibold">从 Skills 市场添加</DialogTitle>
            <DialogDescription class="mt-1 text-sm text-muted-foreground">
              选择市场资源后，将完整 Skill 目录加入当前团队库变更草稿。
            </DialogDescription>
          </span>
          <LoaderCircle v-if="busy" class="mt-1 size-4 animate-spin text-muted-foreground" />
          <Button v-else variant="ghost" size="icon" class="size-8 cursor-pointer" title="关闭" @click="emit('close')">
            <X />
          </Button>
        </div>
        <p v-if="error" class="border-b bg-destructive/5 px-5 py-3 text-sm text-destructive">
          {{ error }}
        </p>
        <div :class="['min-h-0 flex-1 overflow-y-auto px-5 py-4', busy && 'pointer-events-none opacity-60']">
          <MarketDiscovery action-mode="team-library" @open="emit('select', $event)" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
