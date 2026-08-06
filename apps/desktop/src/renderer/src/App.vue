<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { Blocks, FolderOpen, RefreshCw, Search, Settings, TriangleAlert } from '@lucide/vue'
import type { AggregatedSkill } from '@skills-manager/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import PlatformIcon from '@/components/PlatformIcon.vue'
import SettingsSheet from '@/components/SettingsSheet.vue'
import SkillCard from '@/components/SkillCard.vue'
import SkillDetailSheet from '@/components/SkillDetailSheet.vue'
import { setPlatformNames } from '@/lib/agents'
import { syncCustomPlatforms, useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const {
  platforms,
  detectedPlatforms,
  countByPlatform,
  countByProject,
  loading,
  error,
  search,
  platformFilter,
  projectFilter,
  driftOnly,
  filtered,
  skills,
  refresh,
} = useSkills()

const { projectRoots } = useSettings()

const basename = (p: string): string => p.split('/').filter(Boolean).pop() ?? p

const selected = ref<AggregatedSkill | null>(null)
const settingsOpen = ref(false)

watch(platforms, (v) => setPlatformNames(v))
watch(skills, (v) => {
  // keep the open sheet in sync after install/uninstall refreshes
  if (selected.value) {
    selected.value = v.find((s) => s.name === selected.value!.name) ?? null
  }
})

onMounted(async () => {
  await syncCustomPlatforms()
  await refresh()
})
</script>

<template>
  <div class="flex h-screen">
    <!-- sidebar -->
    <aside class="flex w-56 shrink-0 flex-col border-r bg-muted/30">
      <div class="flex items-center gap-2 px-4 pb-4 pt-10">
        <Blocks class="size-5 text-primary" />
        <span class="font-semibold tracking-tight">Skills Manager</span>
      </div>

      <nav class="flex flex-col gap-0.5 px-2">
        <button
          :class="[
            'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
            platformFilter === null ? 'bg-accent font-medium' : 'hover:bg-accent/60',
          ]"
          @click="platformFilter = null"
        >
          全部
          <span class="text-xs tabular-nums text-muted-foreground">{{ skills.length }}</span>
        </button>
        <p class="mb-1 mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          平台
        </p>
        <button
          v-for="p in detectedPlatforms"
          :key="p.id"
          :class="[
            'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
            platformFilter === p.id ? 'bg-accent font-medium' : 'hover:bg-accent/60',
          ]"
          @click="platformFilter = platformFilter === p.id ? null : p.id"
        >
          <span class="flex min-w-0 items-center gap-2">
            <PlatformIcon :id="p.id" :size="15" class="text-foreground/70" />
            <span class="truncate">{{ p.displayName }}</span>
          </span>
          <span class="text-xs tabular-nums text-muted-foreground">
            {{ countByPlatform.get(p.id) ?? 0 }}
          </span>
        </button>

        <template v-if="projectRoots.length > 0">
          <p
            class="mb-1 mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            范围
          </p>
          <button
            :class="[
              'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
              projectFilter === 'user' ? 'bg-accent font-medium' : 'hover:bg-accent/60',
            ]"
            @click="projectFilter = projectFilter === 'user' ? null : 'user'"
          >
            全局（user）
          </button>
          <button
            v-for="root in projectRoots"
            :key="root"
            :class="[
              'flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors',
              projectFilter === root ? 'bg-accent font-medium' : 'hover:bg-accent/60',
            ]"
            :title="root"
            @click="projectFilter = projectFilter === root ? null : root"
          >
            <span class="flex min-w-0 items-center gap-2">
              <FolderOpen class="size-3.5 shrink-0 text-foreground/60" />
              <span class="truncate">{{ basename(root) }}</span>
            </span>
            <span class="text-xs tabular-nums text-muted-foreground">
              {{ countByProject.get(root) ?? 0 }}
            </span>
          </button>
        </template>
      </nav>

      <div class="mt-auto px-2 pb-3">
        <button
          class="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          @click="settingsOpen = true"
        >
          <Settings class="size-4" />
          设置
        </button>
      </div>
    </aside>

    <!-- main -->
    <main class="flex min-w-0 flex-1 flex-col">
      <header
        class="app-drag flex items-center gap-3 border-b px-6 py-3"
      >
        <div class="app-no-drag relative w-72">
          <Search
            class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input v-model="search" placeholder="搜索 skills…" class="pl-8" />
        </div>
        <button
          type="button"
          :class="[
            'app-no-drag flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
            driftOnly
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
              : 'text-muted-foreground hover:border-primary/40',
          ]"
          @click="driftOnly = !driftOnly"
        >
          <TriangleAlert class="size-3.5" />
          仅看漂移
        </button>
        <div class="flex-1" />
        <Button
          variant="outline"
          size="sm"
          class="app-no-drag"
          :disabled="loading"
          @click="refresh"
        >
          <RefreshCw :class="loading ? 'animate-spin' : ''" />
          重新扫描
        </Button>
      </header>

      <div class="flex-1 overflow-y-auto px-6 py-5">
        <div v-if="loading && skills.length === 0" class="py-24 text-center text-sm text-muted-foreground">
          扫描中…
        </div>

        <div v-else-if="error" class="py-24 text-center text-sm text-destructive">{{ error }}</div>

        <div
          v-else-if="skills.length === 0"
          class="flex flex-col items-center gap-3 py-24 text-muted-foreground"
        >
          <FolderOpen class="size-10" />
          <p class="text-sm">未发现已安装的 skills</p>
          <p class="max-w-sm text-center text-xs">
            已检测到 {{ detectedPlatforms.length }} 个 agent 平台。在任一平台安装 skill
            后点击「重新扫描」。
          </p>
        </div>

        <div
          v-else-if="filtered.length === 0"
          class="py-24 text-center text-sm text-muted-foreground"
        >
          没有匹配「{{ search }}」的 skill
        </div>

        <div v-else class="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          <SkillCard
            v-for="skill in filtered"
            :key="skill.name"
            :skill="skill"
            @open="selected = skill"
          />
        </div>
      </div>
    </main>

    <SkillDetailSheet :skill="selected" @close="selected = null" />
    <SettingsSheet :open="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>

<style>
.app-drag {
  -webkit-app-region: drag;
}
.app-no-drag {
  -webkit-app-region: no-drag;
}
</style>
