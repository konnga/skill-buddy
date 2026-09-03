# 各平台 skills 目录约定（调研记录）

> 调研日期：2026-08-06 ｜ 方法：官方文档 + 公开实现核实 ｜ 供适配器实现与维护参照

**总结论**：SKILL.md 文件夹约定（目录名 = frontmatter `name`，kebab-case，
`name`/`description` 必填，可选 `scripts/` `references/` `assets/`）已成为
跨工具事实标准，五个平台全部兼容。差异只剩目录位置。

| 平台 | user 级 | project 级 | 检测 | 置信度 |
|---|---|---|---|---|
| Claude Code | `~/.claude/skills/` | `.claude/skills/` | `~/.claude` | 官方 |
| Codex | `~/.agents/skills/` | `.agents/skills/` | `~/.codex`（=$CODEX_HOME） | 官方 |
| Cursor 2.4+ | `~/.cursor/skills/` | `.cursor/skills/` | `~/.cursor` | 官方 |
| OpenCode | `~/.config/opencode/skills/` | `.opencode/skills/` | `~/.config/opencode` | 官方 |
| Pi | `~/.pi/agent/skills/` | `.pi/skills/` | `~/.pi/agent` | 官方 |
| OMP Agent（oh-my-pi） | `getAgentDir()/skills/`（默认 `~/.omp/agent/skills/`） | `.omp/skills/` | `getAgentDir()` | 官方 |
| WorkBuddy | `~/.workbuddy/skills/` | 无（桌面助手，无项目概念） | `~/.workbuddy` | 多来源一致（非官方一手） |
| GitHub Copilot | `~/.copilot/skills/` | `.github/skills/` | `~/.copilot` | 官方 |
| Gemini CLI | `~/.gemini/skills/` | `.gemini/skills/` | `~/.gemini` | 官方 |
| Qwen Code | `~/.qwen/skills/` | `.qwen/skills/` | `~/.qwen` | 官方 |
| CodeBuddy | `~/.codebuddy/skills/` | `.codebuddy/skills/` | `~/.codebuddy` | 官方 |
| Trae（国际版） | `~/.trae/skills/` | `.trae/skills/` | `~/.trae` | 官方（间接确认） |
| Trae CN | `~/.trae-cn/skills/` | `.trae/skills/` | `~/.trae-cn` | 官方社区帖 |
| 豆包 | `~/Doubao/skills/` | 无（桌面助手） | `~/Doubao` | 本机实测 |
| Kimi Code | `~/.kimi/skills/` | `.kimi/skills/` | `~/.kimi` | 待真机复核 |
| ZCode | `~/.zcode/skills/` | `.zcode/skills/` | `~/.zcode` | 待真机复核 |
| WPS 灵犀 | `<userData>/serverdir/user_skills/` | 无（桌面助手） | `<userData>` | 本机实测（macOS） |
| DeepSeek Harness | `~/.dsh/skills/` | `.dsh/skills/` | `~/.dsh` | 已确认 |
| Hermes | `~/.hermes/skills/` | `.hermes/skills/` | `~/.hermes` | 本机实测（macOS） |

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

| 来源               | 路径                                                             | 管理策略                           |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------- |
| 用户主目录         | `~/.agents/skills`                                             | 可编辑、安装和删除                 |
| 项目目录           | `<project>/.agents/skills`                                     | 可编辑、安装和删除                 |
| Codex 专属兼容目录 | `$CODEX_HOME/skills`（默认 `~/.codex/skills`）               | 只读展示，避免误写到主目录         |
| 管理员目录         | `/etc/codex/skills`                                            | 只读展示                           |
| 系统内置           | `$CODEX_HOME/skills/.system`                                   | 只读展示                           |
| 已安装插件         | `$CODEX_HOME/plugins/cache/<market>/<plugin>/<version>/skills` | 只读展示，每个插件只取最新有效版本 |

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

### Pi / OMP Agent

- Pi 与它的 fork oh-my-pi 都采用非对称目录：用户级目录包含 `agent` 段，
  项目级目录不包含该段。
