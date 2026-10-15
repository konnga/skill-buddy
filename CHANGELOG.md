# Changelog

All notable changes to SkillBuddy are documented in this file.

## 0.1.14 - 2026-10-15

### Added

- Added DeepSeek Harness support: Skill directories, AI instruction rules, and residue detection for a removed app.
- Added a close button to the Skill parse-failure banner; it comes back when the failing files change.

### Improved

- Bundled formula and diagram rendering.
- Ordered platforms alphabetically.
- The interface language now follows the system locale.

### Fixed

- Fixed the Windows renderer crash when opening a Skill detail page.

---

### 新增

- 新增 DeepSeek Harness 支持，技能目录、指令规则，以及应用卸载后的残留检测。
- 解析失败提示新增关闭按钮；失败文件变化时重新出现。

### 优化

- 内置公式与图表解析。
- 平台按照字母顺序排序。
- 界面语言跟随系统语言。

### 修复

- 修复 Windows 上打开技能详情页导致渲染进程崩溃的问题。

## 0.1.13 - 2026-09-12

### Added

- Added residual-data cleanup for supported uninstalled agents, with directory selection, confirmation, and removal to the system trash.

### Improved

- Added conservative installation detection, including macOS Bundle ID lookup for applications installed outside default locations.
- Restricted cleanup to trusted built-in platform metadata and protected shared directories using resolved filesystem paths.
- Standardized cleanup tooltips in the sidebar and platform settings.

### Fixed

- Fixed partial cleanup retries resubmitting already removed directories, and prevented conflicting actions while cleanup is running.
- Fixed long instruction-directory paths overlapping the file count in the directory selector.

---

### 新增

- 新增受支持 Agent 卸载后的残留数据清理，支持目录选择、确认后移入系统废纸篓。

### 优化

- 采用保守的安装状态检测，在 macOS 上通过 Bundle ID 查找安装在非默认位置的应用。
- 清理权限仅限可信内置平台元数据，并结合文件系统真实路径保护共享目录。
- 统一侧边栏和平台设置中的清理 Tooltip 样式。

### 修复

- 修复部分清理成功后重试仍提交已移除目录的问题，并在清理期间禁止冲突操作。
- 修复指令目录选择器中长路径与文件数量重叠的问题。

## 0.1.12 - 2026-09-10

### Added

- Added Google Antigravity support: skill directories, AI instruction rules, and MCP configuration using Antigravity's native remote `serverUrl` schema.
- Added AI instruction diagnostics for duplicated files and for `@path` imports that do not resolve.
- Added read-only discovery of MCP servers defined inside Antigravity plugins.

### Improved

- Covered all four Antigravity customization-root spellings (`.agents`, `.agent`, `_agents`, `_agent`) when discovering instruction rules.
- Aligned the platform order in MCP install targets with the order used by the rest of the application.

### Fixed

- Removed the Antigravity workspace MCP path (`.agents/mcp_config.json`) that Antigravity never reads, so planned writes are no longer discarded.
- Fixed the missing surface label for Antigravity in skill install targets.

---

### 新增

- 新增 Google Antigravity 支持：Skills 目录、AI 指令规则，以及使用 Antigravity 原生远端 `serverUrl` 格式的 MCP 配置。
- 新增 AI 指令诊断：内容重复的指令文件，以及无法解析的 `@path` 导入。
- 新增对 Antigravity 插件内 MCP Server 的只读发现。

### 优化

- 指令规则发现覆盖 Antigravity 定制根的全部四种写法（`.agents`、`.agent`、`_agents`、`_agent`）。
- MCP 安装目标列表的平台顺序与界面其它位置保持一致。

### 修复

- 移除 Antigravity 工作区中并不生效的 MCP 路径（`.agents/mcp_config.json`），避免写入被静默丢弃。
- 修复 Antigravity 在技能安装目标中缺少接入面标签的问题。

## 0.1.11 - 2026-09-01

### Added

- Added Pi and OMP platform support, including platform-specific discovery and installation targets.
- Added local Skill imports from one or more `SKILL.md` files, in addition to importing complete Skill folders.

### Improved

- Improved AI instruction detail layout for narrow windows with wrapping status badges and tool controls.
- Improved local Skill import feedback and drag-and-drop handling for files and folders.

### Fixed

- Fixed standalone `SKILL.md` imports accidentally including sibling files as Skill resources.
- Removed the redundant file icon from the AI instruction detail header.
- Aligned OMP discovery with profile and project configuration behavior.

---

### 新增

- 新增 Pi 和 OMP 平台支持，包括平台专属的发现逻辑和安装目标。
- 新增从一个或多个 `SKILL.md` 文件导入本地 Skill 的能力，同时保留完整 Skill 文件夹导入。

