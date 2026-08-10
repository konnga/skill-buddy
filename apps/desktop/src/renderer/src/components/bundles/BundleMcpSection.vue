<script setup lang="ts">
import type { McpPlatformStatus, McpServerDefinition, McpTarget } from '@skillbuddy/core'
import { ServerCog } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import McpTargetPicker from '@/components/mcp/McpTargetPicker.vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  servers: McpServerDefinition[]
  platforms: McpPlatformStatus[]
  projectRoots: string[]
  installedNames: string[]
  disabled?: boolean
}>()
const selected = defineModel<Set<string>>('selected', { required: true })
const targets = defineModel<McpTarget[]>('targets', { required: true })
const { t } = useI18n()

function toggle(name: string): void {
  if (props.disabled) return
  const next = new Set(selected.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selected.value = next
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <ServerCog class="size-4 text-muted-foreground" />
      <h3 class="text-sm font-semibold">{{ t('bundles.mcpSection') }}</h3>
      <Badge variant="secondary">{{ servers.length }}</Badge>
    </div>

    <div class="flex flex-col gap-2">
      <label
        v-for="server in servers"
        :key="server.name"
        :class="[
          'flex items-center gap-2.5 rounded-md border px-3 py-2.5 transition-colors',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-foreground/25',
        ]"
      >
        <input
          type="checkbox"
          class="size-4 accent-foreground"
          :checked="selected.has(server.name)"
          :disabled="disabled"
          @change="toggle(server.name)"
        />
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="flex flex-wrap items-center gap-2 text-sm font-medium">
            {{ server.name }}
            <Badge v-if="installedNames.includes(server.name)" variant="success">
              {{ t('bundles.installedBadge') }}
            </Badge>
            <Badge variant="outline">{{ server.transport.kind }}</Badge>
          </span>
          <span class="line-clamp-1 text-sm text-muted-foreground">
            {{ server.description || t('card.noDescription') }}
          </span>
        </span>
      </label>
    </div>

    <div class="flex flex-col gap-2">
      <span class="text-sm font-medium">{{ t('bundles.mcpTargets') }}</span>
      <McpTargetPicker
        v-model="targets"
        :platforms="platforms"
        :project-roots="projectRoots"
      />
    </div>
  </section>
</template>
