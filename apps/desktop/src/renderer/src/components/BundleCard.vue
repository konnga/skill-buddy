<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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

const previewSkills = computed(() =>
  props.bundle.skills.slice(0, 3).map((skill) => ({
    skill,
    item: bundleRefToMarketItem(skill),
  })),
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
  <div class="group relative block min-w-0 pt-5">
    <div
      class="pointer-events-none absolute h-[253px] rounded-[25.6px] border-[0.6px] bg-card shadow-md"
      :style="{
        top: '3px',
        left: '4%',
        right: '4%',
        transform: 'rotate(-3.3deg) skewX(2.61deg)',
      }"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute h-[237px] rounded-[18px] border-[0.6px] bg-card shadow-md"
      :style="{
        top: '6px',
        left: '4%',
        right: '7%',
        transform: 'rotate(4.22deg) skewX(-3.9deg)',
      }"
      aria-hidden="true"
    />
    <article
      class="relative flex h-[246px] flex-col overflow-hidden rounded-[20px] border bg-card px-[19px] py-[18px] shadow-sm transition-shadow duration-200 group-hover:shadow-md"
    >
      <h3 class="truncate font-serif text-base font-semibold leading-6">
        {{ bundleText(bundle.name, locale) }}
      </h3>

      <ul class="mt-4 flex min-h-0 flex-col gap-3">
        <li v-for="entry in previewSkills" :key="entry.item.key" class="min-w-0">
          <button
            type="button"
            class="flex h-[38px] w-full min-w-0 items-center gap-3 text-left"
            @click="emit('use')"
          >
            <span
              :class="[
                'relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-sm font-semibold text-white',
                marketIconColor(entry.skill.name),
              ]"
            >
              <img
                v-if="entry.item.icon && !failedIcons.has(entry.item.key)"
                :src="entry.item.icon"
                class="size-full object-cover"
                alt=""
                loading="lazy"
                @error="markIconFailed(entry.item.key)"
              />
              <span v-else>{{ marketIconGlyph(entry.skill.name) }}</span>
            </span>
            <span class="flex h-[38px] min-w-0 flex-1 flex-col justify-center">
              <span class="truncate text-sm font-medium capitalize leading-5">
                {{ skillName(entry.skill) }}
              </span>
              <span class="truncate text-xs leading-[18px] text-muted-foreground">
                {{ skillSource(entry.skill) }}
              </span>
            </span>
          </button>
        </li>
      </ul>

      <button
        type="button"
        class="mt-auto self-start text-[13px] leading-5 text-muted-foreground transition-colors hover:text-foreground"
        @click="emit('use')"
      >
        {{ t('bundles.viewMore') }}
      </button>
    </article>
  </div>
</template>