### 优化

- 优化 AI 指令详情页在窄窗口下的布局，状态徽标和工具控件支持自动换行。
- 优化本地 Skill 导入提示，以及文件和文件夹拖拽处理。

### 修复

- 修复单独导入 `SKILL.md` 时误将同目录其他文件作为 Skill 资源的问题。
- 移除 AI 指令详情标题栏中多余的文件图标。
- 修正 OMP 在不同配置文件、Profile 和项目范围下的发现行为。

## 0.1.10 - 2026-08-31

### Added

- Added end-to-end AI instruction discovery and governance for global and project scopes, including effective-chain analysis, diagnostics, editing, bridging, transactional writes, undo, and file watching.
- Added project instruction compliance checks for the CLI and GitHub Actions, together with team-library instruction templates, policies, and application previews.
- Added Gitee support for team-library contributions and per-installation MCP credential configuration.
- Extended private Git backups with portable global AI instructions and conflict-aware restore previews.

### Improved

- Improved team-library editing and contribution workflows with fresh draft branches, clearer review states, and publish results.
- Improved MCP management with project-aware installation locations, credential status, secret reveal controls, and writes to each Agent's own configuration.
- Improved marketplace navigation persistence, dashboard card responsiveness, visual consistency, and native macOS sidebar translucency.

### Fixed

- Fixed AI instruction path resolution and action feedback.
- Prevented already-pushed contribution branches from being reused.
- Standardized the ZCode platform name across the application and documentation.

---

### 新增

- 新增覆盖全局与项目作用域的 AI 指令发现和治理能力，包括有效链分析、诊断、编辑、桥接、事务写入、撤销和文件监听。
- 新增 CLI 与 GitHub Actions 项目指令合规检查，并支持团队库指令模板、策略和应用预览。
- 新增 Gitee 团队库贡献支持，以及按具体安装位置配置 MCP 凭据。
- 扩展私有 Git 备份，支持可移植的全局 AI 指令和带冲突提示的恢复预览。

### 优化

- 优化团队库编辑与贡献流程，使用独立草稿分支，并完善变更审阅状态和发布结果。
- 优化 MCP 管理，明确项目安装位置、凭据状态、密钥显示控制，并写入各 Agent 自身配置。
- 优化市场页面导航状态保持、工作台卡片响应式布局、视觉一致性和 macOS 原生半透明侧边栏。

### 修复

- 修复 AI 指令路径解析和操作反馈问题。
- 避免重复使用已经推送过的贡献分支。
- 统一应用与文档中的 ZCode 平台名称。

## 0.1.9 - 2026-08-28

### Added

- Added frontmatter parse diagnostics for installed Skills, local and Git imports, and marketplace downloads, including file paths and line numbers when available.

### Improved

- Preserved installed Skills with malformed frontmatter as visible entries, excluded them from drift comparisons, and blocked unsafe actions until their `SKILL.md` files are fixed.

### Fixed

- Fixed broken linked Skills causing synchronization to fail.

---

### 新增

- 为已安装 Skill、本地与 Git 导入以及市场下载增加 frontmatter 解析诊断，并在可用时展示文件路径和错误行号。

### 优化

- 保留 frontmatter 损坏的已安装 Skill 并标记为解析失败，同时避免其参与漂移比对，并在修复 `SKILL.md` 前阻止不安全操作。

### 修复

- 修复失效链接型 Skill 导致技能同步失败的问题。

## 0.1.8 - 2026-08-28

### Added

- Added built-in clear controls to all shared input fields.
- Added a shared five-row textarea with an inline character counter for Skill bundle descriptions.

### Improved

- Improved linked Skill management with broken-link cleanup, link status indicators, and safer IPC payload handling.
- Included actionable error details in batch operation failure feedback.

---

### 新增

- 为所有公共输入框默认增加内置清空按钮。
- 抽象技能包描述文本域，统一为五行输入、内部滚动和右下角字符计数。

### 优化

- 完善链接型 Skill 管理，支持断链清理、链接状态提示，并增强 IPC 参数安全处理。
- 批量操作失败提示中补充具体错误信息，便于定位问题。

## 0.1.7 - 2026-08-27

### Added

- Added Qwen Code Skills support.
- Added WPS Lingxi user-scope Skill support, including Windows runtime directory synchronization.
- Added custom platform discovery and management in Settings.
- Displayed the running application version beside the sidebar Settings entry.

### Fixed

- Fixed monochrome Agent icons rendering as solid squares in packaged macOS builds.
- Prevented built-in Skill directories from being suggested again as custom platforms.
- Stabilized the sidebar collapse transition and added a loading skeleton when Settings first opens.

