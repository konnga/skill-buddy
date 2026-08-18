<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CloudDownload } from '@lucide/vue'
import type { McpPlatformStatus, McpTarget } from '@skillbuddy/core'
import McpTargetPicker from '@/components/mcp/McpTargetPicker.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { McpMarketDetailMeta } from '@/composables/useMcpMarketDetail'
import type { McpMarketCandidate } from '@/lib/mcp-market'

const props = defineProps<{
  detailMeta: McpMarketDetailMeta | null
  candidates: McpMarketCandidate[]
  candidateError: string | null
  selectedCandidate: number
  targets: McpTarget[]
  localNames: Set<string>
  existingNames: string[]
  platforms: McpPlatformStatus[]
  projectRoots: string[]
  planning: boolean
  installOnly: boolean
  teamLibraryMode: boolean
}>()
const emit = defineEmits<{
  'update:selectedCandidate': [value: number]
  'update:targets': [value: McpTarget[]]
  openPage: [url: string]
  review: []
}>()

const { t } = useI18n()
const currentCandidate = computed(
  () => props.candidates[props.selectedCandidate] ?? null,
)
const targetsModel = computed({
  get: () => props.targets,
  set: (value: McpTarget[]) => emit('update:targets', value),
})
</script>

<template>
  <section
    :class="[
      'flex flex-col gap-4',
      !props.installOnly && 'rounded-lg border p-5',
    ]"
  >
    <div v-if="props.detailMeta" class="flex flex-wrap items-center gap-2">
      <Badge v-if="props.detailMeta.hosted" variant="secondary">
        {{ t('mcp.market.hosted') }}
      </Badge>
      <Badge v-if="props.detailMeta.verified" variant="success">
        {{ t('mcp.market.verified') }}
      </Badge>
      <button
        v-if="props.detailMeta.sourceUrl"
        type="button"
        class="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
        @click="emit('openPage', props.detailMeta.sourceUrl)"
      >
        {{ t('market.viewSource') }}
      </button>
    </div>

    <p v-if="props.candidates.length === 0" class="text-sm text-muted-foreground">
      {{
        props.candidateError
          ? t('mcp.market.invalidConfig', { msg: props.candidateError })
          : t('mcp.market.noConfig')
      }}
    </p>
    <template v-else>
      <div v-if="props.candidates.length > 1" class="flex flex-col gap-2">
        <span class="text-sm font-medium">{{ t('mcp.market.configPick') }}</span>
        <button
          v-for="(candidate, index) in props.candidates"
          :key="candidate.serverName + candidate.label"
          type="button"
          :class="[
            'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left text-sm',
            index === props.selectedCandidate
              ? 'border-foreground/40 bg-muted/40'
              : 'text-muted-foreground hover:bg-accent/60',
          ]"
          @click="emit('update:selectedCandidate', index)"
        >
          <span class="shrink-0 font-medium">{{ candidate.serverName }}</span>
          <code class="truncate text-xs">{{ candidate.label }}</code>
          <Badge
            v-if="props.localNames.has(candidate.serverName)"
            variant="success"
            class="ml-auto"
          >
            {{ t('mcp.market.installed') }}
          </Badge>
          <Badge
            v-if="props.existingNames.includes(candidate.serverName)"
            variant="secondary"
            :class="!props.localNames.has(candidate.serverName) && 'ml-auto'"
          >
            已在团队库
          </Badge>
        </button>
      </div>
      <div v-else-if="currentCandidate" class="flex items-center gap-2 text-sm">
        <span class="font-medium">{{ currentCandidate.serverName }}</span>
        <code class="truncate text-xs text-muted-foreground">
          {{ currentCandidate.label }}
        </code>
      </div>

      <div
        v-if="currentCandidate?.definition.requiredSecrets.length"
        class="flex flex-col gap-1.5"
      >
        <span class="text-xs text-muted-foreground">{{ t('mcp.market.secretsHint') }}</span>
        <div class="flex flex-wrap gap-1.5">
          <Badge
            v-for="secret in currentCandidate.definition.requiredSecrets"
            :key="secret"
            variant="outline"
          >
            {{ secret }}
          </Badge>
        </div>
      </div>
      <div v-if="!props.teamLibraryMode" class="flex flex-col gap-2">
        <span class="text-sm font-medium">{{ t('mcp.form.targets') }}</span>
        <McpTargetPicker
          v-model="targetsModel"
          :platforms="props.platforms"
          :project-roots="props.projectRoots"
        />
      </div>
      <Button
        v-if="!props.installOnly && !props.teamLibraryMode"
        size="sm"
        class="w-fit cursor-pointer"
        :disabled="props.planning || props.targets.length === 0 || !currentCandidate"
        @click="emit('review')"
      >
        <CloudDownload />
        {{ t('mcp.form.review') }}
      </Button>
    </template>
  </section>
</template>
