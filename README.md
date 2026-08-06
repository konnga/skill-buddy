# Skills Manager

AI agent skills 的可视化管理平台：统一管理、安装、同步各主流 AI agent
（Claude Code / Codex / OpenCode / Trae / CodeBuddy / WorkBuddy …）的 skills，
打破平台间的格式差异，支持团队共享与企业内部使用。

## 架构

pnpm monorepo：

```
packages/core     # 内核：统一 skill 格式、解析、各 agent 适配器、本地扫描
apps/desktop      # 桌面端（Electron + Vue 3 + TypeScript）——可视化管理主入口
```

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
pnpm --filter @skills-manager/core build   # 先构建内核
pnpm dev                                   # 启动桌面端（electron-vite dev）
```

其他命令：

```bash
pnpm build       # 构建所有包
pnpm typecheck   # 全仓库类型检查
```
