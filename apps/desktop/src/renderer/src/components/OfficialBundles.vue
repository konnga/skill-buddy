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

const featured = computed(() => bundles.value.slice(0, 4))

onMounted(() => void ensureLoaded())
</script>

<template>
  <section>
    <div class="mb-3 flex items-center gap-2">
      <h3 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {{ t('bundles.title') }}
      </h3>
      <div class="flex-1" />
      <button
        class="flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        @click="emit('more')"
      >
        {{ t('bundles.viewMore') }}
        <ChevronRight class="size-3.5" />
      </button>
    </div>
    <ul class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <li v-for="b in featured" :key="b.id">
        <BundleCard :bundle="b" @use="emit('use', b)" />
      </li>
    </ul>
  </section>
</template>
