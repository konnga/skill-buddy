<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Ellipsis, Pencil, Trash2, TriangleAlert } from '@lucide/vue'
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

const props = defineProps<{ skill: AggregatedSkill; busy?: boolean; currentPlatform?: string }>()
const emit = defineEmits<{
  open: []
  edit: []
  toggleEnabled: []
  uninstallCurrent: []
  uninstallAll: []
}>()
const { t } = useI18n()

const agents = computed(() => [...new Set(props.skill.installations.map((i) => i.agent))])
const hasProject = computed(() => props.skill.installations.some((i) => i.scope === 'project'))
const readOnly = computed(() => props.skill.installations.every((i) => i.readOnly))
const visibleInstallations = computed(() =>
  props.currentPlatform
    ? props.skill.installations.filter((installation) => installation.agent === props.currentPlatform)
    : props.skill.installations,
)
const visibleWritableInstallations = computed(() =>
  visibleInstallations.value.filter((installation) => !installation.readOnly),
)
const visibleDisabledCount = computed(
  () =>
    visibleWritableInstallations.value.filter((installation) => installation.enabled === false)
      .length,
)
const visibleAllDisabled = computed(
  () =>
    visibleWritableInstallations.value.length > 0 &&
    visibleDisabledCount.value === visibleWritableInstallations.value.length,
)
const visibleHasEnabled = computed(() =>
  visibleWritableInstallations.value.some((installation) => installation.enabled !== false),
)
const currentPlatformReadOnly = computed(
  () =>
    !props.currentPlatform ||
    !props.skill.installations.some(
      (installation) => installation.agent === props.currentPlatform && !installation.readOnly,
    ),
)
const hasOtherWritablePlatform = computed(
  () =>
    Boolean(props.currentPlatform) &&
    props.skill.installations.some(
      (installation) => installation.agent !== props.currentPlatform && !installation.readOnly,
    ),
)
</script>

<template>
  <Card
    :class="[
      'group cursor-pointer transition-colors hover:border-foreground/25',
      visibleAllDisabled && 'opacity-60 saturate-75',
      visibleDisabledCount > 0 && !visibleAllDisabled && 'border-amber-500/20 bg-muted/20',
    ]"
    @click="$emit('open')"
  >
    <CardHeader class="pb-3">
      <div class="flex items-start justify-between gap-2">
        <span class="flex min-w-0 items-center gap-1.5">
          <CardTitle class="select-text truncate text-base">{{ skill.name }}</CardTitle>
          <CopyButton
            :text="skill.name"
            class="opacity-0 transition-opacity group-hover:opacity-100"
          />
        </span>
        <span class="flex shrink-0 items-center gap-1.5">
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
          <Badge v-if="hasProject" variant="secondary">project</Badge>
          <Badge
            v-if="skill.hasDrift"
            variant="outline"
            class="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
          >
            <TriangleAlert class="size-3" />
            {{ t('card.drift') }}
          </Badge>
          <button
            v-if="visibleWritableInstallations.length > 0"
            type="button"
            role="switch"
            :aria-checked="visibleHasEnabled"
            :aria-label="
              t(
                currentPlatform
                  ? visibleHasEnabled
                    ? 'card.disableScope'
                    : 'card.enableScope'
                  : visibleHasEnabled
                    ? 'card.disableGlobal'
                    : 'card.enableGlobal',
                currentPlatform ? { platform: agentLabel(currentPlatform) } : {},
              )
            "
            :title="
              t(
                currentPlatform
                  ? visibleHasEnabled
                    ? 'card.disableScope'
                    : 'card.enableScope'
                  : visibleHasEnabled
                    ? 'card.disableGlobal'
                    : 'card.enableGlobal',
                currentPlatform ? { platform: agentLabel(currentPlatform) } : {},
              )
            "
            :disabled="busy"
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-50"
            :class="
              visibleHasEnabled
                ? 'bg-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                : 'bg-muted-foreground/25'
            "
            @click.stop="emit('toggleEnabled')"
          >
            <span
              class="size-3.5 rounded-full bg-white shadow-sm transition-transform"
              :class="visibleHasEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'"
            />
          </button>
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
                <DropdownMenuSeparator class="my-1 h-px bg-border" />
                <DropdownMenuItem
                  v-if="currentPlatform"
                  :disabled="currentPlatformReadOnly || busy"
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-destructive/10"
                  @select="emit('uninstallCurrent')"
                >
                  <Trash2 class="size-4" />
                  {{ t('card.uninstallCurrent', { platform: agentLabel(currentPlatform) }) }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="!currentPlatform || hasOtherWritablePlatform"
                  :disabled="readOnly || busy"
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-destructive/10"
                  @select="emit('uninstallAll')"
                >
                  <Trash2 class="size-4" />
                  {{ t('card.uninstallAll') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </span>
      </div>
      <CardDescription class="line-clamp-2 min-h-10">
        {{ skill.description || t('card.noDescription') }}
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span
        v-for="agent in agents"
        :key="agent"
        class="flex items-center gap-1.5 text-sm text-muted-foreground"
        :title="agentLabel(agent)"
      >
        <PlatformIcon :id="agent" :size="14" />
        {{ agentLabel(agent) }}
      </span>
      <span v-if="skill.tags.length" class="text-border">·</span>
      <Badge v-for="tag in skill.tags" :key="tag" variant="outline" class="text-[11px]">
        {{ tag }}
      </Badge>
    </CardContent>
  </Card>
</template>
