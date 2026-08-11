<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ThemeMode } from '@/composables/useSettings'

const { t } = useI18n()
const model = defineModel<ThemeMode>({ required: true })

const modes: { id: ThemeMode; labelKey: string }[] = [
  { id: 'system', labelKey: 'settings.themeSystem' },
  { id: 'light', labelKey: 'settings.themeLight' },
  { id: 'dark', labelKey: 'settings.themeDark' },
]
</script>

<template>
  <div class="grid grid-cols-3 gap-4">
    <button
      v-for="mode in modes"
      :key="mode.id"
      type="button"
      class="group flex flex-col items-center gap-2.5"
      :aria-pressed="model === mode.id"
      @click="model = mode.id"
    >
      <span
        :class="[
          'block w-full rounded-[14px] border-2 p-0.5 transition-colors',
          model === mode.id
            ? 'border-foreground'
            : 'border-transparent group-hover:border-foreground/25',
        ]"
      >
        <!-- 迷你窗口示意图：system 卡片左右各半张 light / dark -->
        <span class="relative block aspect-[4/3] overflow-hidden rounded-[10px] border border-black/5 dark:border-white/10">
          <template v-if="mode.id === 'system'">
            <span class="absolute inset-0" style="clip-path: inset(0 50% 0 0)">
              <span class="theme-mock theme-mock-light" />
            </span>
            <span class="absolute inset-0" style="clip-path: inset(0 0 0 50%)">
              <span class="theme-mock theme-mock-dark" />
            </span>
          </template>
          <span v-else class="theme-mock" :class="mode.id === 'dark' ? 'theme-mock-dark' : 'theme-mock-light'" />
        </span>
      </span>
      <span
        :class="[
          'text-sm transition-colors',
          model === mode.id ? 'font-medium text-foreground' : 'text-muted-foreground',
        ]"
      >
        {{ t(mode.labelKey) }}
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
/* 主题预览小样：背板 + 顶部标题条 + 内容窗口（骨架条），
   颜色写死为示意色，不跟随应用主题，避免自定义颜色扭曲选项本身的含义 */
.theme-mock {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 9% 8% 0;

  &::before {
    /* 标题条 */
    content: '';
    height: 5px;
    width: 34%;
    margin: 0 auto 7%;
    border-radius: 999px;
    flex: none;
  }

  &::after {
    /* 内容窗口：骨架条用多层渐变一次画出 */
    content: '';
    flex: 1;
    border-radius: 10px 10px 0 0;
    background-image:
      linear-gradient(var(--mock-bar) 0 0), linear-gradient(var(--mock-bar) 0 0),
      linear-gradient(var(--mock-bar) 0 0), linear-gradient(var(--mock-bar) 0 0);
    background-repeat: no-repeat;
    background-size:
      38% 6px,
      62% 6px,
      50% 6px,
      70% 6px;
    background-position:
      12% 18%,
      12% 38%,
      12% 58%,
      12% 78%;
  }
}

.theme-mock-light {
  background: linear-gradient(160deg, #ececec, #dcdcdc);
  --mock-bar: #e3e3e3;

  &::before {
    background: #c9c9c9;
  }

  &::after {
    background-color: #ffffff;
  }
}

.theme-mock-dark {
  background: linear-gradient(160deg, #4c4c4c, #383838);
  --mock-bar: #4a4a4a;

  &::before {
    background: #8a8a8a;
  }

  &::after {
    background-color: #262626;
  }
}
</style>