---

### 新增

- 增加 Qwen Code Skills 支持。
- 增加 WPS 灵犀用户级 Skill 支持，并在 Windows 同步运行时技能目录。
- 支持在设置中发现和管理自定义平台。
- 在侧边栏设置入口右侧显示当前应用版本。

### 修复

- 修复 macOS 打包版中单色 Agent 图标显示为实心方块的问题。
- 避免将内置平台的 Skill 目录重复推荐为自定义平台。
- 优化侧边栏收起过渡，并为首次打开设置页增加加载骨架。

## 0.1.6 - 2026-08-26

### Added

- Added Intel macOS (`x64`) desktop builds, release assets, and architecture-aware in-app updates.
- Improved Windows window behavior and file handling.
- Improved installation target hierarchy, resource browsing, and page cache refresh behavior.

### Fixed

- Fixed Linux application icons and preserved the default installation flow.
- Added custom scrollbars to MCP pages and preserved marketplace installation success feedback.
- Fixed dark-mode icon and label alignment.
- Sanitized rendered Markdown preview HTML.

---

### 新增

- 增加 Intel macOS（`x64`）桌面构建、发布安装包及按架构匹配的应用内更新。
- 完善 Windows 窗口行为与文件处理。
- 优化安装目标层级、详情资源浏览和页面缓存刷新策略。

### 修复

- 修复 Linux 应用图标，并保留默认安装流程。
- 为 MCP 页面统一自定义滚动条，并保留市场安装成功提示。
- 修复深色模式下的图标与标签对齐。
- 对 Markdown 预览 HTML 进行安全净化。

## 0.1.5 - 2026-08-24

### Added

- Added keyboard recording for the global wake shortcut.
- Added confirmation dialogs before deleting project scopes.

### Fixed

- Softened the sidebar divider color.
- Removed raw market timeout errors from the interface.
- Improved Windows Skills detail loading with Markdown fallback rendering.

---

### 新增

- 全局唤起快捷键支持直接按键录入。
- 删除项目范围前增加确认弹窗。

### 修复

- 调淡侧边栏与内容区之间的分隔线。
- 不再在界面显示市场请求超时等底层错误。
- 增强 Windows Skills 详情页加载，并在 Markdown 预览失败时回退显示原文。

## 0.1.4 - 2026-08-23

### Added

- Added a sidebar upgrade icon with release details, package size, publication date, download URL, and verified in-app installation.
- Added static update manifest publication metadata for release notifications.

### Fixed

- Improved update notifications so the main settings entry surfaces available releases without requiring the About page.

---

### 新增

- 在主界面设置入口旁增加升级图标，展示版本详情、安装包大小、发布日期、下载地址，并支持应用内校验安装。
- 更新静态版本清单，记录发版时间等版本提示信息。

### 修复

- 优化新版本提示，无需进入关于页面即可从主界面设置入口查看更新。

## 0.1.3 - 2026-08-22

### Added

- Added Windows arm64 and Linux arm64 preview builds alongside the existing macOS arm64 and x64 desktop packages.
- Added ZIP, DEB, and RPM release assets where supported by each platform.
- Standardized release asset names to include the product, version, operating system, and architecture.

### Fixed

- Improved update downloads so the updater selects an installer matching the current operating system and architecture.

---

### 新增

- 在现有 macOS arm64 和 x64 桌面安装包基础上，新增 Windows arm64 和 Linux arm64 预览构建。
- 按平台增加 ZIP、DEB 和 RPM 发布资产。
- 统一发布文件命名，包含产品名、版本、操作系统和处理器架构。

### 修复

- 优化版本更新下载逻辑，确保更新程序选择与当前操作系统和处理器架构匹配的安装包。

## 0.1.2 - 2026-08-22

### Fixed

- Fixed update checks failing with GitHub API 403 rate-limit responses by using the configured token and a public Releases page fallback.

---

### 修复

- 修复 GitHub API 返回 403 限流时更新检查失败的问题，支持使用已配置 Token 并回退到公开 Releases 页面。

## 0.1.1 - 2026-08-22

### Added

- Added a sidebar update button that checks for new releases and downloads the matching desktop installer with live progress.
- Added unified loading spinners for asynchronous actions and removed loading ellipses from user-facing copy.

### Fixed

- Restored refresh icons while buttons are idle and fixed missing platform icons.
- Improved project scope wording and documented the macOS Gatekeeper first-launch guidance.

---

### 新增

- 新增侧栏版本更新按钮，可检查新版本并下载匹配当前平台的安装包，实时显示下载进度。
- 为异步操作统一增加旋转加载图标，并移除界面文案中的加载省略号。

