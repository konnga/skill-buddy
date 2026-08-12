# State Management

> How state is managed in this project.

---

## Overview

<!--
Document your project's state management conventions here.

Questions to answer:
- What state management solution do you use?
- How is local vs global state decided?
- How do you handle server state?
- What are the patterns for derived state?
-->

(To be filled by the team)

---

## State Categories

<!-- Local state, global state, server state, URL state -->

(To be filled by the team)

---

## When to Use Global State

<!-- Criteria for promoting state to global -->

(To be filled by the team)

---

## Server State

<!-- How server data is cached and synchronized -->

(To be filled by the team)

---

## Common Mistakes

### Skill 安装视图的筛选与操作目标不一致

**症状**：项目范围中的 Skill 卡片显示为全局状态，启停或卸载确认提示“全局操作”，实际目标可能包含其他范围的安装。

**原因**：列表、卡片和批量操作分别依据不同筛选状态计算安装集合，例如只读取 `platformFilter` 而忽略 `projectFilter`。

**约束**：Skill 安装视图统一使用 Agent 与范围的交集。侧边栏范围导航只展示项目范围，不提供单独的“用户级”或“全局”入口；`projectFilter === null` 表示未限定项目范围。底层仍兼容 `projectFilter === 'user'` 作为用户范围哨兵，它只匹配 `scope === 'user'`；其他非空 `projectFilter` 只匹配相同 `projectRoot`；非空 `platformFilter` 还必须匹配相同 `agent`。

```ts
function matchesInstallation(installation, platformFilter, projectFilter) {
  if (platformFilter && installation.agent !== platformFilter) return false
  if (projectFilter === 'user') return installation.scope === 'user'
  if (projectFilter) return installation.projectRoot === projectFilter
  return true
}
```

**正确行为**：

- 列表可见性、卡片禁用状态、开关提示、启停目标和卸载目标使用同一组筛选条件。
- 打开确认弹窗时冻结本次目标集合，确认后不得根据已变化的侧边栏筛选重新扩大操作范围。
- 仅在 Agent 与范围都为空时使用“全局”文案；存在范围时明确提示只影响当前范围。

**检查点**：

- 基础：无主筛选时操作全部可管理安装。
- Agent：只操作该 Agent 的可管理安装。
- 用户范围（底层兼容状态，不作为侧边栏入口）：只操作用户级可管理安装。
- 项目范围：只操作相同 `projectRoot` 的可管理安装。
- 项目 Agent：只操作 Agent 与 `projectRoot` 同时匹配的可管理安装。
- 错误场景：当前交集没有可管理安装时，不显示或不执行批量操作。
