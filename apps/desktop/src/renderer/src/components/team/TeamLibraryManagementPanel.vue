<script setup lang="ts">
import { computed, reactive, shallowRef, watch, type DeepReadonly } from 'vue'
import { Boxes, FilePlus2, FolderOpen, LibraryBig, PackagePlus, Pencil, ServerCog, Sparkles, Trash2 } from '@lucide/vue'
import type {
  TeamLibraryBundleDraft,
  TeamLibraryMcpDraft,
  TeamLibraryPolicy,
  TeamLibrarySkillDraft,
} from '../../../../shared/ipc.js'
import { teamLibraryConfigKey } from '../../../../shared/team-library.js'
import TeamBundleEditorDialog from '@/components/team/TeamBundleEditorDialog.vue'
import TeamChangeReview from '@/components/team/TeamChangeReview.vue'
import TeamMcpEditorDialog from '@/components/team/TeamMcpEditorDialog.vue'
import TeamMcpMarketDialog from '@/components/team/TeamMcpMarketDialog.vue'
import TeamSkillMarketDialog from '@/components/team/TeamSkillMarketDialog.vue'
import TeamSkillEditorDialog from '@/components/team/TeamSkillEditorDialog.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useSettings } from '@/composables/useSettings'
import { useTeamLibraryManagement } from '@/composables/useTeamLibraryManagement'
import { fetchMarketSkillSource, matchMarketSkill, type MarketItem } from '@/lib/market'

type Tab = 'skills' | 'mcp' | 'bundles' | 'policy' | 'changes'

const { teamLibraries } = useSettings()
const manager = useTeamLibraryManagement()
const activeTab = shallowRef<Tab>('skills')
const libraryKey = shallowRef(teamLibraries.value[0] ? teamLibraryConfigKey(teamLibraries.value[0]) : '')
const branchSlug = shallowRef('manage-team-library')
const skillDialogOpen = shallowRef(false)
const mcpDialogOpen = shallowRef(false)
const skillMarketOpen = shallowRef(false)
const skillMarketBusy = shallowRef(false)
const skillMarketError = shallowRef<string | null>(null)
const mcpMarketOpen = shallowRef(false)
const mcpMarketBusy = shallowRef(false)
const mcpMarketError = shallowRef<string | null>(null)
const bundleDialogOpen = shallowRef(false)
const bundleError = shallowRef<string | null>(null)
const policyScope = shallowRef('organization')
const newTeamId = shallowRef('')
const newTeamName = shallowRef('')
const editingSkill = shallowRef<TeamLibrarySkillDraft | null>(null)
const editingMcp = shallowRef<TeamLibraryMcpDraft | null>(null)
const editingBundle = shallowRef<TeamLibraryBundleDraft | null>(null)
const policy = reactive({ requiredSkills: '', requiredMcp: '', recommendedSkills: '', recommendedMcp: '', blocked: '' })

const libraryOptions = computed(() => teamLibraries.value.map((item) => ({ value: teamLibraryConfigKey(item), label: item.remoteUrl })))
const selectedConfig = computed(() => teamLibraries.value.find((item) => teamLibraryConfigKey(item) === libraryKey.value) ?? null)
const catalog = computed(() => manager.catalog.value)
const policyOptions = computed(() => [
  { value: 'organization', label: '组织规范' },
  ...(catalog.value?.manifest.teams.map((team) => ({ value: team.id, label: `团队 · ${team.name}` })) ?? []),
  { value: '__new__', label: '新建团队规范…' },
])
const existingSkillNames = computed(() => catalog.value?.skills.map((item) => item.name) ?? [])
const existingMcpNames = computed(() => catalog.value?.mcpServers.map((item) => item.name) ?? [])

