<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AppInfo, UpdateCheckResult } from '#shared/ipc'
import skillbuddyMarkUrl from '@/assets/logo.svg'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'

const props = defineProps<{ query: string }>()
const { t } = useI18n()
const { platforms } = useSkills()
const { projectRoots } = useSettings()

const searching = computed(() => props.query.trim().length > 0)
const appInfo = ref<AppInfo | null>(null)
const updateChecking = shallowRef(false)
const updateResult = ref<UpdateCheckResult | null>(null)
const GITHUB_URL = 'https://github.com/konnga/skill-buddy'
const CHANGELOG_URL = 'https://github.com/konnga/skill-buddy/releases'

function visible(...texts: string[]): boolean {
  if (!searching.value) return true
  const query = props.query.trim().toLowerCase()
  return texts.some((text) => text.toLowerCase().includes(query))
}

onMounted(async () => {
  appInfo.value = await window.skillsManager.getAppInfo()
})

async function checkUpdate(): Promise<void> {
  updateChecking.value = true
  updateResult.value = null
  try {
    updateResult.value = await window.skillsManager.checkUpdate()
  } finally {
    updateChecking.value = false
  }
}

function openReleasePage(): void {
  if (updateResult.value?.status === 'update') {
    void window.skillsManager.openLink(updateResult.value.url)
  }
}

function openUserData(): void {
  void window.skillsManager.openUserData()
}

function openGithub(): void {
  void window.skillsManager.openLink(GITHUB_URL)
}

function openChangelog(): void {
  void window.skillsManager.openLink(CHANGELOG_URL)
}

/** 诊断文本只包含运行时与扫描摘要，不复制 Token、代理等敏感设置。 */
async function copyDiagnostics(): Promise<void> {
  const info = appInfo.value
  const lines = [
    `SkillBuddy ${info?.version ?? '?'} (${info?.platform ?? '?'} ${info?.arch ?? ''})`.trim(),
    `Electron ${info?.electron ?? '?'} / Chromium ${info?.chrome ?? '?'} / Node ${info?.node ?? '?'}`,
    `Platforms: ${platforms.value.map((platform) => `${platform.id}${platform.detected ? '' : ' (not detected)'}`).join(', ') || 'none'}`,
    `Project roots: ${projectRoots.value.length}`,
  ]
  await navigator.clipboard.writeText(lines.join('\n'))
  showToast({ message: t('settings.aboutDiagCopied') })
}
</script>

<template>
  <section class="mb-10">
    <h2 class="mb-3 text-sm font-medium">{{ t('settings.catAbout') }}</h2>
    <div class="divide-y rounded-xl border">
      <div
        v-if="visible(t('settings.aboutVersionTitle'), t('settings.aboutCheckUpdate'), t('settings.aboutGithub'), t('settings.aboutChangelog'))"
        class="flex flex-col gap-2 px-5 py-4"
      >
        <div class="flex items-center justify-between gap-6">
          <div class="flex min-w-0 items-center gap-3">
            <img
              :src="skillbuddyMarkUrl"
              alt=""
              class="size-14 shrink-0 rounded-[10px]"
              aria-hidden="true"
            />
            <div class="min-w-0">
              <p class="mt-0.5 text-base text-muted-foreground">
                SkillBuddy v{{ appInfo?.version ?? '…' }}
              </p>
            </div>
          </div>
          <span class="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              class="cursor-pointer"
              @click="openGithub"
            >
              {{ t('settings.aboutGithub') }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="cursor-pointer"
              @click="openChangelog"
            >
              {{ t('settings.aboutChangelog') }}
            </Button>
            <Button
              v-if="updateResult?.status === 'update'"
              size="sm"
              class="cursor-pointer"
              @click="openReleasePage"
            >
              {{ t('settings.aboutDownload') }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="cursor-pointer"
              :disabled="updateChecking"
              @click="checkUpdate"
            >
              {{ updateChecking ? t('settings.aboutChecking') : t('settings.aboutCheckUpdate') }}
            </Button>
          </span>
        </div>
        <p v-if="updateResult" class="text-sm text-muted-foreground">
          <template v-if="updateResult.status === 'update'">
            {{ t('settings.aboutUpdateAvailable', { v: updateResult.latest }) }}
          </template>
          <template v-else-if="updateResult.status === 'latest'">
            {{ t('settings.aboutUpToDate', { v: appInfo?.version ?? '' }) }}
          </template>
          <template v-else-if="updateResult.status === 'none'">
            {{ t('settings.aboutNoRelease') }}
          </template>
          <template v-else>
            {{ t('settings.aboutCheckFailed', { msg: updateResult.message }) }}
          </template>
        </p>
      </div>
      <div
        v-if="visible(t('settings.aboutRuntimeTitle'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.aboutRuntimeTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            Electron {{ appInfo?.electron }} · Chromium {{ appInfo?.chrome }} · Node
            {{ appInfo?.node }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0 cursor-pointer"
          @click="copyDiagnostics"
        >
          {{ t('settings.aboutCopyDiagnostics') }}
        </Button>
      </div>
      <div
        v-if="visible(t('settings.aboutOpenDataTitle'), t('settings.aboutOpenDataDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.aboutOpenDataTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.aboutOpenDataDesc') }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0 cursor-pointer"
          @click="openUserData"
        >
          {{ t('settings.aboutOpenDataAction') }}
        </Button>
      </div>
    </div>
  </section>
</template>
