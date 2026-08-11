<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ChevronRight, Sparkles } from '@lucide/vue'
import type { McpServerDefinition, McpTarget } from '@skillbuddy/core'
import type { InstallTarget } from '../../../shared/ipc.js'
import BundleMcpSection from '@/components/bundles/BundleMcpSection.vue'
import McpPlanDialog from '@/components/mcp/McpPlanDialog.vue'
import PlatformTargetPicker from '@/components/PlatformTargetPicker.vue'
import SidebarToggle from '@/components/SidebarToggle.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMcpServers } from '@/composables/useMcpServers'
import { useSettings } from '@/composables/useSettings'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'
import { agentLabel } from '@/lib/agents'
import {
  bundleGradient,
  bundleRefToMarketItem,
  bundleText,
  matchFoundSkill,
  type BundleSkillRef,
  type SkillBundle,
} from '@/lib/bundles'
import { marketIconColor, marketIconGlyph, type MarketItem } from '@/lib/market'

const props = defineProps<{ bundle: SkillBundle; inset?: boolean }>()
const emit = defineEmits<{ close: []; openSkill: [item: MarketItem] }>()

const { t, locale } = useI18n()
const { skills, detectedPlatforms, installSkill, refresh: refreshSkills } = useSkills()
const { groups, projectRoots } = useSettings()
const {
  servers: localMcpServers,
  platforms: mcpPlatforms,
  planning,
  applying,
  error: mcpError,
  currentPlan,
  refresh: refreshMcp,
  planUpsert,
  applyPlan,
  restore,
  closePlan,
} = useMcpServers()

const selectedSkills = ref(new Set(props.bundle.skills.map((skill) => skill.name)))
const selectedMcp = ref(new Set(props.bundle.mcpServers.map((server) => server.name)))
const scope = shallowRef('user')
const agents = ref<string[]>([])
const mcpTargets = ref<McpTarget[]>([])
const busy = shallowRef(false)
const error = shallowRef<string | null>(null)
const note = shallowRef<string | null>(null)
const progress = ref<{ n: number; total: number } | null>(null)
const pendingSkills = ref<BundleSkillRef[]>([])
const mcpQueue = ref<McpServerDefinition[]>([])
const mcpOperationIds = ref<string[]>([])
const appliedMcpCount = shallowRef(0)

const selectedCount = computed(() => selectedSkills.value.size + selectedMcp.value.size)
const installedMcpNames = computed(() => localMcpServers.value.map((server) => server.name))
const installDisabled = computed(
  () =>
    busy.value ||
    selectedCount.value === 0 ||
    (selectedSkills.value.size > 0 && agents.value.length === 0) ||
    (selectedMcp.value.size > 0 && mcpTargets.value.length === 0),
)

onMounted(() => {
  agents.value = detectedPlatforms.value.map((platform) => platform.id)
  if (props.bundle.mcpServers.length > 0) void refreshMcp({ silent: true })
})