- Pi 使用 `~/.pi/agent/skills/` 与 `<repo>/.pi/skills/`；OMP Agent 使用
  `<getAgentDir()>/skills/` 与 `<repo>/.omp/skills/`。
- Pi 还会读取用户级和项目级 `.agents/skills/`；SkillBuddy 将其作为 Pi 的只读
  共享来源展示，避免覆盖 Codex 等平台共用的目录内容。
- OMP 用户级安装目标由 `getAgentDir()` 决定；named profile 使用
  `~/.omp/profiles/<profile>/agent/skills/`，默认 profile 仍使用
  `~/.omp/agent/skills/`。
- OMP 的只读来源覆盖用户级 `.agent[s]`、Claude、Codex、Pi、OpenCode、managed
  Skills，以及项目级 `.agent[s]`、Claude、Codex、Pi、OpenCode、GitHub Skills。
- OMP 同时读取启用的 Claude/OMP marketplace 插件和 OMP extension 包的
  `skills/`；项目插件保留项目作用域，显式禁用的插件不会显示。
- 自动检测跟随 Pi 的 `~/.pi/agent` 和 OMP 当前 profile 的 `getAgentDir()`；两者均
  使用标准 `SKILL.md` 目录格式。

### WorkBuddy（腾讯 CodeBuddy 产品线桌面助手）

- 官方文档只讲界面操作不写路径；`~/.workbuddy/skills/` 来自多个独立
  中文教程（腾讯云社区/苏米客/CSDN），一致但非一手
- 部分公开实现写入 `~/.workbuddy/skills-marketplace/skills`
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

### ZCode

- 内置目录暂按 ZCode CLI 的 home/workspace 命名接入：
  `~/.zcode/skills/` 与 `.zcode/skills/`
- 当前环境未安装 ZCode，需在真机上复核自动检测与安装后可见性

### Hermes Agent

- 用户级目录为 `~/.hermes/skills/`，项目级目录为 `.hermes/skills/`。
- Hermes 会按主题分类嵌套组织 Skill，例如
  `software-development/systematic-debugging/SKILL.md`。SkillBuddy 使用专用适配器
  递归发现这些目录，而不是只扫描 `skills/` 的直接子目录。
- 新安装的 Skill 默认写入 `skills/<name>/`；已有嵌套 Skill 的启停与卸载会定位到
  它的实际目录。

### WPS 灵犀
- Electron 桌面助手，技能目录挂在 `app.getPath('userData')` 下，
  因此路径随操作系统变化。`PlatformDef` 的 `userSkillsDirByOs` /
  `detectPathByOs` 就是为这类平台加的：
  - macOS `~/Library/Application Support/WPS 灵犀/serverdir/user_skills/`
  - Windows `~/AppData/Roaming/WPS 灵犀/serverdir/user_skills/`
  - Linux `~/.config/WPS 灵犀/serverdir/user_skills/`
- `serverdir` 下共有三个目录，分工由 sandbox 进程的启动参数
  （`--official-skills-dir` / `--user-skills-dir` / `--target-skills-dir`）确定：
  - `user_skills/` 可写，用户自装技能，SkillBuddy 的安装目标
  - `official_skills/` 是指向 app sandbox 内置技能的符号链接，随版本更新，
    SkillBuddy 作为 system 来源只读展示（见 `discoverLingxiSupplementalRoots`）
  - `target_skills/` 是 sandbox 自己维护的符号链接农场，表示「已启用」，
    SkillBuddy 不写入
- 技能开关走 `disabled_local_skills` 黑名单，因此放进 `user_skills/` 的技能
  默认即为启用，不需要额外注册
- SKILL.md 约定与其他平台一致（目录名 = frontmatter `name`，`name`/`description`
  必填，支持 `scripts/` `references/`）
- MCP 侧未接入：灵犀的「连接器」在 UI 里粘贴标准 `mcpServers` JSON 后存入应用
  内部（`config.json` 非明文，`local-db` 只有更新记录库），没有可安全读写的
  明文配置文件