### 修复

- 恢复刷新按钮的闲置状态图标，修复部分平台图标不显示的问题。
- 优化项目范围文案，并补充 macOS 首次打开时的 Gatekeeper 提示。

## 0.1.0 - 2026-08-21

The first public desktop release of SkillBuddy for macOS, Windows, and Linux.

### Added

- Aggregated Skills from Claude Code, Codex, Cursor, OpenCode, GitHub Copilot, Gemini CLI, CodeBuddy, Trae, WorkBuddy, Doubao, Kimi Code, and ZCode.
- Scanning, search, detail views, editing, enable/disable, uninstall, and batch installation for user-level and project-level Skills.
- Cross-platform drift detection, diff inspection, and synchronization from a selected baseline.
- Skill imports from local directories, Git repositories, and public marketplaces.
- Skills marketplace search, detail views, source links, and installation.
- MCP Server scanning, detail views, enable/disable, removal, cross-platform synchronization, and configuration validation.
- MCP change-plan previews that show target platforms, configuration files, and planned writes before applying changes.
- Presets and Skill bundles with create, edit, import, export, and batch-management workflows.
- Git backup for user-level Skills and Presets, excluding MCP configuration, tokens, absolute machine paths, and project-level Skills.
- Git team libraries with resource browsing, role bundles, project compliance checks, and installation-plan previews.
- Simplified Chinese and English interfaces, a system tray, an in-app browser, and diagnostic information copying.
- Path-access validation, symlink-escape protection, sensitive-value validation, and read-only resource protection.
- Cross-platform desktop packaging with a macOS Apple Silicon DMG, Windows x64 NSIS installer, and Linux x64 AppImage.

### Release scope

- The macOS installer targets macOS 11 or later on Apple Silicon (arm64).
- The Windows installer targets Windows 10 or later on x64.
- The Linux installer targets x64 distributions with AppImage support.
- Intel Macs are not supported, and no Intel macOS installer is provided.
- The self-hosted Registry service and CLI remain separate optional components and are not included in the desktop installer.

### Documentation

- Added complete application screenshots to the README feature overview.
- Added MIT licensing information and bilingual project documentation.

### Feedback

- Installers and checksums are published on [GitHub Releases](https://github.com/konnga/skill-buddy/releases).
- Please report issues through [GitHub Issues](https://github.com/konnga/skill-buddy/issues).

---

SkillBuddy 首个面向 macOS、Windows 和 Linux 的桌面端公开版本。

### 新增

- 聚合 Claude Code、Codex、Cursor、OpenCode、GitHub Copilot、Gemini CLI、CodeBuddy、Trae、WorkBuddy、豆包、Kimi Code 和 ZCode 的 Skills。
- 支持用户级与项目级 Skills 的扫描、搜索、详情查看、编辑、启用、禁用、卸载和批量安装。
- 支持跨平台漂移检测、差异查看和按选定基准同步。
- 支持从本地目录、Git 仓库和公开市场导入 Skills。
- 支持 Skills 市场搜索、详情查看、来源跳转和安装。
- 支持 MCP Server 的扫描、详情查看、启用/禁用、删除、跨平台同步和配置校验。
- 支持 MCP 变更计划预览，应用前展示目标平台、配置文件和具体写入内容。
- 支持 Preset 与技能包的创建、编辑、导入、导出和批量管理。
- 支持 Git 多设备备份，备份内容不包含 MCP 配置、Token、本机绝对路径和项目级 Skill。
- 支持 Git 团队库，提供资源浏览、岗位包、项目合规检查和安装计划预览。
- 支持简体中文和英文界面、系统托盘、应用内浏览器和诊断信息复制。
- 内置路径访问校验、符号链接逃逸防护、敏感值校验和只读资源保护。
- 支持跨平台桌面打包：macOS Apple Silicon DMG、Windows x64 NSIS 安装包和 Linux x64 AppImage。

### 发布范围

- macOS 安装包面向 macOS 11 及以上、Apple Silicon（arm64）。
- Windows 安装包面向 Windows 10 及以上、x64 架构。
- Linux 安装包面向支持 AppImage 的 x64 发行版。
- Intel Mac 不受支持，也不提供 Intel macOS 安装包。
- Registry 自托管服务和 CLI 作为独立可选组件保留，不包含在桌面端安装包中。

### 文档

- 在 README 功能介绍中加入完整应用窗口截图。
- 增加 MIT 开源协议和中英文项目文档。

### 反馈

- 安装包和校验值发布在 [GitHub Releases](https://github.com/konnga/skill-buddy/releases)。
- 问题反馈请提交 [GitHub Issues](https://github.com/konnga/skill-buddy/issues)。
