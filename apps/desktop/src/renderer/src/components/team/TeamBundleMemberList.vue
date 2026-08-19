<script setup lang="ts">
import { AlertTriangle, KeyRound, ServerCog, Sparkles } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type {
  TeamLibraryMcpSummary,
  TeamLibrarySkillSummary,
} from '#shared/ipc'
import { Badge } from '@/components/ui/badge'

defineProps<{
  skills: TeamLibrarySkillSummary[]
  mcpServers: TeamLibraryMcpSummary[]
  missingSkills: string[]
  missingMcpServers: string[]
  blockedReasons: Record<string, string>
}>()

const { t } = useI18n()
</script>

<template>
  <div class="grid gap-3 lg:grid-cols-2">
    <section class="overflow-hidden rounded-md border">
      <div class="flex items-center gap-2 border-b bg-muted/25 px-3 py-2 text-sm font-medium">
        <Sparkles class="size-4 text-muted-foreground" />
        {{ t('team.bundleSkills', { n: skills.length + missingSkills.length }) }}
      </div>
      <ul class="divide-y">
        <li v-for="item in skills" :key="item.path" class="flex items-center gap-2 px-3 py-2 text-sm">
          <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
          <Badge v-if="item.version" variant="secondary">v{{ item.version }}</Badge>
          <Badge
            v-if="blockedReasons[item.path]"
            variant="outline"
            class="border-destructive/50 text-destructive"
          >{{ t('team.bundleBlocked') }}</Badge>
        </li>
        <li v-for="ref in missingSkills" :key="ref" class="flex items-center gap-2 px-3 py-2 text-sm text-destructive">
          <AlertTriangle class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ ref }}</span>
          <Badge variant="outline">{{ t('team.bundleMissing') }}</Badge>
        </li>
      </ul>
    </section>

    <section class="overflow-hidden rounded-md border">
      <div class="flex items-center gap-2 border-b bg-muted/25 px-3 py-2 text-sm font-medium">
        <ServerCog class="size-4 text-muted-foreground" />
        {{ t('team.bundleMcp', { n: mcpServers.length + missingMcpServers.length }) }}
      </div>
      <ul class="divide-y">
        <li v-for="item in mcpServers" :key="item.path" class="flex items-center gap-2 px-3 py-2 text-sm">
          <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
          <span v-if="item.requiredSecrets.length" class="flex items-center gap-1 text-xs text-muted-foreground">
            <KeyRound class="size-3.5" />{{ item.requiredSecrets.length }}
          </span>
          <Badge v-if="item.version" variant="secondary">v{{ item.version }}</Badge>
          <Badge
            v-if="blockedReasons[item.path]"
            variant="outline"
            class="border-destructive/50 text-destructive"
          >{{ t('team.bundleBlocked') }}</Badge>
        </li>
        <li v-for="ref in missingMcpServers" :key="ref" class="flex items-center gap-2 px-3 py-2 text-sm text-destructive">
          <AlertTriangle class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ ref }}</span>
          <Badge variant="outline">{{ t('team.bundleMissing') }}</Badge>
        </li>
      </ul>
    </section>
  </div>
</template>
