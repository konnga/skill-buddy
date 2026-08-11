<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { McpPlatformStatus, McpTarget } from '@skillbuddy/core'
import PlatformIcon from '@/components/PlatformIcon.vue'

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

interface TargetOption {
  key: string
  target: McpTarget
  platform: McpPlatformStatus
  scopeLabel: string
  excluded: boolean
  installed: boolean
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

const options = computed<TargetOption[]>(() =>
  props.platforms.filter((platform) => platform.capabilities.management === 'read-write').flatMap((platform) =>
    platform.capabilities.scopes.flatMap((scope) => {
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
          platform,
          scopeLabel:
            scope === 'user'
              ? t('mcp.target.global')
              : `${scope === 'local' ? t('mcp.target.local') : t('mcp.target.project')} · ${basename(projectRoot ?? '')}`,
          excluded: excludedKeys.value.has(key),
          installed: installedKeys.value.has(key),
        }
      })
    }),
  ),
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
</script>

<template>
  <div class="max-h-72 overflow-y-auto rounded-md border">
    <label
      v-for="option in options"
      :key="option.key"
      :class="[
        'flex min-h-11 items-center gap-3 border-b px-3 py-2 last:border-b-0',
        option.excluded ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:bg-muted/50',
      ]"
    >
      <input
        type="checkbox"
        class="size-4 accent-foreground"
        :checked="checked(option)"
        :disabled="option.excluded"
        @change="toggle(option)"
      />
      <PlatformIcon :id="option.platform.agent" :size="17" />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium">{{ option.platform.displayName }}</span>
        <span class="block truncate text-xs text-muted-foreground">
          {{ option.platform.surface }} · {{ option.scopeLabel }}
        </span>
      </span>
      <span v-if="option.excluded" class="text-xs text-muted-foreground">
        {{ excludedLabel ?? t('mcp.target.installed') }}
      </span>
      <span v-else-if="option.installed" class="text-xs text-muted-foreground">
        {{ t('mcp.target.installed') }}
      </span>
    </label>
  </div>
</template>
