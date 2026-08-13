<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ChevronRight,
  Ellipsis,
  Folder,
  Pencil,
  Power,
  PowerOff,
  Trash2,
  TriangleAlert,
} from '@lucide/vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import type { AggregatedSkill } from '@skillbuddy/core'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Badge } from '@/components/ui/badge'
import { agentLabel } from '@/lib/agents'
import { pathBasename } from '@/lib/paths'
import {
  matchesSkillInstallation,
  type SkillInstallation,
} from '@/lib/skill-installations'

type SkillOrigin = NonNullable<SkillInstallation['origin']>

interface SkillTreeLeaf {
  skill: AggregatedSkill
  installations: SkillInstallation[]
  readOnly: boolean
  allDisabled: boolean
  partiallyDisabled: boolean
  hasEnabled: boolean
}

interface SkillTreeScope {
  key: string
  label: string
  title?: string
  projectFilter: string
  order: number
  skills: SkillTreeLeaf[]
}

interface SkillTreeAgent {
  id: string
  label: string
  skillCount: number
  scopes: SkillTreeScope[]
}

const props = defineProps<{
  skills: AggregatedSkill[]
  batchMode?: boolean
  groupContext?: boolean
  selectedNames: Set<string>
  busyNames: Set<string>
  currentPlatform?: string
  projectFilter?: string
  ownershipFilter?: 'managed' | 'agent'
}>()

const emit = defineEmits<{
  open: [skill: AggregatedSkill]
  edit: [skill: AggregatedSkill]
  toggleSelected: [name: string]
  toggleEnabled: [skill: AggregatedSkill, agent: string, projectFilter: string]
  removeFromGroup: [name: string]
  uninstall: [skill: AggregatedSkill, agent: string, projectFilter: string]
}>()

const { t } = useI18n()
const expandedAgents = shallowRef<Set<string>>(new Set())
const expandedScopes = shallowRef<Set<string>>(new Set())
const knownAgents = new Set<string>()
const knownScopes = new Set<string>()

function scopeIdentity(installation: SkillInstallation): {
  key: string
  label: string
  title?: string
  projectFilter: string
  order: number
} {
  const origin: SkillOrigin = installation.origin ?? installation.scope
  if (installation.scope === 'project') {
    const root = installation.projectRoot ?? installation.path
    return {
      key: `project:${root}`,
      label: t('skillTree.project', { root: pathBasename(root) }),
      title: root,
      projectFilter: root,
      order: 10,
    }
  }

  const origins: Record<Exclude<SkillOrigin, 'project'>, { label: string; order: number }> = {
    user: { label: t('skillTree.global'), order: 0 },
    plugin: { label: t('skillTree.plugin'), order: 20 },
    system: { label: t('skillTree.system'), order: 30 },
    admin: { label: t('skillTree.admin'), order: 40 },
    legacy: { label: t('skillTree.legacy'), order: 50 },
  }
  const item = origins[origin === 'project' ? 'user' : origin]
  return {
    key: origin,
    label: item.label,
    projectFilter: 'user',
    order: item.order,
  }
}

