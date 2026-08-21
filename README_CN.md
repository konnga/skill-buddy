<p align="center">
  <img src="apps/desktop/src/renderer/src/assets/logo.png" alt="SkillBuddy" width="96" />
</p>

<h1 align="center">SkillBuddy</h1>

<p align="center">
  跨 AI Agent 管理、安装、同步 Skills 与 MCP Servers 的桌面工作台。
</p>

<p align="center">
  <a href="README.md">English</a> · 简体中文
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-2563eb" />
  <img alt="Status" src="https://img.shields.io/badge/status-public%20preview-f59e0b" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-Vue%203-47848f" />
</p>

SkillBuddy 将不同 AI 编程工具分散在各自目录中的 Skills 和 MCP 配置聚合到一个界面中。你可以查看本机安装状态、跨平台分发内容、处理多端漂移、从市场发现资源，并通过 Git 团队库管理经过审核的团队资产。

## 界面预览

以下均为完整窗口截图，用于展示 SkillBuddy 的主要工作流和界面结构。

<div align="center">
  <img src="docs/images/dashboard.png" alt="完整 SkillBuddy 应用窗口：工作台与市场发现" />
  <br />
  <sub>工作台：查看本机资产、检测到的 Agent、内容漂移和市场发现入口。</sub>
</div>

<div align="center">
  <img src="docs/images/mcp-overview.png" alt="完整 SkillBuddy 应用窗口：MCP Servers 管理" />
  <br />
  <sub>MCP Servers：查看定义、传输方式、安装目标和运行状态。</sub>
</div>

<div align="center">
  <img src="docs/images/skills-overview.png" alt="完整 SkillBuddy 应用窗口：按 Agent 和作用域查看 Skills" />
  <br />
  <sub>Skills 清单：按 Agent、全局目录、项目目录、插件和系统资源浏览技能。</sub>
</div>

<div align="center">
  <img src="docs/images/team-library.png" alt="完整 SkillBuddy 应用窗口：团队库和岗位包" />
  <br />
  <sub>团队库：同步 Git 管理的资源，查看策略状态并配置岗位包。</sub>
</div>

<div align="center">
  <img src="docs/images/project-skills.png" alt="完整 SkillBuddy 应用窗口：项目级 Skills" />
  <br />
  <sub>项目 Skills：查看项目本地资源，并比较不同 Agent 的安装情况。</sub>
</div>

<div align="center">
  <img src="docs/images/data-backup.png" alt="完整 SkillBuddy 应用窗口：Git 备份和配置迁移" />
  <br />
  <sub>数据：将用户级 Skills 和 Preset 备份到 Git，导出设置或恢复历史配置。</sub>
</div>

<div align="center">
  <img src="docs/images/platforms.png" alt="完整 SkillBuddy 应用窗口：平台检测和自定义平台" />
  <br />
  <sub>平台：查看已检测的 Agent 集成，并添加自定义平台路径。</sub>
</div>

## 核心能力

- **统一资产视图**：自动发现并聚合不同 Agent 中的 Skills 和 MCP Servers。
- **跨平台安装**：将同一个 Skill 安装到多个用户级或项目级目标。
- **漂移检测与同步**：发现同名 Skill 在不同平台上的内容差异，选择基准版本后同步。
- **启用、禁用和卸载**：在可管理目录中调整 Skill 状态，删除操作支持移入废纸篓和撤销。
- **Skills 市场**：搜索 skills.sh、SkillHub 和 GitHub，查看内容与资源后安装。
- **MCP 市场与配置计划**：发现 MCP Server，检查目标平台能力，在写入前预览具体变更。
- **Preset 与技能包**：保存常用 Skill 组合，批量安装、启停或导入导出。
- **Git 多设备备份**：将用户级 Skills 和 Preset 保存到私有 Git 仓库，并在其他设备预览恢复。
- **Git 团队库**：通过受保护分支和 PR/MR 管理团队 Skills、MCP、岗位包和策略。
- **项目合规**：使用 `.skillbuddy/team.yaml` 声明项目依赖，检查缺失、过期、禁用和无效引用。
- **自定义平台**：配置额外 Agent 的检测路径、用户目录和项目目录。
- **中英文界面**：内置简体中文和英文。

## 支持平台

SkillBuddy 内置以下 Skills 目录约定：

