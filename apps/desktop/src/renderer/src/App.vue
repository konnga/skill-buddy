<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { Blocks, FolderOpen, RefreshCw, Search, TriangleAlert } from '@lucide/vue'
import type { AggregatedSkill } from '@skills-manager/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import SkillCard from '@/components/SkillCard.vue'
import SkillDetailSheet from '@/components/SkillDetailSheet.vue'
import { setPlatformNames } from '@/lib/agents'
import { useSkills } from '@/composables/useSkills'

const {
  platforms,
  detectedPlatforms,
  countByPlatform,
  loading,
  error,
  search,
  platformFilter,
  driftOnly,
  filtered,
  skills,
  refresh,
} = useSkills()

const selected = ref<AggregatedSkill | null>(null)

watch(platforms, (v) => setPlatformNames(v))
watch(skills, (v) => {
  // keep the open sheet in sync after install/uninstall refreshes
  if (selected.value) {
    selected.value = v.find((s) => s.name === selected.value!.name) ?? null
  }
})

onMounted(refresh)
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
          <Badge variant="secondary">{{ skills.length }}</Badge>
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
          <span class="truncate">{{ p.displayName }}</span>
          <Badge variant="secondary">{{ countByPlatform.get(p.id) ?? 0 }}</Badge>
        </button>
      </nav>
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