- macOS 为本机实测（1.2.36 / sandbox 3.23.0）；Windows 与 Linux 按 Electron
  userData 惯例推断，待真机复核

## 跨平台聚合的两个推论

1. **`.agents/skills` 是共享目录**：Codex 主用、Cursor/OpenCode 兼容读。
   往这里装一份 = 多端可见。未来可作为「一次安装、多端生效」的优化路径
   （MVP 先按各平台主目录分别安装，行为可预期）
2. **去重必须按内容而非路径**：Cursor/OpenCode 会读 `~/.claude/skills`，
   同一 skill 会在多个 agent 的 list 结果中出现。聚合层需按 name+内容 hash
   识别「同一份安装被多端看见」vs「多端各有一份拷贝」

## WPS 灵犀桌面端（版本 1.2.36 / sandbox 3.23.0）

> 调研日期：2026-08-25。证据来源：`D:\app\lingxi-desktop` 安装包、解包后的
> Electron 主进程代码，以及本机运行后生成的 `%APPDATA%\WPS 灵犀` 目录。灵犀没有
> 公开的项目级 skills 目录约定；以下结论以本机实现为准，升级版本后应复核。

### 目录与作用域

灵犀使用 Electron `app.getPath("userData")` 作为根目录。在 Windows 下，实际根目录为：

```text
%APPDATA%\WPS 灵犀\
├── serverdir\
│   ├── user_skills\       # 用户可管理的 Skill，唯一写入目标
│   ├── official_skills\   # 当前 sandbox 的官方 Skill（目录联结）
│   ├── target_skills\     # 运行态 Skill 目录，指向上面两类来源
│   ├── memory\            # 灵犀记忆文件，不属于 Skill
│   └── sandbox.pid
├── sandbox_<version>\skills\ # 版本化 sandbox 内置 Skill
└── sandbox_link\            # 当前 sandbox 的目录联结
```

- 用户级目录：`%APPDATA%\WPS 灵犀\serverdir\user_skills`。
- 官方目录：`serverdir\official_skills` 实际联结到当前版本的
  `sandbox_<version>\skills`，例如本机为 `sandbox_3.23.0\skills`。
- 运行态目录：`serverdir\target_skills` 下每个 Skill 是 junction（Windows）或
  symlink（其他平台），指向用户目录或官方目录。适配器应把它视为运行缓存/投影，
  不应直接写入或删除。
- 未发现项目级 `.lingxi/skills`、工作区级 `skills` 或类似目录。项目会话虽然把
  workspace 信息传给 agent，但内置 `getSkills` 仍从全局 `user_skills` 与
  `official_skills` 合并，不能据此推断存在项目级安装范围。

### Skill 文件格式

每个 Skill 必须是一个目录，且目录内必须有大小写不敏感匹配的 `SKILL.md`：

```text
<skill-id>/
└── SKILL.md              # 必需
    ├── YAML frontmatter  # 必需 name、description
    └── Markdown 正文
    ├── scripts/          # 可选，任意资源目录均可
    ├── references/
    └── assets/
```

- 灵犀主进程只解析 frontmatter 中的 `name` 与 `description`；支持单行值以及
  `|`/`>` 多行值。缺少任一字段时，文件安装会失败。
- 目录名是内部 `skillId`，安装文件时由调用方的 `skillName` 规范化：转小写，
  非 `[a-z0-9._-]` 字符替换为 `-`，连续 `-` 合并并去除首尾 `-`。压缩包安装则
  以 frontmatter `name` 生成同样的目录标识。建议 SkillBuddy 直接要求 kebab-case，
  以免跨平台名称漂移。
- 资源文件不会被重新编码或过滤，安装时会递归复制整个 Skill 目录；因此应保留
  `scripts/`、`references/`、`assets/` 等相对路径。
- `.installed.json` 不是通用 Skill 元数据，只在市场安装时写入，字段包括
  `id`、`skill_name`、`version`、`source: "market"`、包哈希和安装时间。普通用户
  Skill 不需要生成该文件。

### 发现、覆盖与优先级

