<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Select } from '@/components/ui/select'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'

const scope = defineModel<string>('scope', { default: 'user' })
const agents = defineModel<string[]>('agents', { default: () => [] })

const { detectedPlatforms } = useSkills()
const { projectRoots } = useSettings()
const { t } = useI18n()

const available = computed(() =>
  detectedPlatforms.value.filter((p) => scope.value === 'user' || p.hasProjectScope),
)

const scopeOptions = computed(() => [
  { value: 'user', label: t('detail.userScope') },
  ...projectRoots.value.map((root) => ({
    value: root,
    label: t('detail.projectScope', { root }),
  })),
])

function toggle(id: string): void {
  agents.value = agents.value.includes(id)
    ? agents.value.filter((a) => a !== id)
    : [...agents.value, id]
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <Select
      v-if="projectRoots.length > 0"
      v-model="scope"
      class="w-fit max-w-full"
      :options="scopeOptions"
    />
    <div class="flex flex-wrap gap-2">
      <button
        v-for="p in available"
        :key="p.id"
        type="button"
        :class="[
          'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
          agents.includes(p.id)
            ? 'border-foreground bg-foreground text-background'
            : 'hover:border-foreground/40',
        ]"
        @click="toggle(p.id)"
      >
        <PlatformIcon :id="p.id" :size="14" />
        {{ p.displayName }}
      </button>
    </div>
  </div>
</template>
