# 各平台 skills 目录约定（调研记录）

> 调研日期：2026-08-06 ｜ 方法：官方文档 + 竞品源码核实 ｜ 供适配器实现与维护参照

**总结论**：SKILL.md 文件夹约定（目录名 = frontmatter `name`，kebab-case，
`name`/`description` 必填，可选 `scripts/` `references/` `assets/`）已成为
跨工具事实标准，五个平台全部兼容。差异只剩目录位置。

| 平台 | user 级 | project 级 | 检测 | 置信度 |
|---|---|---|---|---|
| Claude Code | `~/.claude/skills/` | `.claude/skills/` | `~/.claude` | 官方 |
| Codex | `~/.agents/skills/` | `.agents/skills/` | `~/.codex`（=$CODEX_HOME） | 官方 |
| Cursor 2.4+ | `~/.cursor/skills/` | `.cursor/skills/` | `~/.cursor` | 官方 |
| OpenCode | `~/.config/opencode/skills/` | `.opencode/skills/` | `~/.config/opencode` | 官方 |
| WorkBuddy | `~/.workbuddy/skills/` | 无（桌面助手，无项目概念） | `~/.workbuddy` | 多来源一致（非官方一手） |
| GitHub Copilot | `~/.copilot/skills/` | `.github/skills/` | `~/.copilot` | 官方 |
| Gemini CLI | `~/.gemini/skills/` | `.gemini/skills/` | `~/.gemini` | 官方 |
| CodeBuddy | `~/.codebuddy/skills/` | `.codebuddy/skills/` | `~/.codebuddy` | 官方 |
| Trae（国际版） | `~/.trae/skills/` | `.trae/skills/` | `~/.trae` | 官方（间接确认） |
| Trae CN | `~/.trae-cn/skills/` | `.trae/skills/` | `~/.trae-cn` | 官方社区帖 |
| 豆包 | `~/Doubao/skills/` | 无（桌面助手） | `~/Doubao` | 本机实测 |
| Kimi Code | `~/.kimi/skills/` | `.kimi/skills/` | `~/.kimi` | 待真机复核 |
| Z Code | `~/.zcode/skills/` | `.zcode/skills/` | `~/.zcode` | 待真机复核 |

## 平台备注

### Codex（developers.openai.com/codex/skills）
- 官方扫描顺序 repo → user → admin(`/etc/codex/skills`) → system；
  **用跨工具共享目录 `.agents/skills`**，社区教程里的 `~/.codex/skills`
  不是当前推荐的用户创作目录，但 Codex 运行时仍会在 `$CODEX_HOME/skills`
  保存兼容和系统 Skill
- 可选 Codex 专属元数据放 `agents/openai.yaml`（display_name、icon、
  allow_implicit_invocation 等），不进 frontmatter
- custom prompts（`~/.codex/prompts/*.md`）已被官方标记 deprecated
- 已知 bug：桌面 App 有时不注入全局 AGENTS.md（openai/codex#27705）

#### SkillBuddy 的 Codex 本机发现范围

官方推荐的可写目录仍是 `~/.agents/skills` 和项目 `.agents/skills`，但作为
本机管理器，SkillBuddy 还需要展示 Codex 运行时已经加载的其他来源：

| 来源 | 路径 | 管理策略 |
|---|---|---|
| 用户主目录 | `~/.agents/skills` | 可编辑、安装和删除 |
| 项目目录 | `<project>/.agents/skills` | 可编辑、安装和删除 |
| Codex 专属兼容目录 | `$CODEX_HOME/skills`（默认 `~/.codex/skills`） | 只读展示，避免误写到主目录 |
| 管理员目录 | `/etc/codex/skills` | 只读展示 |
| 系统内置 | `$CODEX_HOME/skills/.system` | 只读展示 |
| 已安装插件 | `$CODEX_HOME/plugins/cache/<market>/<plugin>/<version>/skills` | 只读展示，每个插件只取最新有效版本 |

不得递归扫描 `$CODEX_HOME/.tmp`、`vendor_imports` 或 marketplace 源目录，
这些目录包含暂存、未安装和重复副本。

### Claude Code 插件来源

Claude Code 的 `~/.claude/skills` 和项目 `.claude/skills` 保持可管理。插件
Skill 必须依据 `~/.claude/plugins/installed_plugins.json` 中的 `installPath`
发现，并扫描 `<installPath>/skills`；`~/.claude/plugins/marketplaces` 是目录源，
包含大量未安装插件，不能作为本机已安装 Skill 扫描。

### Cursor（cursor.com/docs/skills，2.4 changelog）
- skills 是 rules/commands 的官方后继（内置 `/migrate-to-skills`）
- 兼容回退读取：`.agents/skills`、`.claude/skills`、`.codex/skills`
  （user 级同理）——**同一份 skill 可能被多端各自发现**，聚合视图需按
  内容去重而非只按路径
