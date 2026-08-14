<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TriangleAlert } from '@lucide/vue'
import type { AggregatedMcpServer } from '@skillbuddy/core'
import { Badge } from '@/components/ui/badge'
import PlatformIcon from '@/components/PlatformIcon.vue'

const props = defineProps<{
  servers: AggregatedMcpServer[]
  selectedName?: string
}>()
const emit = defineEmits<{ select: [server: AggregatedMcpServer] }>()
const { t } = useI18n()

function agents(server: AggregatedMcpServer): string[] {
  return [...new Set(server.installations.map((installation) => installation.source.agent))]
}

function transport(server: AggregatedMcpServer): string {
  return server.installations[0]?.definition.transport.kind ?? 'unknown'
}

function allDisabled(server: AggregatedMcpServer): boolean {
  return (
    server.installations.length > 0 &&
    server.installations.every((installation) => installation.enabled === false)
  )
}

const selected = computed(() => props.selectedName ?? '')
</script>

<template>
  <div class="divide-y">
    <button
      v-for="server in servers"
      :key="server.name"
      type="button"
      :class="[
        'flex w-full cursor-pointer flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/45',
        selected === server.name && 'bg-muted/70',
      ]"
      @click="emit('select', server)"
    >
      <span class="flex w-full items-start justify-between gap-3">
        <span class="flex min-w-0 flex-1 items-center gap-2">
          <span class="min-w-0 truncate text-sm font-semibold">{{ server.name }}</span>
          <Badge
            v-if="allDisabled(server)"
            variant="secondary"
            class="shrink-0 px-2 py-0 text-xs font-normal text-amber-600 dark:text-amber-400"
          >
            {{ t('mcp.disabled') }}
          </Badge>
        </span>
        <Badge variant="secondary" class="shrink-0 px-2 py-0 text-xs font-normal">
          {{ transport(server) }}
        </Badge>
      </span>
      <span class="flex w-full items-center justify-between gap-3">
        <span class="flex items-center -space-x-1">
          <PlatformIcon
            v-for="agent in agents(server).slice(0, 5)"
            :key="agent"
            :id="agent"
            :size="18"
            class="rounded border-2 border-background bg-background"
          />
          <span
            v-if="agents(server).length > 5"
            class="ml-2 text-xs text-muted-foreground"
          >
            +{{ agents(server).length - 5 }}
          </span>
        </span>
        <span
          v-if="server.hasDefinitionDrift || server.hasStateDrift || server.conflictKind"
          class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
        >
          <TriangleAlert class="size-3.5" />
          {{ t('mcp.listDrift') }}
        </span>
        <span v-else class="text-xs text-muted-foreground">
          {{ t('mcp.installCount', { n: server.installations.length }) }}
        </span>
      </span>
    </button>
  </div>
</template>
