<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ServerCog } from '@lucide/vue'
import {
  bundleRefToMarketItem,
  bundleText,
  type BundleSkillRef,
  type SkillBundle,
} from '@/lib/bundles'
import { marketIconColor, marketIconGlyph } from '@/lib/market'

const props = defineProps<{ bundle: SkillBundle }>()
const emit = defineEmits<{ use: [] }>()

const { t, locale } = useI18n()

const previewMembers = computed(() =>
  [
    ...props.bundle.skills.map((skill) => ({
      kind: 'skill' as const,
      key: `skill:${skill.name}`,
      name: skillName(skill),
      source: skillSource(skill),
      skill,
      item: bundleRefToMarketItem(skill),
    })),
    ...props.bundle.mcpServers.map((server) => ({
      kind: 'mcp' as const,
      key: `mcp:${server.name}`,
      name: server.name,
      source: server.transport.kind,
      server,
    })),
  ].slice(0, 2),
)

const failedIcons = ref(new Set<string>())

function markIconFailed(key: string): void {
  failedIcons.value = new Set([...failedIcons.value, key])
}

function skillName(skill: BundleSkillRef): string {
  return skill.name.replaceAll('-', ' ')
}

function skillSource(skill: BundleSkillRef): string {
  return skill.source === 'skills-sh' ? skill.repo : `@${skill.namespace}`
}
</script>

<template>
  <div class="group relative block min-w-0 pt-4">
    <div
      class="pointer-events-none absolute h-[202px] rounded-[20px] border-[0.6px] bg-card"
      :style="{
        top: '3px',
        left: '4%',
        right: '4%',
        transform: 'rotate(-3.3deg) skewX(2.61deg)',
      }"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute h-[190px] rounded-[15px] border-[0.6px] bg-card"
      :style="{
        top: '6px',
        left: '4%',
        right: '7%',
        transform: 'rotate(4.22deg) skewX(-3.9deg)',
      }"
      aria-hidden="true"
    />
    <article
      class="relative flex h-[190px] flex-col overflow-hidden rounded-[18px] border bg-card px-4 py-[15px] transition-shadow duration-200 group-hover:shadow-md"
    >
      <h3 class="truncate font-serif text-base font-semibold leading-6">
        {{ bundleText(bundle.name, locale) }}
      </h3>

      <ul class="mt-3 flex min-h-0 flex-col gap-3">
        <li v-for="entry in previewMembers" :key="entry.key" class="min-w-0">
          <button
            type="button"
            class="flex h-[38px] w-full min-w-0 items-center gap-3 text-left"
            @click="emit('use')"
          >
            <span
              :class="[
                'relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-sm font-semibold text-white',
                marketIconColor(entry.name),
              ]"
            >
              <img
                v-if="entry.kind === 'skill' && entry.item.icon && !failedIcons.has(entry.item.key)"
                :src="entry.item.icon"
                class="size-full object-cover"
                alt=""
                loading="lazy"
                @error="markIconFailed(entry.item.key)"
              />
              <ServerCog v-else-if="entry.kind === 'mcp'" class="size-4" />
              <span v-else>{{ marketIconGlyph(entry.name) }}</span>
            </span>
            <span class="flex h-[38px] min-w-0 flex-1 flex-col justify-center">
              <span class="truncate text-sm font-medium capitalize leading-5">
                {{ entry.name }}
              </span>
              <span class="truncate text-sm leading-[18px] text-muted-foreground">
                {{ entry.source }}
              </span>
            </span>
          </button>
        </li>
      </ul>

      <div class="mt-auto flex items-center justify-between gap-3 text-sm leading-5 text-muted-foreground">
        <span>{{ t('bundles.resourceCount', { skills: bundle.skills.length, mcp: bundle.mcpServers.length }) }}</span>
        <button
          type="button"
          class="cursor-pointer transition-colors hover:text-foreground"
          @click="emit('use')"
        >
          {{ t('bundles.viewMore') }}
        </button>
      </div>
    </article>
  </div>
</template>
