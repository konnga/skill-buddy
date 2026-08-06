# MVP 功能规格 — 桌面端可视化管理

> 版本：v0.2 ｜ 对应 PRD v0.2 Phase 1 ｜ 状态：待评审
> v0.2 变更：编辑闭环升 P0、新增「新建 skill」与自定义路径、适配器序列加入 cursor

设计原则见 [PRD §4](./PRD.md)：心智模型一句话、单一状态源、概念做减法、
破坏性操作可预览。UI 质感是明面差异化主张——每个界面出手前先问
「比竞品清爽在哪」。

## 1. 信息架构

```
┌──────────┬────────────────────────────────────────┐
│ 侧边栏    │  主区域                                 │
│          │                                        │
│ 全部     │  [搜索框] [scope/漂移 筛选] [+新建] [导入] │
│ ──────   │                                        │
│ 按平台    │  skill 卡片网格（按 skill 聚合）         │
│  Claude  │   ├ 名称、描述、tags                    │
│  Codex   │   ├ 已安装平台徽标（多端状态一眼可见）    │
│  OpenCode│   ├ scope 徽标 ／ 漂移警示徽标           │
│  …       │   └ hover 快捷操作：安装到… / 打开       │
│ ──────   │                                        │
│ 设置     │  点击卡片 → 详情抽屉                     │
└──────────┴────────────────────────────────────────┘
```

**核心视图**：按 skill 聚合——同名 skill 的多端安装合并为一张卡片，
徽标显示装在哪些 agent。用户心智模型：「我的 skills 装在哪、还要装到哪」。
不向用户暴露任何内部机制概念（无「中央库」「工作区」「分发模式」）。

## 2. 页面与功能

### 2.1 主列表页

- 数据：`scanInstalledSkills()` → 按 name 聚合，内容 hash 判漂移
- 搜索：name / description / tags 模糊匹配（本地即时）
- 筛选：agent 平台（侧边栏）、scope、状态（漂移/正常）
- 排序：名称 / 最近修改
- 空状态：未检测到 agent → 引导页（支持的平台 + 检测路径 + 自定义路径入口）

### 2.2 Skill 详情（抽屉式）

- 头部：name、version、tags、多端安装徽标（含漂移警示）
- 正文：Markdown 渲染（Shiki 代码高亮）；附属文件树，点击预览
- 操作：
  - **安装到…**：勾选目标 agent + scope → adapter 安装 → 徽标即时更新
  - **编辑**：frontmatter 表单 + CodeMirror Markdown 源码，保存回写；
    装在多端时询问「同步修改到其他端？」
  - **卸载**：勾选从哪些端移除，展示将删除的路径（可预览），确认执行
  - **在 Finder 中显示**
- 漂移：各端 diff 视图 → 选基准端 →「同步到其他端」

### 2.3 新建 skill（P1）

- 入口：主列表「+ 新建」
- 流程：填 name/description/tags（表单校验 kebab-case 等约定）→
  生成 SKILL.md 脚手架 → 进入编辑器 → 选择安装目标（至少一个 agent + scope）

### 2.4 导入（P1）

- 本地文件夹拖拽 / Git URL
- 流程：解析 → 预览（名称/描述/内容/文件清单）→ 选目标 agent + scope → 安装

### 2.5 设置

- **各 agent 目录路径**：展示检测结果与实际路径；支持自定义覆盖
  （应对私有工具、非标准安装、约定变更——检测失败的兜底，竞品重灾区）
- 主题：跟随系统 / 亮 / 暗
- 语言：中文 / English（文案先中文，i18n 架子留好）

## 3. 关键交互流程

### 流程 A：跨端安装（核心流程）

```
选中 skill（装在 claude-code）→「安装到…」
→ 弹窗列出检测到的平台（codex ✓、opencode ✓；未检测到的置灰并附原因）
→ 选 codex + user scope → 确认
→ core: 读 canonical → CodexAdapter.install → 幂等覆盖
→ 卡片徽标即时更新
```

验收：目标端可正常识别加载；重复安装幂等；失败给出可行动的错误信息。

### 流程 B：漂移检测与同步

```
扫描时同名 skill 算内容 hash → 不一致 → 卡片「漂移」徽标
→ 详情展示各端 diff（含修改时间）→ 选基准端 →「同步到其他端」
→ 同步前预览将被覆盖的内容 → 执行 → 全端一致
```

### 流程 C：编辑保存

```
详情 → 编辑 → frontmatter 表单 / Markdown 源码
→ 保存 → 回写该端原生格式
→ 装在多端 → 询问「同步修改到其他端？」（默认勾选，可取消）
```

## 4. MVP 适配器范围

| 平台 | 优先级 | 依据 |
|---|---|---|
| Claude Code | 已完成首版 | SKILL.md + frontmatter，规范公开 |
| Codex | P0 | AGENTS.md / prompts，规范公开 |
| OpenCode | P0 | command / AGENTS.md，规范公开 |
| Cursor | P1 | 用户体量大（竞品 16 平台之首） |
| Trae / CodeBuddy / WorkBuddy | P2 | 需逐个调研目录约定后排期 |

每个 adapter 交付标准：detect / list / install / uninstall +
真实样本 fixtures 的双向转换单测。**质量红线：宁可少支持，
不可「识别不到」**（竞品 #343/#345 类问题是我们的反面清单）。

## 5. 技术依赖（已定型）

Electron + Vue 3 + TS ｜ Reka UI + Tailwind v4 + shadcn-vue 约定 ｜
TanStack Table（列表视图）｜ CodeMirror 6（编辑器）｜ markdown-it + Shiki（渲染）

## 6. 验收清单（MVP Done 的定义）

- [ ] 冷启动 ≤ 3 秒完成扫描并渲染全部 skills
- [ ] claude-code / codex / opencode 三端 detect + list + install + uninstall 可用
- [ ] 自定义路径覆盖可用（检测失败的兜底路径）
- [ ] 任一 skill 可跨端安装且目标端正常加载；重复安装幂等
- [ ] 同名 skill 漂移可发现、diff 可看、可选基准一键同步（同步前有预览）
- [ ] 详情页 Markdown 渲染；编辑保存回写；多端同步询问
- [ ] 卸载有路径预览与确认
- [ ] 暗色模式、空状态、错误态完整；错误信息可行动
- [ ] core 适配器单测覆盖（每个 adapter 有 fixtures 往返测试）