const tree = computed<SkillTreeAgent[]>(() => {
  const skillsByName = new Map(props.skills.map((skill) => [skill.name, skill]))
  const agents = new Map<
    string,
    Map<string, { meta: ReturnType<typeof scopeIdentity>; skills: Map<string, SkillInstallation[]> }>
  >()

  for (const skill of props.skills) {
    const installations = skill.installations.filter((installation) =>
      matchesSkillInstallation(installation, {
        platformId: props.currentPlatform,
        projectFilter: props.projectFilter,
        ownershipFilter: props.ownershipFilter,
      }),
    )
    for (const installation of installations) {
      const agentScopes = agents.get(installation.agent) ?? new Map()
      const meta = scopeIdentity(installation)
      const scope = agentScopes.get(meta.key) ?? { meta, skills: new Map() }
      const skillInstallations = scope.skills.get(skill.name) ?? []
      skillInstallations.push(installation)
      scope.skills.set(skill.name, skillInstallations)
      agentScopes.set(meta.key, scope)
      agents.set(installation.agent, agentScopes)
    }
  }

  return [...agents.entries()]
    .map(([id, scopes]): SkillTreeAgent => {
      const scopeItems = [...scopes.values()]
        .map(({ meta, skills }): SkillTreeScope => ({
          ...meta,
          skills: [...skills.entries()].map(([name, installations]) => {
            const skill = skillsByName.get(name)!
            const writable = installations.filter((installation) => !installation.readOnly)
            const disabled = writable.filter((installation) => installation.enabled === false).length
            return {
              skill,
              installations,
              readOnly: writable.length === 0,
              allDisabled: writable.length > 0 && disabled === writable.length,
              partiallyDisabled: disabled > 0 && disabled < writable.length,
              hasEnabled: writable.some((installation) => installation.enabled !== false),
            }
          }),
        }))
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      return {
        id,
        label: agentLabel(id),
        skillCount: new Set(scopeItems.flatMap((scope) => scope.skills.map((item) => item.skill.name)))
          .size,
        scopes: scopeItems,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
})

watch(
  tree,
  (agents) => {
    const nextAgents = new Set(expandedAgents.value)
    const nextScopes = new Set(expandedScopes.value)
    for (const agent of agents) {
      if (!knownAgents.has(agent.id)) {
        knownAgents.add(agent.id)
        nextAgents.add(agent.id)
      }
      for (const scope of agent.scopes) {
        const key = `${agent.id}:${scope.key}`
        if (knownScopes.has(key)) continue
        knownScopes.add(key)
        nextScopes.add(key)
      }
    }
    expandedAgents.value = nextAgents
    expandedScopes.value = nextScopes
  },
  { immediate: true },
)

function toggleAgent(key: string): void {
  const next = new Set(expandedAgents.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedAgents.value = next
}

function toggleScope(key: string): void {
  const next = new Set(expandedScopes.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedScopes.value = next
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border bg-background">
    <section v-for="agent in tree" :key="agent.id" class="border-b last:border-b-0">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 bg-muted/35 px-3 py-3 text-left text-base transition-colors hover:bg-muted/60"
        @click="toggleAgent(agent.id)"
      >
        <ChevronRight
          :class="[
            'size-4 shrink-0 text-muted-foreground transition-transform',
            expandedAgents.has(agent.id) && 'rotate-90',
          ]"
        />
        <PlatformIcon :id="agent.id" :size="18" />
        <span class="font-semibold">{{ agent.label }}</span>
        <span class="ml-auto text-sm tabular-nums text-muted-foreground">
          {{ t('skillTree.skillCount', { n: agent.skillCount }) }}
        </span>
      </button>

      <div v-if="expandedAgents.has(agent.id)">
        <section v-for="scope in agent.scopes" :key="scope.key" class="tree-scope">
          <button
            type="button"
            class="tree-scope-row flex w-full cursor-pointer items-center gap-2 py-2.5 pl-7 pr-8 text-left text-base transition-colors hover:bg-muted/40"
            :title="scope.title"
            @click="toggleScope(`${agent.id}:${scope.key}`)"
          >
            <ChevronRight
              :class="[
                'size-3.5 shrink-0 text-muted-foreground transition-transform',
                expandedScopes.has(`${agent.id}:${scope.key}`) && 'rotate-90',
              ]"
            />
            <Folder class="size-[18px] shrink-0 text-muted-foreground" />
            <span class="min-w-0 truncate font-medium">{{ scope.label }}</span>
            <span class="ml-auto text-sm tabular-nums text-muted-foreground">
              {{ scope.skills.length }}
            </span>
          </button>

          <div v-if="expandedScopes.has(`${agent.id}:${scope.key}`)" class="bg-muted/10">
            <div
              v-for="leaf in scope.skills"
              :key="leaf.skill.name"
              :class="[
                'tree-skill-row group flex cursor-pointer items-center gap-3 py-3 pr-3 transition-colors hover:bg-muted/40',
                props.selectedNames.has(leaf.skill.name) && 'bg-primary/5',
                leaf.allDisabled && 'opacity-60 saturate-75',
              ]"
              @click="props.batchMode ? emit('toggleSelected', leaf.skill.name) : emit('open', leaf.skill)"
            >
              <input
                v-if="props.batchMode"
                type="checkbox"
                :checked="props.selectedNames.has(leaf.skill.name)"
                :aria-label="t('batch.selectSkill', { name: leaf.skill.name })"
                class="size-4 shrink-0 cursor-pointer accent-primary"
                @click.stop
                @change.stop="emit('toggleSelected', leaf.skill.name)"
              />
              <div class="min-w-0 flex-1">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-base font-medium" :title="leaf.skill.name">
                    {{ leaf.skill.name }}
                  </span>
                  <Badge v-if="leaf.readOnly" variant="secondary" class="shrink-0 text-xs">
                    {{ t('card.readOnly') }}
                  </Badge>
                  <Badge
                    v-if="leaf.allDisabled"
                    variant="secondary"
                    class="shrink-0 text-xs text-amber-600 dark:text-amber-400"
                  >
                    {{ t('card.disabled') }}
                  </Badge>
                  <Badge
                    v-else-if="leaf.partiallyDisabled"
                    variant="secondary"
                    class="shrink-0 text-xs text-amber-600 dark:text-amber-400"
                  >
                    {{ t('card.partiallyDisabled') }}
                  </Badge>
                  <Badge
                    v-if="leaf.skill.hasDrift"
                    variant="outline"
                    class="shrink-0 gap-1 border-amber-500/40 text-xs text-amber-600 dark:text-amber-400"
                  >
                    <TriangleAlert class="size-3" />
                    {{ t('card.drift') }}
                  </Badge>
                </div>
                <p class="mt-1 truncate text-sm leading-5 text-muted-foreground">
                  {{ leaf.skill.description || t('card.noDescription') }}
                </p>
              </div>

              <span class="shrink-0 text-sm tabular-nums text-muted-foreground">
                {{ leaf.installations.length }}
              </span>
              <DropdownMenuRoot>
                <DropdownMenuTrigger as-child>
                  <button
                    type="button"
                    class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                    :aria-label="t('card.actions')"
                    @click.stop
                  >
                    <Ellipsis class="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent
                    align="end"
                    :side-offset="6"
                    class="z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none"
                    @click.stop
                  >
                    <DropdownMenuItem
                      :disabled="leaf.readOnly || props.busyNames.has(leaf.skill.name)"
                      class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent"
                      @select="emit('edit', leaf.skill)"
                    >
                      <Pencil class="size-4" />
                      {{ t('common.edit') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="!leaf.readOnly"
                      :disabled="props.busyNames.has(leaf.skill.name)"
                      class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent"
                      @select="emit('toggleEnabled', leaf.skill, agent.id, scope.projectFilter)"
                    >
                      <PowerOff v-if="leaf.hasEnabled" class="size-4" />
                      <Power v-else class="size-4" />
                      {{ t(leaf.hasEnabled ? 'detail.disable' : 'detail.enable') }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator class="my-1 h-px bg-border" />
                    <DropdownMenuItem
                      v-if="props.groupContext"
                      class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
                      @select="emit('removeFromGroup', leaf.skill.name)"
                    >
                      <Trash2 class="size-4" />
                      {{ t('groups.removeSkill') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-else
                      :disabled="leaf.readOnly || props.busyNames.has(leaf.skill.name)"
                      class="flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-2 text-sm text-destructive outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-destructive/10"
                      @select="emit('uninstall', leaf.skill, agent.id, scope.projectFilter)"
                    >
                      <Trash2 class="size-4" />
                      {{ t('skillTree.uninstall') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
            </div>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.tree-scope {
  position: relative;

  &::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 1.25rem;
    width: 1px;
    background: var(--border);
    content: '';
  }

  &:last-child::before {
    bottom: auto;
    height: 1.25rem;
  }
}

.tree-scope-row {
  position: relative;

  &::before {
    position: absolute;
    top: 50%;
    left: 1.25rem;
    width: 0.5rem;
    height: 1px;
    background: var(--border);
    content: '';
  }
}

.tree-skill-row {
  position: relative;
  padding-left: 4.5rem;

  &::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3.5rem;
    width: 1px;
    background: var(--border);
    content: '';
  }

  &::after {
    position: absolute;
    top: 50%;
    left: 3.5rem;
    width: 1rem;
    height: 1px;
    background: var(--border);
    content: '';
  }

  &:last-child::before {
    bottom: 50%;
  }
}
</style>
