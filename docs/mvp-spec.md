# MVP 功能规格 — 桌面端可视化管理

> 版本：v0.1 草稿 ｜ 对应 PRD Phase 1 ｜ 状态：待评审

## 1. 信息架构

```
┌──────────┬────────────────────────────────────────┐
│ 侧边栏    │  主区域                                 │
│          │                                        │
│ 全部     │  [搜索框] [scope 筛选] [重新扫描]        │
│ ──────   │                                        │
│ 按平台    │  skill 卡片网格 / 列表                  │
│  Claude  │   ├ 名称、描述、tags                    │
│  Codex   │   ├ 已安装平台徽标（多端状态一眼可见）    │
│  OpenCode│   └ scope 徽标                          │
│  …       │                                        │
│ ──────   │  点击卡片 → 详情抽屉/页                  │
│ 设置     │                                        │
└──────────┴────────────────────────────────────────┘
```

**核心视图转变**（相对当前实现）：列表不再「按 agent 分组罗列安装实例」，而是
**按 skill 聚合**——同名 skill 的多端安装合并为一张卡片，徽标显示它装在哪些
agent。这是「打破平台差异」在 UI 上的直接表达。

## 2. 页面与功能

### 2.1 主列表页

- 数据：`scanInstalledSkills()` 聚合去重（按 name 聚合，内容 hash 判断漂移）
- 搜索：name / description / tags 模糊匹配（本地即时）
- 筛选：agent 平台（侧边栏）、scope（user/project）、状态（有漂移/正常）
- 排序：名称 / 最近修改
- 空状态：未检测到任何 agent → 引导页（显示支持的平台列表与检测路径）

### 2.2 Skill 详情（抽屉式）

- 头部：name、version、tags、多端安装状态徽标
- 正文：SKILL.md 的 Markdown 渲染（代码块高亮）
- 附属文件：文件树列表，点击查看
- 操作：
  - **安装到…**：勾选目标 agent + scope → 调 adapter 转换安装
  - **编辑**：切换到编辑模式（CodeMirror，frontmatter 表单 + Markdown 源码）
  - **卸载**：选择从哪些端卸载；全选即彻底移除
  - **在 Finder/文件管理器中显示**
- 漂移提示：多端内容不一致时显著提示，提供「以某端为准同步到其他端」

### 2.3 导入

- 入口：主列表页「+ 导入」
- 来源：本地文件夹（拖拽）/ Git URL（Phase 1.5，可延后）
- 流程：解析 → 预览（名称/描述/内容）→ 选择目标 agent + scope → 安装

### 2.4 设置

- 各 agent 的目录路径展示与自定义覆盖
- 主题：跟随系统 / 亮 / 暗
- 语言：中文 / English（文案先做中文，i18n 架子留好）

## 3. 关键交互流程

### 流程 A：跨端安装（核心流程）

```
选中 skill（当前装在 claude-code）
→ 点「安装到…」
→ 弹窗列出已检测到的其他平台（codex ✓、opencode ✓，未检测到的置灰）
→ 选 codex + user scope → 确认
→ core: ClaudeCodeAdapter.list 得到 canonical → CodexAdapter.install
→ 卡片徽标即时更新（claude-code + codex）
```

验收：转换后在 codex 端可被正常识别加载；重复安装为幂等覆盖并提示。

### 流程 B：漂移检测与同步

```
扫描时对同名 skill 计算内容 hash
→ 不一致 → 卡片标「漂移」徽标
→ 详情页展示各端 diff（版本/修改时间）
→ 用户选基准端 →「同步到其他端」→ 全端一致
```

### 流程 C：编辑保存

```
详情 → 编辑 → 修改 frontmatter（表单）或正文（编辑器）
→ 保存 → 回写该端原生格式
→ 若该 skill 装在多端 → 询问「同步修改到其他端？」
```

## 4. MVP 适配器范围

| 平台 | 优先级 | 依据 |
|---|---|---|
| Claude Code | 已完成 | 规范公开（SKILL.md + frontmatter） |
| Codex | P0 | 规范公开（AGENTS.md / prompts） |
| OpenCode | P0 | 规范公开（command / AGENTS.md） |
| Trae / CodeBuddy / WorkBuddy | P1 | 需逐个调研目录约定后排期 |

每个 adapter 交付标准：detect / list / install / uninstall 四个能力 +
双向转换的单元测试（真实样本 fixtures）。

## 5. 技术依赖（已定型）

Electron + Vue 3 + TS ｜ Reka UI + Tailwind v4 + shadcn-vue 约定 ｜
TanStack Table（列表视图）｜ CodeMirror 6（编辑器）｜ markdown-it + Shiki（渲染）

## 6. 验收清单（MVP Done 的定义）

- [ ] 冷启动 ≤ 3 秒完成扫描并渲染全部 skills
- [ ] claude-code / codex / opencode 三端 detect + list + install + uninstall 可用
- [ ] 任一 skill 可跨端安装且目标端正常加载
- [ ] 同名 skill 漂移可发现、可一键同步
- [ ] 详情页 Markdown 渲染 + 编辑保存回写
- [ ] 暗色模式、空状态、错误态完整
- [ ] core 适配器单测覆盖（每个 adapter 有 fixtures 往返测试）
