<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Search } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SettingsCategory } from '@/lib/navigation'

export interface SettingsNavItem {
  id: SettingsCategory
  labelKey: string
  icon: unknown
}

export interface SettingsNavGroup {
  labelKey: string
  items: SettingsNavItem[]
}

/** 设置侧栏只负责导航展示，分类状态和搜索文本由 SettingsPage 统一持有。 */
const props = defineProps<{
  groups: SettingsNavGroup[]
  category: SettingsCategory
  query: string
  searching: boolean
}>()

const emit = defineEmits<{
  back: []
  'update:category': [value: SettingsCategory]
  'update:query': [value: string]
}>()

const { t } = useI18n()
</script>

<template>
  <aside class="sidebar-surface flex w-[276px] shrink-0 flex-col">
    <div class="app-drag px-4 pb-2 pt-10">
      <button
        type="button"
        class="app-no-drag flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        @click="emit('back')"
      >
        <ArrowLeft class="size-4" />
        {{ t('settings.back') }}
      </button>
    </div>
    <div class="px-4 pb-2">
      <div class="relative">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          :model-value="props.query"
          :placeholder="t('settings.searchPh')"
          class="h-8 pl-8 text-sm"
          @update:model-value="emit('update:query', $event)"
        />
      </div>
    </div>

    <ScrollArea class="flex-1">
      <nav class="flex flex-col gap-0.5 px-3 pb-4">
        <template v-for="group in props.groups" :key="group.labelKey">
          <p
            class="mb-1 mt-4 px-2 text-sm font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{ t(group.labelKey) }}
          </p>
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            :class="[
              'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
              !props.searching && props.category === item.id
                ? 'nav-active'
                : 'hover:bg-accent/60',
            ]"
            @click="emit('update:category', item.id); emit('update:query', '')"
          >
            <component :is="item.icon" class="size-4 text-foreground/70" />
            {{ t(item.labelKey) }}
          </button>
        </template>
      </nav>
    </ScrollArea>
  </aside>
</template>
