<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CloudDownload,
  FolderOpen,
  Import,
  Plus,
  RefreshCw,
  Search,
  TriangleAlert,
} from '@lucide/vue'
import type { AggregatedSkill } from '@skillbuddy/core'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import SkillCard from '@/components/SkillCard.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useGroups } from '@/composables/useGroups'
import { useSkills } from '@/composables/useSkills'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{
  openSkill: [skill: AggregatedSkill]
  newSkill: []
  importSkills: []
}>()

const { t } = useI18n()
const {
  detectedPlatforms,
  loading,
  error,
  search,
  driftOnly,
  sortBy,
  filtered,
  skills,
  refresh,
} = useSkills()
const {
  groupFilter,
  groupApplyOpen,
  groupApplyScope,
  groupApplyAgents,
  groupApplyBusy,
  groupApplyNote,
  activeTemp,
  groupCount,
  applyGroup,
  applyGroupTemp,
  endTemp,
} = useGroups()

const sortOptions = computed(() => [
  { value: 'name', label: t('sort.name') },
  { value: 'recent', label: t('sort.recent') },
])
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      :class="[
        'app-drag relative flex items-center gap-3 px-6 py-3',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <div class="app-no-drag relative w-72">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input v-model="search" :placeholder="t('app.searchPlaceholder')" class="pl-8" />
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
        {{ t('app.driftOnly') }}
      </button>
      <Select v-model="sortBy" class="app-no-drag" :options="sortOptions" />
      <Button
        v-if="groupFilter"
        variant="outline"
        size="sm"
        class="app-no-drag"
        @click="groupApplyOpen = !groupApplyOpen"
      >
        <CloudDownload class="size-3.5" />
        {{ t('groups.applyTitle') }}
      </Button>
      <div class="flex-1" />
      <Button variant="outline" size="sm" class="app-no-drag" @click="emit('newSkill')">
        <Plus />
      </Button>
      <Button variant="outline" size="sm" class="app-no-drag" @click="emit('importSkills')">
        <Import />
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="app-no-drag"
        :disabled="loading"
        @click="refresh"
      >
        <RefreshCw :class="loading ? 'animate-spin' : ''" />
        {{ t('app.rescan') }}
      </Button>
    </header>

    <div class="flex-1 overflow-y-auto px-6 py-5">
      <div
        v-if="groupFilter && groupApplyOpen"
        class="mb-4 flex flex-col gap-2 rounded-lg border px-4 py-3"
      >
        <span class="text-xs text-muted-foreground">{{ t('groups.applyTitle') }}</span>
        <PlatformTargetPicker
          v-model:scope="groupApplyScope"
          v-model:agents="groupApplyAgents"
        />
        <div class="flex items-center gap-2">
          <Button
            size="sm"
            :disabled="groupApplyBusy || groupApplyAgents.length === 0 || groupCount(groupFilter) === 0"
            @click="applyGroup"
          >
            {{
              groupApplyBusy
                ? t('detail.installing')
                : t('groups.apply', { n: groupCount(groupFilter) })
            }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="groupApplyBusy || groupApplyAgents.length === 0 || groupCount(groupFilter) === 0"
            @click="applyGroupTemp"
          >
            {{ t('groups.applyTemp') }}
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">{{ t('groups.tempHint') }}</p>
        <p v-if="groupApplyNote" class="text-xs text-amber-600 dark:text-amber-400">
          {{ groupApplyNote }}
        </p>
      </div>

      <div
        v-if="groupFilter && activeTemp"
        class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-2.5"
      >
        <span class="text-xs text-sky-700 dark:text-sky-400">
          {{ t('groups.tempActive', { n: activeTemp.installed.length }) }}
        </span>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0"
          :disabled="groupApplyBusy"
          @click="endTemp(groupFilter)"
        >
          {{ t('groups.endTemp') }}
        </Button>
      </div>

      <div v-if="loading && skills.length === 0" class="py-24 text-center text-sm text-muted-foreground">
        {{ t('app.scanning') }}
      </div>
      <div v-else-if="error" class="py-24 text-center text-sm text-destructive">{{ error }}</div>
      <div
        v-else-if="skills.length === 0"
        class="flex flex-col items-center gap-3 py-24 text-muted-foreground"
      >
        <FolderOpen class="size-10" />
        <p class="text-sm">{{ t('app.empty') }}</p>
        <p class="max-w-sm text-center text-xs">
          {{ t('app.emptyHint', { n: detectedPlatforms.length }) }}
        </p>
      </div>
      <div v-else-if="filtered.length === 0" class="py-24 text-center text-sm text-muted-foreground">
        {{ t('app.noMatch', { q: search }) }}
      </div>
      <div v-else class="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <SkillCard
          v-for="skill in filtered"
          :key="skill.name"
          :skill="skill"
          @open="emit('openSkill', skill)"
        />
      </div>
    </div>
  </div>
</template>
