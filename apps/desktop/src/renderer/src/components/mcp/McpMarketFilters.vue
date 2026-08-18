<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { Select, type SelectOption } from '@/components/ui/select'
import type { McpMarketSourceId } from '@/lib/mcp-market'

const props = defineProps<{
  source: McpMarketSourceId
  query: string
  category: string
  categoryOptions: SelectOption[]
}>()
const emit = defineEmits<{
  'update:source': [value: McpMarketSourceId]
  'update:query': [value: string]
  'update:category': [value: string]
  search: []
}>()

const { t } = useI18n()
const queryModel = computed({
  get: () => props.query,
  set: (value: string) => emit('update:query', value),
})
const categoryModel = computed({
  get: () => props.category,
  set: (value: string) => emit('update:category', value),
})

function selectSource(value: McpMarketSourceId): void {
  if (value !== props.source) emit('update:source', value)
}
</script>

<template>
  <div class="flex items-center gap-3 px-6 py-4">
    <div class="grid shrink-0 grid-cols-2 gap-1 rounded-md bg-muted p-1">
      <button
        type="button"
        :class="[
          'cursor-pointer rounded px-3 py-1.5 text-sm transition-colors',
          props.source === 'modelscope'
            ? 'bg-background font-medium shadow-sm'
            : 'text-muted-foreground',
        ]"
        @click="selectSource('modelscope')"
      >
        {{ t('mcp.market.sourceModelScope') }}
      </button>
      <button
        type="button"
        :class="[
          'cursor-pointer rounded px-3 py-1.5 text-sm transition-colors',
          props.source === 'mcp-so'
            ? 'bg-background font-medium shadow-sm'
            : 'text-muted-foreground',
        ]"
        @click="selectSource('mcp-so')"
      >
        {{ t('mcp.market.sourceMcpSo') }}
      </button>
    </div>
    <Select v-model="categoryModel" :options="props.categoryOptions" class="h-9 w-52 cursor-pointer" />
    <div class="relative flex-1">
      <Search
        class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        v-model="queryModel"
        :placeholder="t('mcp.market.searchPh')"
        class="pl-8"
        @keydown.enter="emit('search')"
      />
    </div>
  </div>
</template>
