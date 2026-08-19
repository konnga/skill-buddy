<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { ChevronDown, PackageCheck, Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { TeamLibraryBundleSummary } from '#shared/ipc'
import TeamBundleInstallPanel from '@/components/team/TeamBundleInstallPanel.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTeamLibraries } from '@/composables/useTeamLibraries'

const { t } = useI18n()
const { bundles, skills, mcpServers, installations } = useTeamLibraries()
const query = shallowRef('')
const expanded = shallowRef<string | null>(null)

const visibleBundles = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return needle
    ? bundles.value.filter((item) =>
        [item.name, item.description, item.id, item.libraryName]
          .some((value) => value.toLowerCase().includes(needle)),
      )
    : bundles.value
})

const currentInstallations = computed(() => new Set([
  ...skills.value.flatMap((item) => installations.value.some((record) =>
    record.type === 'skill' &&
    record.libraryId === item.libraryId &&
    record.path === item.path &&
    (record.status === 'current' ||
      (record.status === undefined && record.contentHash === item.contentHash)),
  ) ? [`skill:${item.libraryId}:${item.path}`] : []),
  ...mcpServers.value.flatMap((item) => installations.value.some((record) =>
    record.type === 'mcp' &&
    record.libraryId === item.libraryId &&
    record.path === item.path &&
    (record.status === 'current' ||
      (record.status === undefined && record.definitionHash === item.definitionHash)),
  ) ? [`mcp:${item.libraryId}:${item.path}`] : []),
]))

function bundleKey(item: TeamLibraryBundleSummary): string {
  return `${item.libraryId}:${item.path}`
}

function installedCount(item: TeamLibraryBundleSummary): number {
  return item.skills.filter((ref) => currentInstallations.value.has(`skill:${item.libraryId}:${ref}`)).length +
    item.mcpServers.filter((ref) => currentInstallations.value.has(`mcp:${item.libraryId}:${ref}`)).length
}

function totalCount(item: TeamLibraryBundleSummary): number {
  return item.skills.length + item.mcpServers.length
}

function toggle(item: TeamLibraryBundleSummary): void {
  const key = bundleKey(item)
  expanded.value = expanded.value === key ? null : key
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="relative">
      <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="query" :placeholder="t('team.bundleSearch')" class="pl-8" />
    </div>
    <p v-if="visibleBundles.length === 0" class="py-16 text-center text-sm text-muted-foreground">
      {{ t('team.bundleEmpty') }}
    </p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="item in visibleBundles" :key="bundleKey(item)" class="rounded-md border px-4 py-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-start gap-3">
            <PackageCheck class="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <span class="min-w-0">
              <span class="flex flex-wrap items-center gap-2 text-sm font-medium">
                <span>{{ item.name }}</span>
                <Badge variant="outline">{{ item.libraryName }}</Badge>
                <Badge v-if="item.version" variant="secondary">v{{ item.version }}</Badge>
                <Badge
                  v-if="item.missingSkills.length + item.missingMcpServers.length > 0"
                  variant="outline"
                  class="border-destructive/50 text-destructive"
                >
                  {{ t('team.bundleInvalid') }}
                </Badge>
              </span>
              <span class="mt-0.5 block line-clamp-1 text-sm text-muted-foreground">
                {{ item.description || t('team.bundleNoDescription') }}
              </span>
              <span class="mt-1 block text-xs text-muted-foreground">
                {{ t('team.bundleProgress', { installed: installedCount(item), total: totalCount(item) }) }}
              </span>
            </span>
          </div>
          <Button variant="outline" size="sm" class="shrink-0 cursor-pointer" @click="toggle(item)">
            {{ t('team.bundleConfigure') }}
            <ChevronDown :class="['size-4 transition-transform', expanded === bundleKey(item) && 'rotate-180']" />
          </Button>
        </div>
        <div v-if="expanded === bundleKey(item)" class="mt-3 border-t pt-3">
          <TeamBundleInstallPanel :bundle="item" />
        </div>
      </li>
    </ul>
  </div>
</template>
