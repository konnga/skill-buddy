<script setup lang="ts">
import { computed, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, FolderGit2, Globe2, ListChecks } from '@lucide/vue'
import type { PlatformStatus } from '@skillbuddy/core'
import type { InstallTarget } from '#shared/ipc'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { pathBasename } from '@/lib/paths'

const props = defineProps<{
  label?: string
  /** 在标题右侧显示批量选择快捷操作。 */
  quickActions?: boolean
  /** 禁用不可选的目标（如导入来源自身）。 */
  excluded?: InstallTarget[]
  /** 自定义禁用目标的提示文案，默认「已安装」。 */
  excludedLabel?: string
  /** 已安装但仍可选的目标，仅展示提示。 */
  installed?: InstallTarget[]
}>()
const model = defineModel<InstallTarget[]>({ default: () => [] })

const { detectedPlatforms } = useSkills()
const { projectRoots } = useSettings()
const { t } = useI18n()
const componentId = useId()

interface TargetOption {
  key: string
  target: InstallTarget
  title: string
  excluded: boolean
  installed: boolean
}

interface TargetGroup {
  key: string
  panelId: string
  platform: PlatformStatus
  surface: string
  options: TargetOption[]
  projectOptions: TargetOption[]
}

const platformSurfaces: Record<string, string> = {
  'claude-code': 'cli',
  codex: 'cli',
  copilot: 'editor',
  cursor: 'editor',
  'gemini-cli': 'cli',
  'google-antigravity': 'ide',
  'qwen-code': 'cli',
  opencode: 'cli',
  pi: 'cli',
  omp: 'cli',
  trae: 'editor',
  'trae-cn': 'editor',
  codebuddy: 'cli',
  workbuddy: 'desktop',
  doubao: 'desktop',
  kimi: 'cli',
  zcode: 'editor',
  'wps-lingxi': 'desktop',
  // dsh 是 profile 启动器，web 与桌面端是同一份 `~/.dsh` 的两个界面。
  'deepseek-harness': 'web/desktop',
}

function targetKey(target: InstallTarget): string {
  return [target.agent, target.scope, target.projectRoot ?? ''].join(':')
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
  detectedPlatforms.value.map((platform, index) => {
    const targets: InstallTarget[] = [
      { agent: platform.id, scope: 'user' },
      ...(platform.hasProjectScope
        ? projectRoots.value.map((projectRoot): InstallTarget => ({
            agent: platform.id,
            scope: 'project',
            projectRoot,
          }))
        : []),
    ]
    const options: TargetOption[] = targets.map((target) => {
      const key = targetKey(target)
      return {
        key,
        target,
        title:
          target.scope === 'user'
            ? t('detail.userScope')
            : pathBasename(target.projectRoot ?? ''),
        excluded: excludedKeys.value.has(key),
        installed: installedKeys.value.has(key),
      }
    })
    const projectOptions = options.filter((option) => option.target.scope === 'project')
    return {
      key: platform.id,
      panelId: `${componentId}-skill-target-group-${index}`,
      platform,
      surface: platformSurfaces[platform.id] ?? 'custom',
      options,
      projectOptions,
    }
  }),
)

const expandedKeys = shallowRef(new Set<string>())
let expandedInitialized = false

