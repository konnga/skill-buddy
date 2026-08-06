# Skills Manager 产品需求文档（PRD）

> 版本：v0.1 草稿 ｜ 日期：2026-08-06 ｜ 状态：待评审

## 1. 背景与问题

AI 编程助手进入多工具并存时代：开发者和团队同时使用 Claude Code、Codex、
OpenCode、Trae、CodeBuddy、WorkBuddy 等多个 agent。几乎所有平台都支持
「skills / rules / prompts / commands」这类**可复用的指令资产**，但：

1. **格式与目录约定各不相同**：同一份 skill 想在多个工具里用，需要手动复制、
   改格式（SKILL.md / AGENTS.md / rules 目录 / prompts 目录…）
2. **无统一视图**：装了什么、装在哪、版本是否一致，没有任何工具能一眼看清
3. **无法团队共享**：好的 skill 靠微信群 / 口口相传 / 复制粘贴传播，
   无版本、无更新通知、无权限
4. **企业无法管控**：企业希望统一下发规范类 skill（安全规范、代码风格），
   并审计各端安装情况，目前完全做不到

## 2. 产品定位

**一句话**：AI agent skills 的可视化管理平台——一处管理，多端分发。

- 对个人：本机所有 agent 的 skills 的**单一管理面板**（查看/安装/编辑/同步/卸载）
- 对团队：skills 的**共享仓库**，一人沉淀、全队复用、版本可追
- 对企业：**私有化部署** + 统一下发 + 权限与审计

类比：「npm + npmjs.com，但面向 AI agent skills，且以桌面可视化为第一入口」。

## 3. 目标用户与画像

| 画像 | 场景 | 关键诉求 |
|---|---|---|
| P0 多工具个人开发者 | 同时用 2+ 个 AI agent | 一份 skill 处处可用；一个面板看清全局 |
| P1 团队 Tech Lead | 想把团队最佳实践沉淀成 skills | 共享、版本管理、成员一键安装 |
| P2 企业平台工程师 | 管理数百开发者的 AI 工具规范 | 私有部署、统一下发、审计合规 |

MVP 服务 P0；Phase 2 覆盖 P1；Phase 3 覆盖 P2。

## 4. 核心概念（领域模型）

- **Canonical Skill（统一格式）**：平台中立的 skill 表示
  （name / description / version / tags / content / resources）。
  是所有转换的中间格式，也是 registry 的存储格式
- **Agent 平台**：一个 AI 编程助手（claude-code / codex / opencode /
  trae / codebuddy / workbuddy…）
- **Adapter（适配器）**：每个 agent 平台一个，封装该平台的目录约定与格式，
  负责 canonical ⇄ native 双向转换。**平台差异全部终结在 adapter 层**
- **Scope（安装范围）**：user（全局，如 `~/.claude/skills`）/
  project（项目内，如 `<repo>/.claude/skills`）
- **Source（来源）**：local（本地创建）/ git 仓库 / registry（Phase 2）

## 5. 功能全景与分期

### Phase 1 — MVP：本机可视化管理（当前阶段）

| 模块 | 能力 | 优先级 |
|---|---|---|
| 扫描发现 | 自动检测本机已装的 agent 平台；扫描 user/project 两级 skills | P0 |
| 统一列表 | 按 agent / scope / tag 分组、搜索、筛选 | P0 |
| Skill 详情 | 查看 frontmatter + Markdown 渲染 + 附属文件 | P0 |
| 跨端安装 | 把任一 skill 转换安装到其他 agent（核心差异化能力） | P0 |
| 编辑 | 内置编辑器修改 skill，保存回写 | P1 |
| 卸载/删除 | 单端卸载或全端移除 | P0 |
| 一致性视图 | 同名 skill 在多端的版本/内容漂移检测 | P1 |
| 导入 | 从 Git URL / 本地文件夹导入 skill | P1 |
| 适配器覆盖 | claude-code（已有）→ codex → opencode → trae/codebuddy/workbuddy | P0 递进 |

### Phase 2 — 团队共享

- Registry 服务（可托管可自建）：发布 / 拉取 / 版本 / 搜索
- 桌面端接入：浏览远端 skills、一键安装、更新提醒
- 团队空间：组织 / 成员 / 私有 skills
- CLI：`skm install/publish/sync`，CI 中批量下发

### Phase 3 — 企业

- 私有化部署包（Docker Compose / Helm）
- SSO（OIDC）、RBAC 权限、审批流（skill 上架审核）
- 策略下发（强制安装规范类 skills）与安装审计
- Web 控制台（管理侧界面）

## 6. 非目标（明确不做）

- 不做 agent 本身、不做模型调用
- 不做 prompt 优化 / 评测（未来可集成，不是本品核心）
- MVP 不做账号系统（Phase 2 随 registry 引入）
- 不追求覆盖所有 agent 的**全部**配置（MCP、hooks 等），聚焦 skills 类资产；
  但架构上给扩展留口（adapter 可声明支持的资产类型）

## 7. 成功指标

- MVP：安装后 30 秒内看到本机全部 skills；跨端安装成功率 > 95%；
  周活跃留存（个人工具的硬指标）
- Phase 2：团队空间数、skill 被安装次数（分发次数是网络效应指标）
- Phase 3：私有化部署客户数

## 8. 风险与开放问题

| # | 风险/问题 | 应对/待定 |
|---|---|---|
| R1 | 各 agent 的 skills 规范持续演进，adapter 维护成本 | adapter 层收敛差异；建立兼容性测试样本库 |
| R2 | 部分平台（trae/codebuddy/workbuddy）约定不公开或多变 | 逐个调研后排期，MVP 先做规范公开的 3 家 |
| R3 | 「skills」边界模糊（rules/prompts/commands 是否算） | MVP 定义：以文件形态存在、可独立分发的指令资产即算 |
| Q1 | 开源策略：core/desktop 是否开源？ | **待定（需决策）** |
| Q2 | 商业模式：团队版收费 or 企业版收费？ | **待定（Phase 2 前决策）** |
| Q3 | 产品名 / 品牌名（skm 只是代号） | **待定** |

## 9. 相关文档

- [MVP 功能规格](./mvp-spec.md) — 页面结构、交互流程、验收标准
- [README](../README.md) — 技术架构与开发指南
