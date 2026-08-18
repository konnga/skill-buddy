<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Ellipsis, Pencil, Power, PowerOff, Trash2, TriangleAlert } from '@lucide/vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import type { AggregatedSkill } from '@skillbuddy/core'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import CopyButton from '@/components/CopyButton.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { agentLabel } from '@/lib/agents'
import {
  deriveSkillInstallationStatus,
  matchesSkillInstallation,
} from '@/lib/skill-installations'

const props = defineProps<{
  skill: AggregatedSkill
  busy?: boolean
  batchMode?: boolean
  groupContext?: boolean
  selected?: boolean
  currentPlatform?: string
  scopeFilter?: 'user' | 'project'
  projectRoot?: string
  ownershipFilter?: 'managed' | 'agent'
}>()
const emit = defineEmits<{
  open: []
  edit: []
  toggleSelected: []
  toggleEnabled: []
  removeFromGroup: []
  uninstallCurrent: []
  uninstallAll: []
}>()
const { t } = useI18n()

const visibleInstallations = computed(() => {
  if (props.scopeFilter === 'project' && !props.projectRoot) return []
  const projectFilter =
    props.scopeFilter === 'user'
      ? 'user'
      : props.scopeFilter === 'project'
        ? props.projectRoot
        : null
  return props.skill.installations.filter((installation) =>
    matchesSkillInstallation(installation, {
      platformId: props.currentPlatform,
      projectFilter,
      ownershipFilter: props.ownershipFilter,
    }),
  )
})
const agents = computed(() => [...new Set(visibleInstallations.value.map((i) => i.agent))])
const hasProject = computed(() => visibleInstallations.value.some((i) => i.scope === 'project'))
const installationStatus = computed(() =>
  deriveSkillInstallationStatus(visibleInstallations.value),
)
const readOnly = computed(() => installationStatus.value.readOnly)
const visibleWritableInstallations = computed(() => installationStatus.value.writable)
const visibleDisabledCount = computed(() => installationStatus.value.disabledCount)
const visibleAllDisabled = computed(() => installationStatus.value.allDisabled)
const visibleHasEnabled = computed(() => installationStatus.value.hasEnabled)
const toggleLabel = computed(() => {
  if (props.scopeFilter && props.currentPlatform) {
    return t(visibleHasEnabled.value ? 'card.disableScopeAgent' : 'card.enableScopeAgent', {
      platform: agentLabel(props.currentPlatform),
    })
  }
  if (props.scopeFilter) {
    return t(visibleHasEnabled.value ? 'card.disableScope' : 'card.enableScope')
  }
  if (props.currentPlatform) {
    return t(visibleHasEnabled.value ? 'card.disableAgent' : 'card.enableAgent', {
      platform: agentLabel(props.currentPlatform),
    })
  }
  return t(visibleHasEnabled.value ? 'card.disableGlobal' : 'card.enableGlobal')
})
const currentPlatformReadOnly = computed(
  () =>
    !props.currentPlatform ||
    !visibleWritableInstallations.value.some(
      (installation) => installation.agent === props.currentPlatform,
    ),
)
const hasOtherWritablePlatform = computed(
  () =>
    Boolean(props.currentPlatform) &&
    visibleWritableInstallations.value.some(
      (installation) => installation.agent !== props.currentPlatform && !installation.readOnly,
    ),
)
const uninstallAllLabel = computed(() =>
  props.scopeFilter ? t('card.uninstallScope') : t('card.uninstallAll'),
)
const uninstallCurrentLabel = computed(() =>
  props.scopeFilter
    ? t('card.uninstallScopeAgent', { platform: agentLabel(props.currentPlatform ?? '') })
    : t('card.uninstallCurrent', { platform: agentLabel(props.currentPlatform ?? '') }),
)
</script>