灵犀分别扫描 `user_skills` 和 `official_skills` 下的一级子目录，仅纳入包含
`SKILL.md` 的目录，然后合并结果：

1. 用户目录先加入列表；同一 `id` 时用户项遮蔽官方项。
2. 官方目录补充用户目录没有的项。
3. 列表可按本地存储的 disabled id 过滤；技能的启停状态不通过改名或移动
   `SKILL.md` 表示。
4. 同名判断大小写不敏感，市场安装与用户安装也共享冲突检查；默认不覆盖，显式
   `overwrite` 才执行覆盖。

官方 Skill 不允许直接移除。若用户覆盖同名官方 Skill，灵犀会把用户版本放入
`user_skills`，并在 `target_skills` 创建指向用户版本的联结；删除用户版本后再恢复
指向官方版本的联结。

### 启用、禁用与删除

- 启停状态保存于 Electron 持久化存储中的 `disabledSkillIds`（按 `skillId` 保存），
  不是 Skill 目录内的标记文件。`SkillsSetEnabled` 修改该集合；创建会话时仅把未禁用
  的 Skill 注入 `env.skills.list`。
- 删除只针对用户目录中的 Skill，并通过系统回收站接口移入回收站；删除前会清理
  `target_skills` 的运行态联结，删除后移除来源映射。适配器不应使用不可恢复的递归删除。
- 官方 Skill、系统 sandbox 内容和 `target_skills` 均应按只读/派生来源展示。

### 安装、导入与打包行为

- 文件安装接口要求输入 `skillName` 和文件列表，列表中必须存在 `SKILL.md`；会检查
  frontmatter 的 `name`、`description`，拒绝 `..` 或绝对路径，随后写入 `user_skills`。
- ZIP 导入只接受 `.zip`。解压后递归寻找 `SKILL.md`（若有多个，选择路径最浅的一份），
  读取 frontmatter 后复制整个 Skill 目录。默认遇到同名 Skill 报冲突，覆盖安装使用
  原子临时目录替换。
- 灵犀打包 Skill 时把目录作为 ZIP 根目录（例如 `<skill-id>/SKILL.md`）；从任意文件夹
  打包前会要求该文件夹根部存在 `SKILL.md`。SkillBuddy 导出给灵犀时应采用这一结构，
  不要只压缩 `SKILL.md` 文件本身。
- 市场安装可额外保存 `.installed.json`，SkillBuddy 若不是在模拟灵犀市场安装，建议
  不写入市场字段，避免被误判为可更新的市场项。

### SkillBuddy 适配建议

| 项目           | 建议实现                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| 平台标识       | `lingxi`（显示名：WPS 灵犀）                                                                                  |
| 检测           | 检查 `%APPDATA%\WPS 灵犀` 或其 `serverdir`，并优先确认 `serverdir\user_skills` / `official_skills` 存在 |
| user scope     | `%APPDATA%\WPS 灵犀\serverdir\user_skills`，可安装、启停、移除                                                |
| project scope  | 不提供；灵犀本机实现未发现项目级 Skill 目录                                                                     |
| read-only 来源 | `serverdir\official_skills`、版本化 `sandbox_*\skills`、`serverdir\target_skills`                         |
| 解析规则       | 目录一级扫描；要求 `SKILL.md`；frontmatter 至少 `name`、`description`                                     |
| 启停           | 通过平台专用状态存储不可见地控制；若无法安全读写 Electron store，至少提供只读展示并禁用启停按钮                 |
| 删除           | 仅允许 user scope；优先移入回收站，不直接删除                                                                   |
| 去重           | user 同名覆盖 official；聚合视图按 `skillId`/规范化 name 去重，同时保留来源与真实路径                         |
| 导出           | ZIP 根目录包含 Skill 目录，目录中包含 `SKILL.md` 及全部相对资源                                               |

**适配边界**：当前结论来自已安装的 WPS 灵犀桌面端实现，不代表 WPS 云端灵犀、
其他操作系统或未来版本。首次接入建议先实现 user scope 的扫描、安装、导出和只读官方
展示；启停状态存储和运行态 junction 管理应在真机回归后再开放写操作。
