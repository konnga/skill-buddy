# SkillBuddy

AI agent skills 的可视化管理平台：统一管理、安装、同步各主流 AI agent
（Claude Code / Codex / OpenCode / Trae / CodeBuddy / WorkBuddy / 豆包 / Kimi Code /
Z Code …）的 skills，
打破平台间的格式差异，支持团队共享与企业内部使用。

## 架构

pnpm monorepo：

```
packages/core     # 内核：统一 skill 格式、适配器、扫描/聚合/漂移、registry 客户端
packages/cli      # skm 命令行（scan/install/publish/sync，CI 批量下发）
apps/desktop      # 桌面端（Electron + Vue 3 + TS）——可视化管理主入口
apps/registry     # 自托管 registry（Fastify + SQLite：org/令牌/版本/策略/审计）
```

团队/企业：`docker compose up` 起私有 registry（见 [docs/registry.md](docs/registry.md)），
桌面端「团队库」+ `skm sync` 完成共享与策略下发。

UI 走 headless 路线：**Reka UI + Tailwind CSS v4 + shadcn-vue 约定**（组件源码在
`apps/desktop/src/renderer/src/components/ui/`，归本仓库所有），图标用
`@lucide/vue`，数据表格规划用 TanStack Table。设计 token（含暗色模式）定义在
`src/renderer/src/assets/main.css`，暗色跟随系统。

当前已经具备：本地 Skills 与 MCP 管理、跨 Agent 分发、漂移同步、Preset、
skills.sh / SkillHub / GitHub 市场导入、私有 Registry、团队策略与混合资源包、
CLI 下发，以及用户级 Skills + Preset 的私有 Git 多设备备份与恢复。

## 核心概念

- **Canonical Skill**：平台中立的统一 skill 格式（`packages/core/src/types.ts`）
- **Adapter**：每个 agent 平台一个适配器，负责该平台的目录约定与格式转换。
  Skills 已覆盖 Claude Code、Codex、Cursor、OpenCode、GitHub Copilot、Gemini CLI、
  Trae / Trae CN、CodeBuddy、WorkBuddy、豆包、Kimi Code、Z Code；部分平台仍需
  对应产品真机验证。MCP 采用独立 Adapter 与能力矩阵，豆包不提供 MCP 目标。

## Git 多设备备份

桌面端「设置 → 数据」可将全部可管理的用户级 Skills 和 Preset 推送到私有 Git
仓库，并在另一台设备预览后恢复到所选 Agent。快照使用版本化 manifest，不包含
本机绝对路径、项目级 Skill、启停状态、MCP 配置或 Token；Git 认证由系统
SSH / 凭据管理器负责。检测到同名 Skill 内容漂移时会阻止备份，要求先选择基准
完成同步。

## 开发

要求：Node >= 22，pnpm >= 10

```bash
pnpm install
pnpm dev       # 构建内核并启动桌面端（electron-vite dev）
```

其他命令：

```bash
pnpm build       # 构建所有包
pnpm test        # Core、Registry 与桌面主进程单元测试
pnpm test:e2e    # 构建并运行 Electron 主流程测试
pnpm typecheck   # 全仓库类型检查
```