<template>
  <Card
    :class="[
      'group flex h-full cursor-pointer flex-col transition-[background-color,border-color,box-shadow] hover:border-foreground/25 hover:shadow-sm',
      props.selected && 'border-primary/60 bg-primary/5 ring-1 ring-primary/20',
      visibleAllDisabled && 'opacity-60 saturate-75',
      visibleDisabledCount > 0 && !visibleAllDisabled && 'border-amber-500/20 bg-muted/20',
    ]"
    @click="props.batchMode ? emit('toggleSelected') : emit('open')"
  >
    <CardHeader class="gap-3 pb-3">
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 flex-1 items-start gap-2">
          <input
            v-if="props.batchMode"
            type="checkbox"
            :checked="props.selected"
            :aria-label="t('batch.selectSkill', { name: skill.name })"
            class="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
            @click.stop
            @change.stop="emit('toggleSelected')"
          />
          <CardTitle
            class="min-w-0 flex-1 truncate select-text text-base leading-6"
            :title="skill.name"
          >
            {{ skill.name }}
          </CardTitle>
        </div>
        <span class="flex shrink-0 items-center gap-1">
          <CopyButton
            :text="skill.name"
            class="opacity-0 transition-opacity group-hover:opacity-100"
          />
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                :aria-label="t('card.actions')"
                @click.stop
              >
                <Ellipsis class="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                align="end"
                :side-offset="6"
                class="z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none"
                @click.stop
              >
                <DropdownMenuItem
                  :disabled="readOnly || busy"
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  @select="emit('edit')"
                >
                  <Pencil class="size-4" />
                  {{ t('common.edit') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="visibleWritableInstallations.length > 0"
                  :disabled="busy"
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  @select="emit('toggleEnabled')"
                >
                  <PowerOff v-if="visibleHasEnabled" class="size-4" />
                  <Power v-else class="size-4" />
                  {{ toggleLabel }}
                </DropdownMenuItem>
                <DropdownMenuSeparator class="my-1 h-px bg-border" />
                <DropdownMenuItem
                  v-if="props.groupContext"
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
                  @select="emit('removeFromGroup')"
                >
                  <Trash2 class="size-4" />
                  {{ t('groups.removeSkill') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="!props.groupContext && currentPlatform"
                  :disabled="currentPlatformReadOnly || busy"
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-destructive/10"
                  @select="emit('uninstallCurrent')"
                >
                  <Trash2 class="size-4" />
                  {{ uninstallCurrentLabel }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="!props.groupContext && (!currentPlatform || hasOtherWritablePlatform)"
                  :disabled="readOnly || busy"
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-destructive/10"
                  @select="emit('uninstallAll')"
                >
                  <Trash2 class="size-4" />
                  {{ uninstallAllLabel }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </span>
      </div>
      <div class="flex min-h-5 items-center gap-2">
        <span class="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge v-if="readOnly" variant="secondary">
            {{ t('card.readOnly') }}
          </Badge>
          <Badge
            v-if="visibleAllDisabled"
            variant="secondary"
            class="text-amber-600 dark:text-amber-400"
          >
            {{ t('card.disabled') }}
          </Badge>
          <Badge
            v-else-if="visibleDisabledCount > 0"
            variant="secondary"
            class="text-amber-600 dark:text-amber-400"
          >
            {{ t('card.partiallyDisabled') }}
          </Badge>
          <Badge v-if="hasProject" variant="secondary">{{ t('card.scopeProject') }}</Badge>
          <Badge
            v-if="skill.hasDrift"
            variant="outline"
            class="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
          >
            <TriangleAlert class="size-3" />
            {{ t('card.drift') }}
          </Badge>
        </span>
      </div>
      <CardDescription class="line-clamp-2 min-h-10">
        {{ skill.description || t('card.noDescription') }}
      </CardDescription>
    </CardHeader>
    <CardContent class="mt-auto flex h-12 flex-wrap items-end gap-1.5">
      <span
        v-for="agent in agents"
        :key="agent"
        class="inline-flex"
        role="img"
        :title="agentLabel(agent)"
        :aria-label="agentLabel(agent)"
      >
        <PlatformIcon :id="agent" :size="14" />
      </span>
      <span v-if="agents.length && skill.tags.length" class="text-border">·</span>
      <Badge v-for="tag in skill.tags" :key="tag" variant="outline" class="text-[11px]">
        {{ tag }}
      </Badge>
    </CardContent>
  </Card>
</template>