watch(
  groups,
  (value) => {
    if (expandedInitialized || value.length === 0) return
    expandedInitialized = true
    expandedKeys.value = new Set(
      value
        .filter((group) => group.options.some((option) => checked(option)))
        .map((group) => group.key),
    )
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

const selectableOptions = computed(() =>
  groups.value.flatMap((group) => group.options).filter((option) => !option.excluded),
)

const globalOptions = computed(() =>
  selectableOptions.value.filter((option) => option.target.scope === 'user'),
)
const projectOptions = computed(() =>
  selectableOptions.value.filter((option) => option.target.scope === 'project'),
)

function areOptionsSelected(options: TargetOption[]): boolean {
  return options.length > 0 && options.every((option) => checked(option))
}

const allTargetsSelected = computed(() => areOptionsSelected(selectableOptions.value))
const globalTargetsSelected = computed(() => areOptionsSelected(globalOptions.value))
const projectTargetsSelected = computed(() => areOptionsSelected(projectOptions.value))

function toggleOptions(options: TargetOption[]): void {
  if (options.length === 0) return

  const optionKeys = new Set(options.map((option) => option.key))
  if (areOptionsSelected(options)) {
    model.value = model.value.filter((target) => !optionKeys.has(targetKey(target)))
    return
  }

  const selectedKeys = new Set(model.value.map((target) => targetKey(target)))
  model.value = [
    ...model.value,
    ...options
      .filter((option) => !selectedKeys.has(option.key))
      .map((option) => option.target),
  ]
}

function toggleAllTargets(): void {
  toggleOptions(selectableOptions.value)
}

function toggleGlobalTargets(): void {
  toggleOptions(globalOptions.value)
}

function toggleProjectTargets(): void {
  toggleOptions(projectOptions.value)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="label" class="flex items-center justify-between gap-3">
      <span class="text-sm font-medium">{{ label }}</span>
      <div v-if="props.quickActions" class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          :class="[
            'inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
            allTargetsSelected && 'bg-accent text-foreground',
          ]"
          :title="t('detail.selectAllTargets')"
          :aria-pressed="allTargetsSelected"
          :disabled="selectableOptions.length === 0"
          @click="toggleAllTargets"
        >
          <ListChecks class="size-3.5" aria-hidden="true" />
          {{ t('detail.selectAllTargets') }}
        </button>
        <button
          type="button"
          :class="[
            'inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
            globalTargetsSelected && 'bg-accent text-foreground',
          ]"
          :title="t('detail.selectGlobalTargets')"
          :aria-pressed="globalTargetsSelected"
          :disabled="globalOptions.length === 0"
          @click="toggleGlobalTargets"
        >
          <Globe2 class="size-3.5" aria-hidden="true" />
          {{ t('detail.selectGlobalTargets') }}
        </button>
        <button
          type="button"
          :class="[
            'inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
            projectTargetsSelected && 'bg-accent text-foreground',
          ]"
          :title="t('detail.selectProjectTargets')"
          :aria-pressed="projectTargetsSelected"
          :disabled="projectOptions.length === 0"
          @click="toggleProjectTargets"
        >
          <FolderGit2 class="size-3.5" aria-hidden="true" />
          {{ t('detail.selectProjectTargets') }}
        </button>
      </div>
    </div>
    <ScrollArea class="max-h-72 rounded-md border" viewport-class="max-h-72 pr-2">
      <section
        v-for="group in groups"
        :key="group.key"
        class="border-b last:border-b-0"
      >
        <button
          type="button"
          :class="[
            'flex h-11 w-full cursor-pointer items-center gap-2.5 px-3 text-left transition-colors hover:bg-muted/50',
            expandedKeys.has(group.key) ? 'border-b bg-muted/45' : 'bg-muted/25',
          ]"
          :aria-expanded="expandedKeys.has(group.key)"
          :aria-controls="group.panelId"
          @click="toggleGroup(group)"
        >
          <PlatformIcon :id="group.platform.id" :size="18" />
          <span class="min-w-0 flex-1 truncate text-sm font-semibold">
            {{ group.platform.displayName }}
          </span>
          <Badge variant="secondary" class="shrink-0 px-2 py-0 text-xs font-normal">
            {{ group.surface }}
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

        <div
          v-show="expandedKeys.has(group.key)"
          :id="group.panelId"
          class="relative ml-4 border-l-1 border-muted-foreground/15 bg-muted/[0.06]"
        >
          <template v-for="(option, optionIndex) in group.options" :key="option.key">
            <div
              v-if="option === group.projectOptions[0]"
              class="border-t bg-muted/20 px-4 py-1.5 text-xs font-medium text-muted-foreground"
            >
              {{ t('mcp.target.project') }}
            </div>
            <label
              :class="[
                'flex min-h-11 items-center gap-3 px-4 py-2',
                !(expandedKeys.has(group.key) && optionIndex === 0) && 'border-t',
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
                  v-if="option.target.scope === 'project'"
                  class="block text-xs text-muted-foreground"
                >
                  {{ t('mcp.target.project') }}
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
    </ScrollArea>
  </div>
</template>
