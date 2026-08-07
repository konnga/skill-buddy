<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SidebarToggle from '@/components/SidebarToggle.vue'
import TeamPage from '@/components/TeamPage.vue'

const props = defineProps<{ inset?: boolean }>()
const emit = defineEmits<{ openSettings: [] }>()
const { t } = useI18n()
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
      <h1 class="text-sm font-semibold tracking-tight">{{ t('team.title') }}</h1>
    </header>
    <div class="flex-1 overflow-y-auto">
      <TeamPage @open-settings="emit('openSettings')" />
    </div>
  </div>
</template>
