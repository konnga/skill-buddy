<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ServerCog, Sparkles, Users } from '@lucide/vue'
import TeamMcpCatalog from '@/components/team/TeamMcpCatalog.vue'
import TeamSkillCatalog from '@/components/team/TeamSkillCatalog.vue'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/composables/useSettings'

const emit = defineEmits<{ openSettings: [] }>()
const { registryUrl, registryToken } = useSettings()
const { t } = useI18n()

const activeTab = shallowRef<'skills' | 'mcp'>('skills')
const configured = computed(() => Boolean(registryUrl.value && registryToken.value))
const config = computed(() => ({ url: registryUrl.value, token: registryToken.value }))
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
    <div
      v-if="!configured"
      class="flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-16 text-center"
    >
      <Users class="size-8 text-muted-foreground" />
      <p class="max-w-sm text-sm text-muted-foreground">{{ t('team.configureHint') }}</p>
      <Button variant="outline" size="sm" @click="emit('openSettings')">
        {{ t('team.configureAction') }}
      </Button>
    </div>

    <template v-else>
      <div class="flex w-fit items-center rounded-md bg-muted p-1" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'skills'"
          :class="[
            'flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors',
            activeTab === 'skills' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="activeTab = 'skills'"
        >
          <Sparkles class="size-4" />
          {{ t('team.skillsTab') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'mcp'"
          :class="[
            'flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors',
            activeTab === 'mcp' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ]"
          @click="activeTab = 'mcp'"
        >
          <ServerCog class="size-4" />
          {{ t('team.mcpTab') }}
        </button>
      </div>

      <TeamSkillCatalog v-if="activeTab === 'skills'" :config="config" />
      <TeamMcpCatalog v-else :config="config" />
    </template>
  </div>
</template>