function toggleSkill(name: string): void {
  if (busy.value) return
  const next = new Set(selectedSkills.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selectedSkills.value = next
}

const isLocalSkill = (name: string): boolean => skills.value.some((skill) => skill.name === name)

const refSourceLabel = (ref: BundleSkillRef): string =>
  ref.source === 'skills-sh' ? ref.repo : `SkillHub · ${ref.namespace}/${ref.slug}`

async function installSelectedSkills(chosen: BundleSkillRef[]): Promise<boolean> {
  const targets: InstallTarget[] = agents.value.map((agent) =>
    scope.value === 'user'
      ? { agent, scope: 'user' }
      : { agent, scope: 'project', projectRoot: scope.value },
  )
  const failures: string[] = []
  const installedNames: string[] = []
  const roots: string[] = []
  const fetchCache = new Map<
    string,
    Awaited<ReturnType<typeof window.skillsManager.importFromGit>>
  >()

  try {
    for (const [index, skillRef] of chosen.entries()) {
      progress.value = { n: index + 1, total: chosen.length }
      try {
        const local = skills.value.find((skill) => skill.name === skillRef.name)
        if (local) {
          const missingTargets = targets.filter(
            (target) =>
              !local.installations.some(
                (installation) =>
                  installation.agent === target.agent &&
                  installation.scope === target.scope &&
                  (installation.projectRoot ?? '') === (target.projectRoot ?? ''),
              ),
          )
          if (missingTargets.length > 0) {
            const results = await installSkill(local.installations[0]!.skill, missingTargets, {
              refresh: false,
            })
            failures.push(
              ...results
                .filter((result) => !result.ok)
                .map(
                  (result) =>
                    `${skillRef.name} → ${agentLabel(result.target.agent)}: ${result.error}`,
                ),
            )
          }
          installedNames.push(skillRef.name)
          continue
        }

        let fetched: {
          root: string
          items: Awaited<ReturnType<typeof window.skillsManager.findSkillsInDir>>
        }
        if (skillRef.source === 'skills-sh') {
          const cached = fetchCache.get(skillRef.repo)
          if (cached) fetched = cached
          else {
            fetched = await window.skillsManager.importFromGit(
              `https://github.com/${skillRef.repo}`,
            )
            fetchCache.set(skillRef.repo, fetched)
            roots.push(fetched.root)
          }
        } else {
          fetched = await window.skillsManager.skillhubFetch(skillRef.slug, skillRef.namespace)
          roots.push(fetched.root)
        }

        const wanted = skillRef.source === 'skills-sh' ? skillRef.skillId : skillRef.slug
        const found = matchFoundSkill(fetched.items, wanted, skillRef.source)
        if (!found) {
          failures.push(`${skillRef.name}: ${t('market.notFound')}`)
          continue
        }
        const results = await installSkill(found.skill, targets, { refresh: false })
        failures.push(
          ...results
            .filter((result) => !result.ok)
            .map(
              (result) =>
                `${skillRef.name} → ${agentLabel(result.target.agent)}: ${result.error}`,
            ),
        )
        if (results.some((result) => result.ok)) installedNames.push(skillRef.name)
      } catch (cause) {
        failures.push(`${skillRef.name}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
  } finally {
    await Promise.allSettled(roots.map((root) => window.skillsManager.cleanupImport(root)))
    progress.value = null
  }

  const groupName = bundleText(props.bundle.name, locale.value)
  if (installedNames.length > 0) {
    const existing = groups.value.find((group) => group.name === groupName)
    groups.value = existing
      ? groups.value.map((group) =>
          group.name === groupName
            ? { ...group, skills: [...new Set([...group.skills, ...installedNames])] }
            : group,
        )
      : [...groups.value, { name: groupName, skills: installedNames }]
  }
  await refreshSkills()

  if (failures.length === 0) return true
  error.value = failures.join('；')
  if (installedNames.length > 0) {
    note.value = t('bundles.partial', { n: installedNames.length, group: groupName })
  }
  return false
}

function offerMcpUndo(): void {
  const operationIds = [...mcpOperationIds.value]
  if (operationIds.length === 0) return
  showToast(
    {
      message: t('bundles.mcpApplied', { n: appliedMcpCount.value }),
      actionLabel: t('common.undo'),
      onAction: async () => {
        const outcomes: boolean[] = []
        for (const operationId of operationIds.reverse()) {
          outcomes.push(await restore(operationId))
        }
        showToast({
          message: outcomes.every(Boolean) ? t('common.restored') : t('mcp.restoreFailed'),
        })
      },
    },
    60_000,
  )
  mcpOperationIds.value = []
}

async function finishInstallation(options: { autoClose?: boolean } = {}): Promise<void> {
  const skillSuccess =
    pendingSkills.value.length === 0 || (await installSelectedSkills(pendingSkills.value))
  pendingSkills.value = []
  mcpQueue.value = []
  offerMcpUndo()
  busy.value = false
  if (skillSuccess && (options.autoClose ?? true)) emit('close')
}

async function prepareNextMcpPlan(): Promise<void> {
  const definition = mcpQueue.value[0]
  if (!definition) {
    await finishInstallation()
    return
  }
  const plan = await planUpsert(definition, mcpTargets.value)
  if (!plan) {
    error.value = mcpError.value ?? t('bundles.mcpPlanFailed')
    mcpQueue.value = []
    offerMcpUndo()
    busy.value = false
    return
  }
  if (!plan.canApply && plan.blockers.length === 0) {
    closePlan()
    mcpQueue.value = mcpQueue.value.slice(1)
    await prepareNextMcpPlan()
  }
}

async function beginInstall(): Promise<void> {
  if (installDisabled.value) return
  error.value = null
  note.value = null
  busy.value = true
  appliedMcpCount.value = 0
  mcpOperationIds.value = []
  pendingSkills.value = props.bundle.skills.filter((skill) => selectedSkills.value.has(skill.name))
  mcpQueue.value = props.bundle.mcpServers.filter((server) => selectedMcp.value.has(server.name))
  await prepareNextMcpPlan()
}

async function executeMcpPlan(): Promise<void> {
  const result = await applyPlan()
  if (!result) {
    error.value = mcpError.value ?? t('bundles.mcpPlanFailed')
    mcpQueue.value = []
    offerMcpUndo()
    busy.value = false
    return
  }

  const succeeded = result.results.filter((item) => item.ok)
  const failed = result.results.filter((item) => !item.ok)
  if (succeeded.length > 0) {
    mcpOperationIds.value = [...mcpOperationIds.value, result.operationId]
    appliedMcpCount.value += 1
  }
  if (failed.length > 0) {
    error.value = failed.map((item) => item.error).filter(Boolean).join('；')
    mcpQueue.value = []
    offerMcpUndo()
    busy.value = false
    return
  }

  mcpQueue.value = mcpQueue.value.slice(1)
  await prepareNextMcpPlan()
}

function cancelMcpPlans(): void {
  if (applying.value) return
  closePlan()
  const skipped = mcpQueue.value.length
  mcpQueue.value = []
  // 关闭计划对话框只代表跳过剩余 MCP 步骤，已选 skills 仍然继续安装；
  // 页面保持打开并提示跳过数量，避免“什么都没装且毫无反馈”。
  void finishInstallation({ autoClose: false }).then(() => {
    if (skipped > 0 && !note.value) {
      note.value = t('bundles.mcpSkipped', { n: skipped })
    }
  })
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header
      :class="[
        'app-drag relative flex h-14 shrink-0 items-center gap-3 border-b px-6',
        props.inset && 'pl-[118px]',
      ]"
    >
      <SidebarToggle />
      <Button variant="ghost" size="icon" class="app-no-drag" @click="emit('close')">
        <ArrowLeft class="!size-5 translate-y-px" />
      </Button>
      <h1 class="text-base font-semibold leading-5 tracking-tight">
        {{ bundleText(bundle.name, locale) }}
      </h1>
      <div class="flex-1" />
      <Button
        size="sm"
        class="app-no-drag"
        :disabled="installDisabled"
        @click="beginInstall"
      >
        <template v-if="busy && progress">
          {{ t('bundles.installing', { n: progress.n, total: progress.total }) }}
        </template>
        <template v-else-if="busy">
          {{ planning ? t('bundles.preparingPlan') : t('bundles.reviewingMcp') }}
        </template>
        <template v-else>{{ t('bundles.installResources', { n: selectedCount }) }}</template>
      </Button>
    </header>

    <ScrollArea class="flex-1">
      <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
        <div
          class="flex items-start gap-4 rounded-lg border bg-card px-5 py-5"
          :style="{ backgroundImage: bundleGradient(bundle.id) }"
        >
          <span
            :class="[
              'flex size-12 shrink-0 items-center justify-center rounded-lg text-lg font-semibold text-white',
              marketIconColor(bundle.id),
            ]"
          >
            {{ marketIconGlyph(bundleText(bundle.name, locale)) }}
          </span>
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="text-xl font-bold tracking-tight">{{ bundleText(bundle.name, locale) }}</h2>
            <p class="text-sm text-muted-foreground">
              {{ bundleText(bundle.description, locale) }}
            </p>
            <span class="text-sm text-muted-foreground">
              {{ t('bundles.resourceCount', { skills: bundle.skills.length, mcp: bundle.mcpServers.length }) }}
            </span>
          </div>
        </div>

        <section v-if="bundle.skills.length" class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <Sparkles class="size-4 text-muted-foreground" />
            <h3 class="text-sm font-semibold">{{ t('bundles.skillsSection') }}</h3>
            <Badge variant="secondary">{{ bundle.skills.length }}</Badge>
          </div>
          <div class="flex flex-col gap-2">
            <div
              v-for="skill in bundle.skills"
              :key="skill.name"
              :class="[
                'flex items-center gap-2.5 rounded-md border px-3 py-2.5 transition-colors',
                busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-foreground/25',
              ]"
              role="button"
              tabindex="0"
              @click="!busy && emit('openSkill', bundleRefToMarketItem(skill))"
              @keydown.enter="!busy && emit('openSkill', bundleRefToMarketItem(skill))"
            >
              <input
                type="checkbox"
                class="size-4 accent-foreground"
                :checked="selectedSkills.has(skill.name)"
                :disabled="busy"
                @click.stop
                @change="toggleSkill(skill.name)"
              />
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {{ skill.name }}
                  <Badge v-if="isLocalSkill(skill.name)" variant="success">
                    {{ t('bundles.installedBadge') }}
                  </Badge>
                </span>
                <span class="line-clamp-1 text-sm text-muted-foreground">
                  {{ refSourceLabel(skill) }}
                </span>
              </span>
              <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
            </div>
          </div>
          <PlatformTargetPicker
            v-model:scope="scope"
            v-model:agents="agents"
            :label="t('bundles.skillTargets')"
          />
        </section>

        <BundleMcpSection
          v-if="bundle.mcpServers.length"
          v-model:selected="selectedMcp"
          v-model:targets="mcpTargets"
          :servers="bundle.mcpServers"
          :platforms="mcpPlatforms"
          :project-roots="projectRoots"
          :installed-names="installedMcpNames"
          :disabled="busy"
        />

        <div v-if="note || error" class="flex flex-col gap-2 border-t pt-4">
          <p v-if="note" class="text-sm text-amber-600 dark:text-amber-400">{{ note }}</p>
          <p v-if="error" class="break-all text-sm text-destructive">{{ error }}</p>
        </div>
      </div>
    </ScrollArea>

    <McpPlanDialog
      :plan="currentPlan"
      :applying="applying"
      @close="cancelMcpPlans"
      @apply="executeMcpPlan"
    />
  </div>
</template>
