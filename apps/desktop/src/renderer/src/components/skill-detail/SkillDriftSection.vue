<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { TriangleAlert } from '@lucide/vue'
import type { Installation } from '@skillbuddy/core'
import DiffView from '@/components/DiffView.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { agentLabel } from '@/lib/agents'
import { pathBasename } from '@/lib/paths'

const props = defineProps<{
  installations: Installation[]
  baseInstallation: Installation | null
  driftOthers: Installation[]
  writableDriftOthers: Installation[]
  busy: boolean
}>()
const emit = defineEmits<{
  selectBase: [path: string]
  sync: []
}>()

const { t } = useI18n()

function installationProjectName(installation: Installation): string {
  return installation.projectRoot ? pathBasename(installation.projectRoot) : ''
}

function originLabel(installation: Installation): string {
  let label: string
  switch (installation.origin) {
    case 'legacy':
      label = t('detail.originLegacy')
      break
    case 'admin':
      label = t('detail.originAdmin')
      break
    case 'system':
      label = t('detail.originSystem')
      break
    case 'plugin':
      label = t('detail.originPlugin')
      break
    case 'project':
      label = t('detail.scopeProject')
      break
    default:
      label = t('detail.scopeUser')
  }
  const projectName = installationProjectName(installation)
  return installation.scope === 'project' && projectName ? `${label} · ${projectName}` : label
}

function installationLocationLabel(installation: Installation): string {
  const scopeLabel =
    installation.scope === 'project'
      ? t('detail.projectScope', { root: installationProjectName(installation) })
      : t('detail.userScope')
  return `${agentLabel(installation.agent)} · ${scopeLabel}`
}
</script>

<template>
  <section>
    <h3
      class="mb-2 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
    >
      <TriangleAlert class="size-3.5" />
      {{ t('detail.drift') }}
    </h3>
    <p class="mb-3 text-sm text-muted-foreground">{{ t('detail.driftHint') }}</p>
    <div class="mb-3 flex flex-wrap gap-2">
      <button
        v-for="installation in props.installations"
        :key="installation.path"
        type="button"
        :class="[
          'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
          props.baseInstallation?.path === installation.path
            ? 'border-foreground bg-foreground text-background'
            : 'hover:border-foreground/40',
        ]"
        @click="emit('selectBase', installation.path)"
      >
        <PlatformIcon :id="installation.agent" :size="14" />
        {{ agentLabel(installation.agent) }}
        <Badge
          variant="outline"
          :class="
            props.baseInstallation?.path === installation.path
              ? 'border-background/40 text-background'
              : ''
          "
        >
          {{ originLabel(installation) }}
        </Badge>
      </button>
    </div>
    <div v-for="other in props.driftOthers" :key="other.path" class="mb-3">
      <p class="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <span>{{ t('detail.diffWith', { agent: installationLocationLabel(other) }) }}</span>
        <Badge v-if="other.readOnly" variant="secondary">
          {{ t('card.readOnly') }}
        </Badge>
      </p>
      <DiffView :base="other.skill.content" :other="props.baseInstallation?.skill.content ?? ''" />
    </div>
    <div v-if="props.writableDriftOthers.length > 0" class="mb-3">
      <p class="mb-2 text-sm font-medium">{{ t('detail.syncTargets') }}</p>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="target in props.writableDriftOthers"
          :key="target.path"
          class="flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-sm"
          :title="target.path"
        >
          <PlatformIcon :id="target.agent" :size="14" />
          <span class="truncate">{{ installationLocationLabel(target) }}</span>
        </span>
      </div>
    </div>
    <Button
      size="sm"
      class="cursor-pointer"
      :disabled="props.busy || props.writableDriftOthers.length === 0"
      @click="emit('sync')"
    >
      {{
        props.busy
          ? t('detail.syncing')
          : t('detail.syncToOthers', { n: props.writableDriftOthers.length })
      }}
    </Button>
  </section>
</template>
