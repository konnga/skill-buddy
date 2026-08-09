<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { ArrowLeft } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
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
    <header :class="['app-drag relative flex h-14 shrink-0 items-center gap-3 border-b px-6', props.inset && 'pl-[118px]']">
      <SidebarToggle />
      <Button variant="ghost" size="icon" class="app-no-drag" @click="emit('close')">
        <ArrowLeft class="!size-5 translate-y-px" />
      </Button>
      <h1 class="text-base font-semibold leading-5 tracking-tight">{{ t('bundles.title') }}</h1>
    </header>

    <ScrollArea class="flex-1">
      <div class="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-6">
        <ul class="grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
          <li v-for="b in bundles" :key="b.id">
            <BundleCard :bundle="b" @use="emit('open', b)" />
          </li>
        </ul>
      </div>
    </ScrollArea>
  </div>
</template>
