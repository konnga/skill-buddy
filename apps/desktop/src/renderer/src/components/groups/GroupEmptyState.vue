<script setup lang="ts">
import { ArrowRight, Layers, Plus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'

const props = defineProps<{ name: string }>()
const emit = defineEmits<{
  browseSkills: []
  newSkill: []
}>()

const { t } = useI18n()
</script>

<template>
  <section class="flex min-h-80 flex-col items-center justify-center px-6 py-16 text-center">
    <div
      class="relative mb-5 grid size-14 place-items-center rounded-lg border border-primary/20 bg-primary/5 text-primary"
    >
      <Layers class="size-7" />
      <span class="absolute -bottom-1 -right-1 size-3 rounded-sm border border-background bg-primary/75" />
    </div>
    <p class="max-w-lg text-lg font-semibold">
      {{ t('groups.emptyBundleTitle', { name: props.name }) }}
    </p>
    <p class="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
      {{ t('groups.emptyBundleHint') }}
    </p>
    <div class="mt-6 flex flex-wrap justify-center gap-2">
      <Button class="cursor-pointer" @click="emit('browseSkills')">
        {{ t('groups.emptyBundleBrowse') }}
        <ArrowRight class="size-4" />
      </Button>
      <Button variant="outline" class="cursor-pointer" @click="emit('newSkill')">
        <Plus class="size-4" />
        {{ t('groups.emptyBundleCreate') }}
      </Button>
    </div>
  </section>
</template>
