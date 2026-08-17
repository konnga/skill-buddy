<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Copy, Ellipsis, Pencil, Power, PowerOff, Trash2 } from '@lucide/vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TempApplication } from '@/composables/useSettings'
import type { GroupRuntimeState } from '@/lib/group-runtime'

const props = defineProps<{
  state: GroupRuntimeState
  temp?: TempApplication
  busy?: boolean
}>()

const emit = defineEmits<{
  open: []
  enable: []
  disable: []
  export: []
  rename: []
  delete: []
  endTemp: []
}>()

const { t } = useI18n()

const statusVariant = computed(() => {
  if (props.state.status === 'enabled') return 'success' as const
  if (props.state.status === 'partial') return 'default' as const
  return 'secondary' as const
})
const cannotManage = computed(
  () => props.busy || props.state.manageableInstallations === 0,
)
const shouldEnable = computed(() => props.state.status !== 'enabled')
</script>

<template>
  <Card
    class="group flex h-full cursor-pointer flex-col transition-colors hover:border-foreground/25"
    @click="emit('open')"
  >
    <CardHeader class="gap-2 pb-3">
      <div class="flex items-start justify-between gap-2">
        <CardTitle class="min-w-0 flex-1 truncate text-base leading-6" :title="state.name">
          {{ state.name }}
        </CardTitle>
        <span class="flex shrink-0 items-center gap-1">
          <Badge :variant="statusVariant" class="text-xs">
            {{ t(`groups.status.${state.status}`) }}
          </Badge>
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                :aria-label="t('groups.actions')"
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
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  @select="emit('export')"
                >
                  <Copy class="size-4" />
                  {{ t('groups.exportAction') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  @select="emit('rename')"
                >
                  <Pencil class="size-4" />
                  {{ t('groups.renameTitle') }}
                </DropdownMenuItem>
                <DropdownMenuSeparator class="my-1 h-px bg-border" />
                <DropdownMenuItem
                  :disabled="busy"
                  class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-destructive/10"
                  @select="emit('delete')"
                >
                  <Trash2 class="size-4" />
                  {{ t('groups.deleteTitle') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </span>
      </div>
      <CardDescription class="min-h-5 text-sm">
        {{
          t('groups.runtimeProgress', {
            installed: state.installedSkills,
            total: state.totalSkills,
            enabled: state.enabledInstallations,
            disabled: state.disabledInstallations,
          })
        }}
      </CardDescription>
      <p
        v-if="state.missingSkills.length > 0"
        class="truncate text-xs text-amber-600 dark:text-amber-400"
        :title="state.missingSkills.join(', ')"
      >
        {{ t('groups.missing', { names: state.missingSkills.join(', ') }) }}
      </p>
      <div
        v-if="temp"
        class="flex items-center justify-between gap-2 rounded-md bg-primary/5 px-2.5 py-1.5 text-xs text-primary"
      >
        <span class="truncate">{{ t('groups.tempActive', { n: temp.installed.length }) }}</span>
        <button
          type="button"
          class="shrink-0 cursor-pointer font-medium underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click.stop="emit('endTemp')"
        >
          {{ t('groups.endTemp') }}
        </button>
      </div>
    </CardHeader>
    <CardContent class="mt-auto flex items-center justify-between gap-2">
      <span class="text-sm text-muted-foreground">
        {{ t('groups.skillCount', { n: state.totalSkills }) }}
      </span>
      <span class="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          class="cursor-pointer"
          :disabled="cannotManage"
          @click.stop="shouldEnable ? emit('enable') : emit('disable')"
        >
          <Power v-if="shouldEnable" class="size-3.5" />
          <PowerOff v-else class="size-3.5" />
          {{ t(shouldEnable ? 'groups.enableGroup' : 'groups.disableGroup') }}
        </Button>
      </span>
    </CardContent>
  </Card>
</template>