watch(libraryOptions, (options) => {
  if (!options.some((option) => option.value === libraryKey.value)) libraryKey.value = options[0]?.value ?? ''
}, { immediate: true })
function loadPolicy(value: DeepReadonly<TeamLibraryPolicy>): void {
  policy.requiredSkills = value.required.skills.join('\n')
  policy.requiredMcp = value.required.mcp.join('\n')
  policy.recommendedSkills = value.recommended.skills.join('\n')
  policy.recommendedMcp = value.recommended.mcp.join('\n')
  policy.blocked = value.blocked.map((item) => `${item.ref} | ${item.versions ?? ''} | ${item.reason}`).join('\n')
}

watch([catalog, policyScope], ([value, scope]) => {
  if (!value) return
  if (scope === '__new__') {
    newTeamId.value = ''
    newTeamName.value = ''
    loadPolicy({ required: { skills: [], mcp: [] }, recommended: { skills: [], mcp: [] }, blocked: [] })
    return
  }
  loadPolicy(scope === 'organization' ? value.policy : value.teamPolicies[scope] ?? {
    required: { skills: [], mcp: [] },
    recommended: { skills: [], mcp: [] },
    blocked: [],
  })
}, { immediate: true })

function list(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

async function start(): Promise<void> {
  if (!selectedConfig.value) return
  await manager.start(selectedConfig.value, branchSlug.value)
}

async function editSkill(path: string): Promise<void> {
  if (!manager.workspace.value) return
  try {
    editingSkill.value = await window.skillsManager.teamContributionGetSkill(manager.workspace.value.id, path)
    skillDialogOpen.value = true
  } catch (cause) {
    manager.reportError(cause)
  }
}

async function saveSkill(input: TeamLibrarySkillDraft): Promise<void> {
  if (await manager.saveSkill(input)) skillDialogOpen.value = false
}

async function editMcp(path: string): Promise<void> {
  if (!manager.workspace.value) return
  try {
    editingMcp.value = await window.skillsManager.teamContributionGetMcp(manager.workspace.value.id, path)
    mcpDialogOpen.value = true
  } catch (cause) {
    manager.reportError(cause)
  }
}

async function saveMcp(input: TeamLibraryMcpDraft): Promise<void> {
  if (await manager.saveMcp(input)) mcpDialogOpen.value = false
}

function createBundle(): void {
  editingBundle.value = null
  bundleError.value = null
  bundleDialogOpen.value = true
}

async function addMarketSkill(item: MarketItem): Promise<void> {
  if (!manager.workspace.value) return
  skillMarketBusy.value = true
  skillMarketError.value = null
  let root: string | null = null
  try {
    const result = await fetchMarketSkillSource(item)
    root = result.root
    const found = matchMarketSkill(item, result.items)
    if (!found) throw new Error('市场资源中没有找到可导入的 Skill')
    if (existingSkillNames.value.includes(found.skill.name)) {
      throw new Error(`团队草稿中已存在同名 Skill：${found.skill.name}`)
    }
    const mutation = await manager.importSkill({ sourcePath: found.dir })
    if (mutation) skillMarketOpen.value = false
    else skillMarketError.value = manager.error.value
  } catch (cause) {
    skillMarketError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (root) await window.skillsManager.cleanupImport(root)
    skillMarketBusy.value = false
  }
}

async function addMarketMcp(input: TeamLibraryMcpDraft): Promise<void> {
  if (!manager.workspace.value) return
  mcpMarketBusy.value = true
  mcpMarketError.value = null
  if (existingMcpNames.value.includes(input.definition.name)) {
    mcpMarketError.value = `团队草稿中已存在同名 MCP Server：${input.definition.name}`
    mcpMarketBusy.value = false
    return
  }
  const mutation = await manager.saveMcp(input)
  if (mutation) mcpMarketOpen.value = false
  else mcpMarketError.value = manager.error.value
  mcpMarketBusy.value = false
}

function editBundle(item: NonNullable<typeof catalog.value>['bundles'][number]): void {
  editingBundle.value = { originalPath: item.path, id: item.id, name: item.name, description: item.description, version: item.version, skills: [...item.skills], mcp: [...item.mcpServers] }
  bundleError.value = null
  bundleDialogOpen.value = true
}

async function saveBundle(input: TeamLibraryBundleDraft): Promise<void> {
  bundleError.value = null
  if (await manager.saveBundle(input)) {
    bundleDialogOpen.value = false
  } else {
    bundleError.value = manager.error.value ?? '保存岗位包失败，请稍后重试'
  }
}

function closeBundleDialog(): void {
  if (manager.busy.value) return
  bundleDialogOpen.value = false
  bundleError.value = null
}

async function remove(path: string, label: string): Promise<void> {
  const confirmed = await window.skillsManager.confirmDialog({ title: `删除${label}`, message: `将从当前变更分支删除 ${path}。被岗位包引用时会同步移除该引用。`, confirmLabel: '删除', cancelLabel: '取消', danger: true })
  if (confirmed) await manager.remove(path)
}

async function savePolicy(): Promise<void> {
  const blocked = policy.blocked.split('\n').flatMap((line) => {
    const [ref, versions, reason] = line.split('|').map((item) => item.trim())
    return ref && reason ? [{ ref, ...(versions ? { versions } : {}), reason }] : []
  })
  const scope = policyScope.value
  const team = scope === 'organization'
    ? null
    : scope === '__new__'
      ? { id: newTeamId.value.trim(), name: newTeamName.value.trim() }
      : {
          id: scope,
          name: catalog.value?.manifest.teams.find((item) => item.id === scope)?.name ?? scope,
        }
  const result = await manager.savePolicy({
    ...(team ? { scope: 'team' as const, teamId: team.id, teamName: team.name } : { scope: 'organization' as const }),
    policy: {
    required: { skills: list(policy.requiredSkills), mcp: list(policy.requiredMcp) },
    recommended: { skills: list(policy.recommendedSkills), mcp: list(policy.recommendedMcp) },
    blocked,
    },
  })
  if (result && scope === '__new__') policyScope.value = newTeamId.value.trim()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="manager.restoring.value" class="rounded-md border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">
      正在恢复本地团队库草稿…
    </div>
    <div v-else-if="!manager.workspace.value" class="rounded-md border border-dashed px-5 py-8">
      <div class="flex items-start gap-3"><Boxes class="mt-0.5 size-5 text-muted-foreground" /><div><h2 class="text-sm font-semibold">管理团队资源</h2><p class="mt-1 text-sm text-muted-foreground">创建独立 Git 变更分支后，可在 SkillBuddy 中管理 Skills、MCP、岗位包和组织规范。</p></div></div>
      <div class="mt-5 grid gap-3 sm:grid-cols-2">
        <label class="grid gap-1.5 text-sm font-medium">团队库<Select v-model="libraryKey" :options="libraryOptions" /></label>
        <label class="grid gap-1.5 text-sm font-medium">分支标识<Input v-model="branchSlug" placeholder="add-security-skill" /></label>
      </div>
      <Button class="mt-4 cursor-pointer" size="sm" :disabled="manager.busy.value || !selectedConfig || !branchSlug.trim()" @click="start"><FilePlus2 />{{ manager.busy.value ? '准备中…' : '创建管理草稿' }}</Button>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
        <span class="min-w-0"><span class="flex items-center gap-2 text-sm font-medium"><code>{{ manager.workspace.value.branch }}</code><Badge variant="secondary">{{ manager.workspace.value.libraryId }}</Badge></span><span class="block truncate text-xs text-muted-foreground">所有变更仅在此草稿分支中，发布审核前不会影响团队成员。</span></span>
        <Button variant="outline" size="sm" class="cursor-pointer" @click="manager.openWorkspace"><FolderOpen />打开工作区</Button>
      </div>
      <p v-if="manager.error.value" class="break-all text-sm text-destructive">{{ manager.error.value }}</p>
      <div class="flex w-fit max-w-full flex-wrap rounded-md bg-muted p-1" role="tablist">
        <button v-for="tab in [{ id: 'skills', label: 'Skills', icon: Sparkles }, { id: 'mcp', label: 'MCP Servers', icon: ServerCog }, { id: 'bundles', label: '岗位包', icon: PackagePlus }, { id: 'policy', label: '规范', icon: Boxes }, { id: 'changes', label: '变更', icon: FilePlus2 }]" :key="tab.id" type="button" :class="['flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm', activeTab === tab.id ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground']" @click="activeTab = tab.id as Tab"><component :is="tab.icon" class="size-4" />{{ tab.label }}</button>
      </div>

      <section v-if="activeTab === 'skills'" class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted-foreground">从 Skills 市场精选统一使用的资源。</p>
          <Button size="sm" class="cursor-pointer" @click="skillMarketError = null; skillMarketOpen = true">
            <LibraryBig />从 Skills 市场添加
          </Button>
        </div>
        <p v-if="!catalog?.skills.length" class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">团队库还没有 Skills，请从 Skills 市场选择资源加入当前草稿。</p>
        <ul v-else class="divide-y overflow-hidden rounded-md border"><li v-for="item in catalog.skills" :key="item.path" class="flex items-center gap-3 px-4 py-3"><Sparkles class="size-4 text-muted-foreground" /><span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ item.name }}</span><span class="block truncate text-xs text-muted-foreground">{{ item.description || item.path }}</span></span><Badge v-if="item.version" variant="secondary">v{{ item.version }}</Badge><Button variant="ghost" size="icon" class="cursor-pointer" title="编辑" @click="editSkill(item.path)"><Pencil class="size-4" /></Button><Button variant="ghost" size="icon" class="cursor-pointer text-destructive" title="删除" @click="remove(item.path, 'Skill')"><Trash2 class="size-4" /></Button></li></ul>
      </section>

      <section v-else-if="activeTab === 'mcp'" class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted-foreground">从 MCP 市场选择统一维护的服务配置。</p>
          <Button size="sm" class="cursor-pointer" @click="mcpMarketError = null; mcpMarketOpen = true">
            <LibraryBig />从 MCP 市场添加
          </Button>
        </div>
        <p v-if="!catalog?.mcpServers.length" class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">团队库还没有 MCP Server，请从 MCP 市场选择资源加入当前草稿。</p>
        <ul v-else class="divide-y overflow-hidden rounded-md border"><li v-for="item in catalog.mcpServers" :key="item.path" class="flex items-center gap-3 px-4 py-3"><ServerCog class="size-4 text-muted-foreground" /><span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ item.name }}</span><span class="block truncate text-xs text-muted-foreground">{{ item.description || item.path }}</span></span><Badge variant="secondary">{{ item.transport }}</Badge><Button variant="ghost" size="icon" class="cursor-pointer" title="编辑" @click="editMcp(item.path)"><Pencil class="size-4" /></Button><Button variant="ghost" size="icon" class="cursor-pointer text-destructive" title="删除" @click="remove(item.path, 'MCP Server')"><Trash2 class="size-4" /></Button></li></ul>
      </section>

      <section v-else-if="activeTab === 'bundles'" class="flex flex-col gap-3"><Button size="sm" class="w-fit cursor-pointer" @click="createBundle"><PackagePlus />新增岗位包</Button><p v-if="!catalog?.bundles.length" class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">岗位包用于组合某个岗位需要的 Skills 与 MCP。</p><ul v-else class="divide-y overflow-hidden rounded-md border"><li v-for="item in catalog.bundles" :key="item.path" class="flex items-center gap-3 px-4 py-3"><PackagePlus class="size-4 text-muted-foreground" /><span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ item.name }}</span><span class="block truncate text-xs text-muted-foreground">{{ item.skills.length }} 个 Skills · {{ item.mcpServers.length }} 个 MCP</span></span><Button variant="ghost" size="icon" class="cursor-pointer" title="编辑" @click="editBundle(item)"><Pencil class="size-4" /></Button><Button variant="ghost" size="icon" class="cursor-pointer text-destructive" title="删除" @click="remove(item.path, '岗位包')"><Trash2 class="size-4" /></Button></li></ul></section>

      <section v-else-if="activeTab === 'policy'" class="grid gap-4 rounded-md border px-4 py-4"><p class="text-sm text-muted-foreground">组织规范适用于全员；团队规范由项目配置显式选择。每行填写一个资源引用，禁用规则可填写版本范围和原因。</p><label class="grid gap-1.5 text-sm font-medium">规范范围<Select v-model="policyScope" :options="policyOptions" /></label><div v-if="policyScope === '__new__'" class="grid gap-4 sm:grid-cols-2"><label class="grid gap-1.5 text-sm font-medium">团队 ID<Input v-model="newTeamId" placeholder="frontend" /></label><label class="grid gap-1.5 text-sm font-medium">团队名称<Input v-model="newTeamName" placeholder="前端团队" /></label></div><div class="grid gap-4 sm:grid-cols-2"><label class="grid gap-1.5 text-sm font-medium">必装 Skills<textarea v-model="policy.requiredSkills" rows="5" placeholder="skills/code-review&#10;skills/security-review" class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm" /></label><label class="grid gap-1.5 text-sm font-medium">必装 MCP<textarea v-model="policy.requiredMcp" rows="5" placeholder="mcp/company-docs.json" class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm" /></label><label class="grid gap-1.5 text-sm font-medium">推荐 Skills<textarea v-model="policy.recommendedSkills" rows="5" placeholder="skills/frontend-testing" class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm" /></label><label class="grid gap-1.5 text-sm font-medium">推荐 MCP<textarea v-model="policy.recommendedMcp" rows="5" placeholder="mcp/slack.json" class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm" /></label></div><label class="grid gap-1.5 text-sm font-medium">禁用规则<textarea v-model="policy.blocked" rows="5" placeholder="mcp/legacy-search.json | &lt;2.0.0 | 存在已知安全问题" class="resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm" /></label><Button class="w-fit cursor-pointer" size="sm" :disabled="manager.busy.value || (policyScope === '__new__' && (!newTeamId.trim() || !newTeamName.trim()))" @click="savePolicy">保存规范到变更</Button></section>

      <TeamChangeReview v-else :diff="manager.diff.value" :result="manager.publishResult.value" :busy="manager.busy.value" @open="manager.openWorkspace" @discard="manager.discard" @publish="manager.publish" />
    </template>

    <TeamSkillEditorDialog :open="skillDialogOpen" :initial="editingSkill" :busy="manager.busy.value" @close="skillDialogOpen = false" @save="saveSkill" />
    <TeamMcpEditorDialog :open="mcpDialogOpen" :initial="editingMcp" :busy="manager.busy.value" @close="mcpDialogOpen = false" @save="saveMcp" />
    <TeamBundleEditorDialog :open="bundleDialogOpen" :initial="editingBundle" :skills="catalog?.skills ?? []" :mcp-servers="catalog?.mcpServers ?? []" :busy="manager.busy.value" :error="bundleError" @close="closeBundleDialog" @save="saveBundle" />
    <TeamSkillMarketDialog
      :open="skillMarketOpen"
      :busy="skillMarketBusy"
      :error="skillMarketError"
      @close="!skillMarketBusy && (skillMarketOpen = false)"
      @select="addMarketSkill"
    />
    <TeamMcpMarketDialog
      :open="mcpMarketOpen"
      :busy="mcpMarketBusy"
      :error="mcpMarketError"
      :existing-names="existingMcpNames"
      @close="!mcpMarketBusy && (mcpMarketOpen = false)"
      @select="addMarketMcp"
    />
  </div>
</template>
