<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { ArrowLeft } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import BundleCard from '@/components/BundleCard.vue'
import { useBundles } from '@/composables/useBundles'
import type { SkillBundle } from '@/lib/bundles'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{ close: []; open: [bundle: SkillBundle] }>()

const { t } = useI18n()
const { bundles, ensureLoaded } = useBundles()

onMounted(() => void ensureLoaded())
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- header -->
    <header :class="['app-drag relative flex items-center gap-3 border-b px-6 py-3', props.inset && 'pl-[118px]']">
      <SidebarToggle />
      <Button variant="ghost" size="icon" class="app-no-drag" @click="emit('close')">
        <ArrowLeft />
      </Button>
      <h1 class="text-base font-semibold tracking-tight">{{ t('bundles.title') }}</h1>
    </header>

    <div class="flex-1 overflow-y-auto">
      <div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-6">
        <ul class="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <li v-for="b in bundles" :key="b.id">
            <BundleCard :bundle="b" @use="emit('open', b)" />
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