- 可选 frontmatter：`paths`（glob 自动附加）、`disable-model-invocation`
- `.cursor/rules/*.mdc` 仍可用；user rules 在应用设置里，无文件系统写入面

### OpenCode（opencode.ai/docs/skills）
- 也兼容读取 `.claude/skills` 与 `.agents/skills`（同上聚合去重问题）
- frontmatter 约束最严格：name 1-64 字符 `^[a-z0-9]+(-[a-z0-9]+)*$`
  且必须与目录名一致；description 1-1024
- 目录命名复数为标准（`skills/` `commands/` `agents/`），单数是兼容遗留

### WorkBuddy（腾讯 CodeBuddy 产品线桌面助手）
- 官方文档只讲界面操作不写路径；`~/.workbuddy/skills/` 来自多个独立
  中文教程（腾讯云社区/苏米客/CSDN），一致但非一手
- 竞品 skills-manager 写入 `~/.workbuddy/skills-marketplace/skills`
  （其源码 tool_adapters.rs），与所有教程不一致——疑为其 issue #343
  「WorkBuddy 识别不到」的根因。**我们采用教程一致的 `~/.workbuddy/skills/`，
  待有真机后实测验证**
- 单一来源提到 frontmatter 需 `agent_created: true` WorkBuddy 才能后续
  修改该 skill——未采信（单来源），待实测后决定是否写入

### GitHub Copilot（docs.github.com，2026-04 agent mode 铺开 / 2026-07 code review GA）
- `.github/skills/` 是 CLI / agent mode / code review 全线识别的项目级路径；
  VS Code 额外兼容读 `.agents/skills` 与 `.claude/skills`
- user 级 `~/.copilot/skills/`（COPILOT_HOME 可覆盖根目录）
- instructions 体系（copilot-instructions.md / *.instructions.md）与
  prompt files 并存，官方已提供向 skills 的迁移引导

### Gemini CLI（google-gemini/gemini-cli docs）
- 原生 `~/.gemini/skills/` 与 `.gemini/skills/`，同层级 `.agents/skills`
  别名优先；skills 激活需用户 consent、workspace 需 `/trust`
- 另有 commands（TOML）与 extensions 体系；GEMINI.md 三层拼接

### CodeBuddy（codebuddy.ai/docs/cli/skills，官方）
- `~/.codebuddy/skills/` 与 `.codebuddy/skills/`，项目级同名优先
- frontmatter 扩展字段最多（allowed-tools / context: fork / hooks 等），
  基础 name/description 与标准一致；**不**自动读 `.claude/skills`
  （官方策略是格式兼容：复制进来即可用）
- 记忆文件用 CODEBUDDY.md

### Trae（docs.trae.ai/ide/skills）
- 国际版 `~/.trae/skills/`；**国内版独立目录 `~/.trae-cn/`**（两行数据分开管理）
- project 级 `.trae/skills/`（IDE 自动生成），禁用状态在 `.trae/skill-config.json`
- 官方支持读 `.agents/skills/`（同名时 `.trae/skills/` 优先）
- frontmatter 仅 name/description，最简
- 注意：开源的 trae-agent CLI 是另一套配置体系，不要混用

### 豆包
- macOS 桌面端在用户选择的本地工作区下创建 `~/Doubao/skills/`，本机
  实测可确认该路径
- 豆包内部工作区的 `.skills/` 为应用内置 Skill，不作为 SkillBuddy 的
  可写安装目标；SkillBuddy 会将其作为 system 来源只读展示
- 桌面助手没有稳定的项目级目录约定，因此只开放 user scope

### Kimi Code
- 内置目录暂按 Kimi Code CLI 的 home/workspace 命名接入：
  `~/.kimi/skills/` 与 `.kimi/skills/`
- 当前环境未安装 Kimi Code，需在真机上复核自动检测与安装后可见性

### Z Code
- 内置目录暂按 Z Code CLI 的 home/workspace 命名接入：
  `~/.zcode/skills/` 与 `.zcode/skills/`
- 当前环境未安装 Z Code，需在真机上复核自动检测与安装后可见性

## 跨平台聚合的两个推论

1. **`.agents/skills` 是共享目录**：Codex 主用、Cursor/OpenCode 兼容读。
   往这里装一份 = 多端可见。未来可作为「一次安装、多端生效」的优化路径
   （MVP 先按各平台主目录分别安装，行为可预期）
2. **去重必须按内容而非路径**：Cursor/OpenCode 会读 `~/.claude/skills`，
   同一 skill 会在多个 agent 的 list 结果中出现。聚合层需按 name+内容 hash
   识别「同一份安装被多端看见」vs「多端各有一份拷贝」
