<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { ServerCog, X } from '@lucide/vue'
import type { AggregatedMcpServer } from '@skillbuddy/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useMcpServers } from '@/composables/useMcpServers'

const props = defineProps<{
  open: boolean
  busy?: boolean
  /** 草稿里已有的 MCP Server 名称，用于标记「已在草稿」。 */
  existingNames: readonly string[]
}>()

const emit = defineEmits<{
  close: []
  select: [server: AggregatedMcpServer]
}>()

const { t } = useI18n()
const { servers, refresh } = useMcpServers()
const keyword = ref('')
const scanning = ref(false)

/** 每次打开都重扫一次，避免本地新增的配置在列表里缺席。 */
watch(
  () => props.open,
  (open) => {
    if (!open) return
    keyword.value = ''
    scanning.value = true
    void refresh({ silent: true }).finally(() => {
      scanning.value = false
    })
  },
)

const existing = computed(() => new Set(props.existingNames))

const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return servers.value
    .filter((server) => {
      if (!query) return true
      const fields = [
        server.name,
        server.installations[0]?.definition.description ?? '',
        ...server.installations.map((item) => item.source.agent),
      ]
      return fields.some((field) => field.toLowerCase().includes(query))
    })
    .sort((a, b) => a.name.localeCompare(b.name))
})

function transportOf(server: AggregatedMcpServer): string {
  return server.installations[0]?.definition.transport.kind ?? 'stdio'
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="(value) => !value && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 flex h-[min(680px,88vh)] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-xl outline-none"
      >
        <div class="flex items-start gap-3 border-b px-5 py-4">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/25">
            <ServerCog class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <DialogTitle class="text-base font-semibold">{{ t('team.localMcpDialogTitle') }}</DialogTitle>
            <DialogDescription class="mt-1 text-sm text-muted-foreground">
              {{ t('team.localMcpDialogDescription') }}
            </DialogDescription>
          </span>
          <Button
            variant="ghost"
            size="icon"
            class="size-8 cursor-pointer"
            :title="t('common.close')"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <X />
          </Button>
        </div>

        <div class="border-b px-5 py-3">
          <Input v-model="keyword" :placeholder="t('team.localMcpSearch')" class="h-8" />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <p v-if="scanning && servers.length === 0" class="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <LoadingSpinner />
            <span>{{ t('team.localMcpScanning') }}</span>
          </p>
          <p v-else-if="filtered.length === 0" class="py-16 text-center text-sm text-muted-foreground">
            {{ keyword.trim() ? t('team.localMcpNoMatch') : t('team.localMcpEmpty') }}
          </p>
          <ul v-else class="divide-y">
            <li v-for="server in filtered" :key="server.name">
              <button
                type="button"
                :disabled="props.busy || existing.has(server.name)"
                class="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                @click="emit('select', server)"
              >
                <ServerCog class="size-4 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ server.name }}</span>
                  <span class="mt-0.5 block truncate text-xs text-muted-foreground">
                    {{ server.installations[0]?.definition.description || server.installations[0]?.source.configPath }}
                  </span>
                </span>
                <Badge v-if="existing.has(server.name)" variant="outline" class="shrink-0">
                  {{ t('team.localMcpDuplicate') }}
                </Badge>
                <template v-else>
                  <Badge variant="secondary" class="shrink-0">{{ transportOf(server) }}</Badge>
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {{ t('team.localMcpInstallCount', { n: server.installations.length }) }}
                  </span>
                </template>
              </button>
            </li>
          </ul>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
