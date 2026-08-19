<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { GitBranch, Trash2 } from '@lucide/vue'
import type { TeamLibraryConfig } from '#shared/ipc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import TeamLibrarySetupPanel from './TeamLibrarySetupPanel.vue'
import type { TeamLibraryRow } from '@/composables/useSettingsPageSections'

const props = defineProps<{
  searching: boolean
  rows: TeamLibraryRow[]
}>()

const emit = defineEmits<{
  connected: [library: TeamLibraryConfig]
  remove: [key: string]
}>()

const { t } = useI18n()
</script>

<template>
  <section class="mb-10">
    <h2 v-if="props.searching" class="mb-3 text-sm font-medium">
      {{ t('settings.sectionTeamLibrary') }}
    </h2>
    <p class="mb-3 text-sm text-muted-foreground">{{ t('settings.teamLibraryDesc') }}</p>
    <div class="space-y-4">
      <div v-if="props.rows.length > 0" class="divide-y rounded-xl border">
        <div
          v-for="library in props.rows"
          :key="library.key"
          class="flex items-center gap-3 px-4 py-3.5"
        >
          <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <GitBranch class="size-4 text-muted-foreground" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center gap-2">
              <p class="truncate text-sm font-medium">{{ library.name }}</p>
              <Badge v-if="library.id" variant="secondary" class="shrink-0 font-mono text-[10px]">
                {{ library.id }}
              </Badge>
            </div>
            <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
              {{ library.config.remoteUrl }}
            </p>
            <p class="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <GitBranch class="size-3" />
              {{ library.config.branch }}
            </p>
            <p v-if="library.error" class="mt-1 break-all text-xs text-destructive">
              {{ library.error }}
            </p>
            <p
              v-else-if="library.warning"
              class="mt-1 break-all text-xs text-amber-600 dark:text-amber-400"
            >
              {{ library.warning }}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="size-8 shrink-0 cursor-pointer text-muted-foreground hover:text-destructive"
            :title="t('settings.teamLibraryRemove')"
            :aria-label="t('settings.teamLibraryRemove')"
            @click="emit('remove', library.key)"
          >
            <Trash2 class="size-3.5" />
          </Button>
        </div>
      </div>

      <TeamLibrarySetupPanel @connected="emit('connected', $event)" />
    </div>
  </section>
</template>
