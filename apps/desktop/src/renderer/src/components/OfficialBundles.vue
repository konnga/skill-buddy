<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight } from '@lucide/vue'
import BundleCard from '@/components/BundleCard.vue'
import { useBundles } from '@/composables/useBundles'
import type { SkillBundle } from '@/lib/bundles'

const emit = defineEmits<{ use: [bundle: SkillBundle]; more: [] }>()

const { t } = useI18n()
const { bundles, ensureLoaded } = useBundles()

const featured = computed(() => bundles.value.slice(0, 3))

onMounted(() => void ensureLoaded())
</script>

<template>
  <section>
    <div class="mb-3 flex items-center gap-2">
      <h3 class="text-base font-semibold">
        {{ t('bundles.title') }}
      </h3>
      <div class="flex-1" />
      <button
        class="flex items-center gap-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        @click="emit('more')"
      >
        {{ t('bundles.viewAll') }}
        <ChevronRight class="size-3.5" />
      </button>
    </div>
    <ul class="grid grid-cols-1 gap-x-6 gap-y-7 md:grid-cols-2 xl:grid-cols-3">
      <li v-for="b in featured" :key="b.id">
        <BundleCard :bundle="b" @use="emit('use', b)" />
      </li>
    </ul>
  </section>
</template>
