<!--
 * @Author: wjc
 * @Date: 2026-08-16 17:54:22
 * @LastEditors: wjc
 * @LastEditTime: 2026-08-16 20:54:29
 * @Description:
-->
<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { ArrowLeft, ServerCog, X } from '@lucide/vue'
import type { TeamLibraryMcpDraft } from '../../../../shared/ipc.js'
import McpMarketCatalog from '@/components/mcp/McpMarketCatalog.vue'
import McpMarketDetail from '@/components/mcp/McpMarketDetail.vue'
import { Button } from '@/components/ui/button'
import type { McpMarketItem } from '@/lib/mcp-market'

const props = defineProps<{
  open: boolean
  busy: boolean
  error?: string | null
  existingNames: string[]
}>()

const emit = defineEmits<{
  close: []
  select: [draft: TeamLibraryMcpDraft]
}>()

const selected = shallowRef<McpMarketItem | null>(null)

watch(() => props.open, (open) => {
  if (open) selected.value = null
})
</script>

<template>
  <DialogRoot :open="open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-50 flex h-[min(840px,92vh)] w-[min(1040px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none">
        <div class="flex items-center gap-3 border-b px-5 py-4">
          <Button
            v-if="selected"
            variant="ghost"
            size="icon"
            class="size-8 cursor-pointer"
            title="返回 MCP 市场"
            @click="selected = null"
          >
            <ArrowLeft />
          </Button>
          <span v-else class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/25">
            <ServerCog class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <DialogTitle class="truncate text-base font-semibold">
              {{ selected ? selected.name : '从 MCP 市场添加' }}
            </DialogTitle>
            <DialogDescription class="mt-1 text-sm text-muted-foreground">
              {{ selected ? '选择一个有效配置加入当前团队库变更草稿。' : '从 MCP 市场选择统一维护的服务配置。' }}
            </DialogDescription>
          </span>
          <Button variant="ghost" size="icon" class="size-8 cursor-pointer" title="关闭" @click="emit('close')">
            <X />
          </Button>
        </div>

        <McpMarketCatalog
          v-if="!selected"
          class="min-h-0 flex-1"
          action-mode="team-library"
          @open-detail="selected = $event"
          @install="selected = $event"
        />
        <McpMarketDetail
          v-else
          :item="selected"
          install-only
          team-library-mode
          :action-busy="busy"
          :action-error="error"
          :existing-names="existingNames"
          @add-to-team-library="emit('select', $event)"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
