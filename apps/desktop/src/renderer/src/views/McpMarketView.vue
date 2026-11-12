<script setup lang="ts">
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft } from '@lucide/vue'
import McpMarketCatalog from '@/components/mcp/McpMarketCatalog.vue'
import McpMarketDetail from '@/components/mcp/McpMarketDetail.vue'
import McpMarketInstallDialog from '@/components/mcp/McpMarketInstallDialog.vue'
import McpPlanDialog from '@/components/mcp/McpPlanDialog.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Button } from '@/components/ui/button'
import { useMcpServers } from '@/composables/useMcpServers'
import { showToast } from '@/composables/useToast'
import type { McpMarketItem } from '@/lib/mcp-market'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const { currentPlan, applying, applyPlan, restore, closePlan } = useMcpServers()
const selectedItem = shallowRef<McpMarketItem | null>(null)
const installItem = shallowRef<McpMarketItem | null>(null)

async function executePlan(): Promise<void> {
  const result = await applyPlan()
  if (!result) return
  const succeeded = result.results.filter((item) => item.ok)
  const failed = result.results.filter((item) => !item.ok)
  if (succeeded.length > 0) {
    showToast.success(t('mcp.applied', { n: succeeded.length }), {
      actionLabel: t('common.undo'),
      onAction: async () => {
        const restored = await restore(result.operationId)
        showToast({
          message: restored ? t('common.restored') : t('mcp.restoreFailed'),
          type: restored ? 'success' : 'error',
        })
      },
      duration: 6_000,
    })
  }
  if (failed.length > 0) {
    showToast.error(failed.map((item) => item.error).filter(Boolean).join('; '))
  }
}
</script>

<template>
  <div class="flex h-full min-w-0 flex-col">
    <header
      v-show="!selectedItem"
      :class="[
        'app-drag relative flex min-h-14 shrink-0 items-center gap-4 border-b px-6 py-2',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="app-no-drag -ml-2 size-8 shrink-0 cursor-pointer"
        :title="t('common.back')"
        :aria-label="t('common.back')"
        @click="emit('close')"
      >
        <ArrowLeft />
      </Button>
      <div class="min-w-0">
        <h1 class="text-sm font-semibold">{{ t('mcp.market.title') }}</h1>
        <p class="truncate text-xs text-muted-foreground">{{ t('mcp.market.description') }}</p>
      </div>
    </header>

    <!--
      必须是 flex 容器：McpMarketCatalog 用 flex-1 撑满剩余高度，
      父级如果是普通块级元素，flex-1 不生效，列表会把整页顶高导致窗口滚动。
    -->
    <div
      v-show="!selectedItem"
      class="flex min-h-0 flex-1 flex-col"
    >
      <KeepAlive>
        <McpMarketCatalog
          @open-detail="selectedItem = $event"
          @install="installItem = $event"
        />
      </KeepAlive>
    </div>

    <KeepAlive :max="3">
      <McpMarketDetail
        v-if="selectedItem"
        :key="selectedItem.key"
        :item="selectedItem"
        :inset="props.inset"
        @close="selectedItem = null"
      />
    </KeepAlive>
  </div>
  <McpMarketInstallDialog
    v-if="installItem"
    :key="installItem.key"
    :item="installItem"
    @close="installItem = null"
  />
  <McpPlanDialog
    :plan="currentPlan"
    :applying="applying"
    @close="closePlan"
    @apply="executePlan"
  />
</template>
