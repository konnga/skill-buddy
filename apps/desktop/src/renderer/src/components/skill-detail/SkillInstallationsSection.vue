<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { FolderOpen, LockKeyhole, Trash2 } from '@lucide/vue'
import type { Installation } from '@skillbuddy/core'
import CopyButton from '@/components/CopyButton.vue'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { agentLabel } from '@/lib/agents'

/** 安装位置列表只展示安装状态，并将文件操作意图交给详情页统一执行。 */
const props = defineProps<{
  installations: Installation[]
  busy: boolean
}>()

const emit = defineEmits<{
  reveal: [path: string]
  remove: [path: string]
  toggle: [installation: Installation]
}>()

const { t } = useI18n()

function installationEnabled(installation: Installation): boolean {
  return installation.enabled !== false
}

function pathBaseName(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '')
  return normalized.split('/').pop() ?? normalized
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
  const projectName = installation.projectRoot ? pathBaseName(installation.projectRoot) : ''
  return installation.scope === 'project' && projectName
    ? `${label} · ${projectName}`
    : label
}
</script>

<template>
  <section class="mb-8">
    <h3 class="mb-2 text-sm font-medium">
      {{ t('detail.installedLocations') }}
    </h3>
    <ul class="flex flex-col gap-2">
      <li
        v-for="installation in props.installations"
        :key="installation.path"
        class="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
      >
        <div class="flex min-w-0 items-center gap-2">
          <PlatformIcon :id="installation.agent" :size="15" />
          <span class="shrink-0 text-sm">{{ agentLabel(installation.agent) }}</span>
          <Badge
            variant="secondary"
            class="max-w-48 shrink-0 rounded-md px-2 py-0.5 font-normal"
            :title="installation.scope === 'project' ? installation.projectRoot : undefined"
          >
            <span class="truncate">{{ originLabel(installation) }}</span>
          </Badge>
          <Badge
            variant="outline"
            :class="[
              'shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 font-normal',
              !installationEnabled(installation) &&
                'border-amber-500/40 text-amber-600 dark:text-amber-400',
            ]"
          >
            {{ installationEnabled(installation) ? t('detail.enabled') : t('detail.disabled') }}
          </Badge>
        </div>
        <span class="flex shrink-0 items-center gap-0.5">
          <CopyButton :text="installation.path" class="size-7" />
          <Button
            variant="ghost"
            size="icon"
            class="size-7 cursor-pointer text-muted-foreground"
            :title="t('detail.revealInFinder')"
            @click="emit('reveal', installation.path)"
          >
            <FolderOpen class="size-3.5" />
          </Button>
          <Button
            v-if="!installation.readOnly"
            variant="ghost"
            size="icon"
            class="size-7 cursor-pointer text-muted-foreground hover:text-destructive"
            :disabled="props.busy"
            :title="t('detail.removeOne')"
            @click="emit('remove', installation.path)"
          >
            <Trash2 class="size-3.5" />
          </Button>
          <LockKeyhole
            v-else
            class="mx-1.5 size-3.5 text-muted-foreground"
            :title="t('detail.readOnly')"
          />
          <button
            v-if="!installation.readOnly"
            type="button"
            role="switch"
            :aria-checked="installationEnabled(installation)"
            :aria-label="t(installationEnabled(installation) ? 'detail.disable' : 'detail.enable')"
            :title="t(installationEnabled(installation) ? 'detail.disable' : 'detail.enable')"
            :disabled="props.busy"
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-50"
            :class="
              installationEnabled(installation)
                ? 'bg-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                : 'bg-muted-foreground/25'
            "
            @click="emit('toggle', installation)"
          >
            <span
              class="size-3.5 rounded-full bg-white shadow-sm transition-transform"
              :class="
                installationEnabled(installation) ? 'translate-x-[18px]' : 'translate-x-[3px]'
              "
            />
          </button>
        </span>
      </li>
    </ul>
  </section>
</template>
