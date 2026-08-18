<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderPlus, Trash2 } from '@lucide/vue'
import CopyButton from '@/components/CopyButton.vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  query: string
  roots: string[]
}>()

const emit = defineEmits<{
  add: []
  remove: [root: string]
}>()

const { t } = useI18n()
const visibleRoots = computed(() => {
  const query = props.query.trim().toLowerCase()
  return query
    ? props.roots.filter((root) => root.toLowerCase().includes(query))
    : props.roots
})
</script>

<template>
  <section class="mb-10">
    <div class="mb-3 flex items-center justify-between gap-6">
      <h2 class="text-sm font-medium">{{ t('settings.sectionProjects') }}</h2>
      <Button variant="outline" size="sm" class="cursor-pointer" @click="emit('add')">
        <FolderPlus />
        {{ t('common.add') }}
      </Button>
    </div>
    <p class="mb-3 text-sm text-muted-foreground">{{ t('settings.projectDirsDesc') }}</p>
    <p
      v-if="props.roots.length === 0"
      class="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground"
    >
      {{ t('settings.noDirs') }}
    </p>
    <div v-else class="divide-y rounded-xl border">
      <div
        v-for="root in visibleRoots"
        :key="root"
        class="flex items-center justify-between gap-2 px-5 py-3"
      >
        <code class="select-text truncate text-sm">{{ root }}</code>
        <span class="flex shrink-0 items-center gap-0.5">
          <CopyButton :text="root" class="size-7" />
          <Button
            variant="ghost"
            size="icon"
            class="size-7 cursor-pointer text-muted-foreground"
            @click="emit('remove', root)"
          >
            <Trash2 class="size-3.5" />
          </Button>
        </span>
      </div>
    </div>
  </section>
</template>
