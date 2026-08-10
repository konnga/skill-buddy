<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowRightLeft,
  CircleAlert,
  ExternalLink,
  Power,
  PowerOff,
  ShieldAlert,
  Trash2,
  TriangleAlert,
} from '@lucide/vue'
import type {
  AggregatedMcpServer,
  McpInstallation,
  McpPlatformStatus,
} from '@skillbuddy/core'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  server: AggregatedMcpServer
  platforms: McpPlatformStatus[]
  busy?: boolean
}>()
const emit = defineEmits<{
  sync: [installation: McpInstallation]
  remove: [installationIds: string[]]
  toggle: [installationId: string, enabled: boolean]
}>()
const { t } = useI18n()

const definition = computed(() => props.server.installations[0]?.definition)
const writableInstallations = computed(() =>
  props.server.installations.filter((installation) => !installation.source.readOnly),
)
const canUseDefaultSource = computed(
  () => !props.server.hasDefinitionDrift && !props.server.conflictKind,
)

function capability(installation: McpInstallation): McpPlatformStatus | undefined {
  return props.platforms.find(
    (platform) =>
      platform.agent === installation.source.agent &&
      platform.surface === installation.source.surface,
  )
}

function canToggle(installation: McpInstallation): boolean {
  return (
    !installation.source.readOnly && capability(installation)?.capabilities.toggle === 'native'
  )
}

function authLabel(installation: McpInstallation): string {
  return t(`mcp.auth.${installation.authState}`)
}

function authClass(installation: McpInstallation): string {
  if (installation.authState === 'ready') return 'text-emerald-600 dark:text-emerald-400'
  if (installation.authState === 'missing-secrets') return 'text-amber-600 dark:text-amber-400'
  return 'text-muted-foreground'
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
</script>

<template>
  <div class="flex h-full min-w-0 flex-col">
    <header class="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-5">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="truncate text-lg font-semibold">{{ server.name }}</h2>
          <Badge variant="secondary" class="font-normal">
            {{ definition?.transport.kind }}
          </Badge>
          <Badge
            v-if="server.conflictKind"
            variant="outline"
            class="gap-1 border-destructive/40 text-destructive"
          >
            <CircleAlert class="size-3" />
            {{ t('mcp.conflict', { kind: server.conflictKind }) }}
          </Badge>
          <Badge
            v-else-if="server.hasDefinitionDrift || server.hasStateDrift"
            variant="outline"
            class="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
          >
            <TriangleAlert class="size-3" />
            {{ t('mcp.drift') }}
          </Badge>
        </div>
        <p v-if="definition?.description" class="mt-1 text-sm text-muted-foreground">
          {{ definition.description }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button
          v-if="canUseDefaultSource && server.installations[0]"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="emit('sync', server.installations[0])"
        >
          <ArrowRightLeft />
          {{ t('mcp.actions.sync') }}
        </Button>
        <Button
          v-if="writableInstallations.length > 0"
          variant="outline"
          size="icon"
          class="text-destructive hover:bg-destructive/10 hover:text-destructive"
          :disabled="busy"
          :title="t('mcp.actions.removeAll')"
          :aria-label="t('mcp.actions.removeAll')"
          @click="emit('remove', writableInstallations.map((installation) => installation.id))"
        >
          <Trash2 />
        </Button>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <section class="border-b px-6 py-5">
        <h3 class="text-sm font-semibold">{{ t('mcp.definition') }}</h3>
        <dl class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div v-if="definition?.transport.kind === 'stdio'">
            <dt class="text-xs text-muted-foreground">{{ t('mcp.command') }}</dt>
            <dd class="mt-1 break-all font-mono">{{ definition.transport.command }}</dd>
          </div>
          <div v-if="definition?.transport.kind === 'stdio'">
            <dt class="text-xs text-muted-foreground">{{ t('mcp.arguments') }}</dt>
            <dd class="mt-1 break-all font-mono text-xs">
              {{ definition.transport.args.join(' ') || '—' }}
            </dd>
          </div>
          <div v-if="definition?.transport.kind !== 'stdio'">
            <dt class="text-xs text-muted-foreground">URL</dt>
            <dd class="mt-1 flex items-center gap-1 break-all font-mono text-xs">
              {{ definition?.transport.url }}
              <ExternalLink class="size-3 shrink-0 text-muted-foreground" />
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted-foreground">{{ t('mcp.requiredSecrets') }}</dt>
            <dd class="mt-1 flex flex-wrap gap-1.5">
              <Badge
                v-for="secret in definition?.requiredSecrets"
                :key="secret"
                variant="secondary"
                class="font-mono text-xs font-normal"
              >
                {{ secret }}
              </Badge>
              <span v-if="!definition?.requiredSecrets.length" class="text-muted-foreground">—</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="px-6 py-5">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold">{{ t('mcp.installations') }}</h3>
          <span class="text-xs tabular-nums text-muted-foreground">
            {{ server.installations.length }}
          </span>
        </div>
        <div class="mt-3 divide-y rounded-md border">
          <div
            v-for="installation in server.installations"
            :key="installation.id"
            class="flex items-center gap-3 px-3 py-3"
          >
            <PlatformIcon :id="installation.source.agent" :size="20" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-medium">
                  {{ capability(installation)?.displayName ?? installation.source.agent }}
                </span>
                <span class="text-xs text-muted-foreground">
                  {{ installation.source.surface }} · {{ installation.source.scope }}
                </span>
                <Badge
                  v-if="installation.source.readOnly"
                  variant="secondary"
                  class="px-2 py-0 text-xs font-normal"
                >
                  {{ t('mcp.readOnly') }}
                </Badge>
                <Badge
                  v-if="installation.enabled === false"
                  variant="secondary"
                  class="px-2 py-0 text-xs font-normal text-amber-600 dark:text-amber-400"
                >
                  {{ t('mcp.disabled') }}
                </Badge>
              </div>
              <div class="mt-1 flex min-w-0 items-center gap-3 text-xs">
                <span :class="['flex items-center gap-1', authClass(installation)]">
                  <ShieldAlert v-if="installation.authState !== 'ready'" class="size-3" />
                  {{ authLabel(installation) }}
                </span>
                <span
                  class="truncate font-mono text-muted-foreground"
                  :title="installation.source.configPath"
                >
                  {{ basename(installation.source.configPath) }}
                </span>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button
                v-if="!canUseDefaultSource"
                type="button"
                class="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                :disabled="busy"
                :title="t('mcp.actions.useAsSource')"
                :aria-label="t('mcp.actions.useAsSource')"
                @click="emit('sync', installation)"
              >
                <ArrowRightLeft class="size-4" />
              </button>
              <button
                v-if="canToggle(installation)"
                type="button"
                class="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                :disabled="busy"
                :title="
                  installation.enabled === false
                    ? t('mcp.actions.enable')
                    : t('mcp.actions.disable')
                "
                :aria-label="
                  installation.enabled === false
                    ? t('mcp.actions.enable')
                    : t('mcp.actions.disable')
                "
                @click="emit('toggle', installation.id, installation.enabled === false)"
              >
                <Power v-if="installation.enabled === false" class="size-4" />
                <PowerOff v-else class="size-4" />
              </button>
              <button
                v-if="!installation.source.readOnly"
                type="button"
                class="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                :disabled="busy"
                :title="t('mcp.actions.remove')"
                :aria-label="t('mcp.actions.remove')"
                @click="emit('remove', [installation.id])"
              >
                <Trash2 class="size-4" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