| Agent | 用户级 | 项目级 |
| --- | :---: | :---: |
| Claude Code | ✓ | ✓ |
| Codex | ✓ | ✓ |
| Cursor | ✓ | ✓ |
| OpenCode | ✓ | ✓ |
| GitHub Copilot | ✓ | ✓ |
| Gemini CLI | ✓ | ✓ |
| CodeBuddy | ✓ | ✓ |
| Trae / Trae CN | ✓ | ✓ |
| WorkBuddy | ✓ | - |
| 豆包 | ✓ | - |
| Kimi Code | ✓ | ✓ |
| Z Code | ✓ | ✓ |

不同平台的 MCP 配置格式、作用域和能力并不完全一致。SkillBuddy 会在界面中展示实际检测到的入口和能力，并在应用变更前进行校验。部分平台约定仍需要更多真机反馈，详见 [平台约定说明](docs/platform-conventions.md)。

## 系统支持

SkillBuddy 桌面端当前提供以下构建目标：

| 操作系统 | 处理器架构 | 最低版本 | 支持状态 |
| --- | --- | --- | --- |
| macOS | Apple Silicon（`arm64`） | macOS 11 Big Sur | 正式支持，DMG |
| macOS | Intel（`x64`） | - | 不支持 |
| Windows | `x64` | Windows 10 及以上 | 正式支持，NSIS 安装包 |
| Linux | `x64` | 支持 AppImage 的发行版 | 正式支持，AppImage |

Windows 和 Linux 使用对应平台的 Electron 分支，并分别提供安装包。Intel Mac 没有配置 x64 macOS 构建目标，因此不支持。

## 下载与运行

各系统安装包下载地址：

- [前往 GitHub Releases](https://github.com/konnga/skill-buddy/releases)
- [查看更新日志](CHANGELOG.md)

Registry 自托管服务和 CLI 是独立的可选组件，不包含在桌面端安装包中。

SkillBuddy 会读取各 Agent 已有的本地目录。安装、同步、启停或删除等写操作只会作用于界面中明确选择的目标。

## 团队使用

团队可以使用 Git 仓库作为内容、版本、权限和审计的事实来源：

- 维护者在隔离的 `skillbuddy/<标识>` 分支中编辑 Skills、MCP、岗位包和策略。
- 发布前可以审阅文件列表、校验结果和 Git diff。
- GitHub 使用 `gh` 创建 Pull Request，GitLab 使用 `glab` 创建 Merge Request。
- 普通成员只能浏览和安装团队库中已经合并的内容。
- 私有仓库认证交给系统 Git、SSH Agent 或凭据管理器，SkillBuddy 不保存仓库密码。

完整格式与工作流见 [Git 团队库文档](docs/team-library.md)。

## 安全与隐私

- SkillBuddy 默认在本地扫描和管理文件，不要求登录 SkillBuddy 账号。
- GitHub Token 仅用于提升市场 API 限额，并存储在系统安全存储中。
- MCP 定义不允许包含明文 Token、密码或 API Key，敏感值应使用环境变量或密钥引用。
- Git 备份不包含 MCP 配置、Token、本机绝对路径、项目级 Skill 或启停状态。
- 系统、管理员和插件拥有的只读 Skill 不会被编辑或删除。
- 主进程会校验可访问路径，拒绝越过受管目录的写入和符号链接逃逸。

## 项目结构

```text
skill-buddy/
├── apps/
│   ├── desktop/       # Electron + Vue 3 桌面应用
│   └── registry/      # 可选的 Fastify + SQLite 自托管 Registry
├── packages/
│   ├── core/          # 统一数据模型、扫描、聚合、适配器与安全校验
│   └── cli/           # skm 命令行工具
└── docs/              # 设计、平台约定、Registry 与团队库文档
```

桌面端团队协作默认使用 Git 团队库，不依赖 Registry。Registry 和 CLI 作为可选的自托管与自动化组件保留在 monorepo 中。

## 本地开发

要求：

- Node.js 22 或更高版本
- pnpm 10 或更高版本
- Git

```bash
pnpm install
pnpm dev
```

常用命令：

```bash
pnpm build       # 构建所有 workspace 包
pnpm test        # 运行单元测试
pnpm test:e2e    # 构建并运行 Electron 端到端测试
pnpm typecheck   # 执行全仓库类型检查
```

## 贡献

Issue 和 Pull Request 都欢迎。提交前请尽量：

1. 说明受影响的平台、作用域和复现步骤。
2. 对共享逻辑补充相应测试。
3. 运行与修改范围相关的类型检查或测试。
4. 避免提交真实 Token、本机路径或团队私有内容。

## 开源协议

SkillBuddy 使用 [MIT License](LICENSE) 开源。
