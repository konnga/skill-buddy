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

规划中（后续阶段）：

- `apps/registry` — skills 存储与分发服务（可私有化部署，团队/企业共享）
- `packages/cli` — 命令行工具（CI 下发、脚本化管理）

## 核心概念

- **Canonical Skill**：平台中立的统一 skill 格式（`packages/core/src/types.ts`）
- **Adapter**：每个 agent 平台一个适配器，负责该平台的目录约定与格式转换。
  已实现：Claude Code；待实现：Codex / OpenCode / Trae / CodeBuddy / WorkBuddy

## 开发

要求：Node >= 22，pnpm >= 10

```bash
pnpm install
pnpm dev       # 构建内核并启动桌面端（electron-vite dev）
```

其他命令：

```bash
pnpm build       # 构建所有包
pnpm typecheck   # 全仓库类型检查
```
