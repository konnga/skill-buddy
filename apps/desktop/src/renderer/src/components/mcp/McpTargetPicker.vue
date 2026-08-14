<script setup lang="ts">
import { computed, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown } from '@lucide/vue'
import type { McpPlatformStatus, McpTarget } from '@skillbuddy/core'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  platforms: McpPlatformStatus[]
  projectRoots: string[]
  /** 禁用不可选的目标（如同步源自身）。 */
  excluded?: McpTarget[]
  /** 自定义禁用目标的提示文案，默认「已安装」。 */
  excludedLabel?: string
  /** 已安装但仍可选的目标（选中表示覆盖写入），仅展示提示。 */
  installed?: McpTarget[]
}>()
const model = defineModel<McpTarget[]>({ default: () => [] })
const { t } = useI18n()
const componentId = useId()

interface TargetOption {
  key: string
  target: McpTarget
  scopeLabel: string
  title: string
  excluded: boolean
  installed: boolean
}

interface TargetGroup {
  key: string
  panelId: string
  platform: McpPlatformStatus
  options: TargetOption[]
  projectOptions: TargetOption[]
}

function targetKey(target: McpTarget): string {
  return [target.agent, target.surface, target.scope, target.projectRoot ?? ''].join(':')
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

const excludedKeys = computed(
  () => new Set((props.excluded ?? []).map((target) => targetKey(target))),
)

const installedKeys = computed(
  () => new Set((props.installed ?? []).map((target) => targetKey(target))),
)

function checked(option: TargetOption): boolean {
  return model.value.some((target) => targetKey(target) === option.key)
}

function toggle(option: TargetOption): void {
  if (option.excluded) return
  model.value = checked(option)
    ? model.value.filter((target) => targetKey(target) !== option.key)
    : [...model.value, option.target]
}

const groups = computed<TargetGroup[]>(() =>
  props.platforms
    .filter((platform) => platform.capabilities.management === 'read-write')
    .map((platform, index) => {
      const options = platform.capabilities.scopes.flatMap((scope) => {
        const roots = scope === 'user' ? [undefined] : props.projectRoots
        return roots.map((projectRoot) => {
          const target: McpTarget = {
            agent: platform.agent,
            surface: platform.surface,
            scope,
            ...(projectRoot ? { projectRoot } : {}),
          }
          const key = targetKey(target)
          return {
            key,
            target,
            scopeLabel:
              scope === 'user'
                ? t('mcp.target.global')
                : scope === 'local'
                  ? t('mcp.target.local')
                  : t('mcp.target.project'),
            title: scope === 'user' ? t('mcp.target.global') : basename(projectRoot ?? ''),
            excluded: excludedKeys.value.has(key),
            installed: installedKeys.value.has(key),
          }
        })
      })
      const key = `${platform.agent}:${platform.surface}`
      const globalOptions = options.filter((option) => option.target.scope === 'user')
      const projectOptions = options.filter((option) => option.target.scope !== 'user')
      return {
        key,
        panelId: `${componentId}-target-group-${index}`,
        platform,
        options: [...globalOptions, ...projectOptions],
        projectOptions,
      }
    })
    .filter((group) => group.options.length > 0),
)

const expandedKeys = shallowRef(new Set<string>())
let expandedInitialized = false

watch(
  groups,
  (value) => {
    if (expandedInitialized || value.length === 0) return
    expandedInitialized = true
    const selectedGroups = value
      .filter((group) => group.options.some((option) => checked(option)))
      .map((group) => group.key)
    expandedKeys.value = new Set(selectedGroups)
  },
  { immediate: true },
)

function toggleGroup(group: TargetGroup): void {
  const next = new Set(expandedKeys.value)
  if (next.has(group.key)) next.delete(group.key)
  else next.add(group.key)
  expandedKeys.value = next
}

function selectedCount(group: TargetGroup): number {
  return group.options.filter(checked).length
}
</script>

<template>
  <div class="max-h-72 overflow-y-auto rounded-md border">
    <section v-for="group in groups" :key="group.key" class="border-b last:border-b-0">
      <button
        type="button"
        class="flex h-11 w-full cursor-pointer items-center gap-2.5 bg-muted/25 px-3 text-left transition-colors hover:bg-muted/50"
        :aria-expanded="expandedKeys.has(group.key)"
        :aria-controls="group.panelId"
        @click="toggleGroup(group)"
      >
        <PlatformIcon :id="group.platform.agent" :size="18" />
        <span class="min-w-0 flex-1 truncate text-sm font-semibold">
          {{ group.platform.displayName }}
        </span>
        <Badge variant="secondary" class="shrink-0 px-2 py-0 text-xs font-normal">
          {{ group.platform.surface }}
        </Badge>
        <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
          {{ selectedCount(group) }}/{{ group.options.length }}
        </span>
        <ChevronDown
          :class="[
            'size-4 shrink-0 text-muted-foreground transition-transform',
            expandedKeys.has(group.key) && 'rotate-180',
          ]"
        />
      </button>

      <div v-show="expandedKeys.has(group.key)" :id="group.panelId">
        <template v-for="option in group.options" :key="option.key">
          <div
            v-if="option === group.projectOptions[0]"
            class="border-t bg-muted/10 px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            {{ t('mcp.target.project') }}
          </div>
          <label
            :class="[
              'flex min-h-11 items-center gap-3 border-t px-3 py-2',
              option.excluded
                ? 'cursor-not-allowed opacity-45'
                : 'cursor-pointer hover:bg-muted/35',
            ]"
          >
            <input
              type="checkbox"
              class="size-4 accent-foreground"
              :checked="checked(option)"
              :disabled="option.excluded"
              @change="toggle(option)"
            />
            <span class="min-w-0 flex-1">
              <span
                class="block truncate text-sm font-medium"
                :title="option.target.projectRoot ?? option.title"
              >
                {{ option.title }}
              </span>
              <span
                v-if="option.target.scope !== 'user'"
                class="block text-xs text-muted-foreground"
              >
                {{ option.scopeLabel }}
              </span>
            </span>
            <span v-if="option.excluded" class="shrink-0 text-xs text-muted-foreground">
              {{ excludedLabel ?? t('mcp.target.installed') }}
            </span>
            <span v-else-if="option.installed" class="shrink-0 text-xs text-muted-foreground">
              {{ t('mcp.target.installed') }}
            </span>
          </label>
        </template>
      </div>
    </section>
  </div>
</template>
