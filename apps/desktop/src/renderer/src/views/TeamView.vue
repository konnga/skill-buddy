<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import TeamPage from '@/components/TeamPage.vue'
import { ScrollArea } from '@/components/ui/scroll-area'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{ openSettings: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      :class="[
        'app-drag relative flex h-14 shrink-0 items-center gap-3 px-6',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <h1 class="text-sm font-semibold leading-5 tracking-tight">{{ t('team.title') }}</h1>
    </header>
    <ScrollArea class="flex-1">
      <TeamPage @open-settings="emit('openSettings')" />
    </ScrollArea>
  </div>
</template>
