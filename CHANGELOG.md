# Changelog

All notable changes to SkillBuddy are documented in this file.

## 0.1.0 - 2026-08-21

The first public desktop release of SkillBuddy for macOS, Windows, and Linux.

### Added

- Aggregated Skills from Claude Code, Codex, Cursor, OpenCode, GitHub Copilot, Gemini CLI, CodeBuddy, Trae, WorkBuddy, Doubao, Kimi Code, and Z Code.
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

## 0.1.0 - 2026-08-21

SkillBuddy 首个面向 macOS、Windows 和 Linux 的桌面端公开版本。

### 新增

- 聚合 Claude Code、Codex、Cursor、OpenCode、GitHub Copilot、Gemini CLI、CodeBuddy、Trae、WorkBuddy、豆包、Kimi Code 和 Z Code 的 Skills。
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
