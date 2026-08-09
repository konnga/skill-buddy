---
name: skillbuddy-skill-creator
description: 通过自然语言对话创建或更新可由多个本机 AI agent 使用的 Skill，并检查重复、触发条件、资源依赖与跨平台兼容性。用户在 SkillBuddy 中要求新建、完善、迁移或适配 Skill 时使用。
---

# SkillBuddy Skill Creator

## 目标

将用户的需求转化为一个结构清晰、可验证、尽可能跨 agent 使用的 Skill 包。由当前本机 AI agent 主导沟通和实现，由 SkillBuddy 负责发现产物、安装、同步与后续管理。

## 工作区约定

1. 读取工作区根目录的 `SKILLBUDDY_CONTEXT.md`，了解现有 Skills 和已检测平台。
2. 仅在 `output/<skill-name>/` 中创建或更新最终 Skill 包。
3. 不向任何 agent 的真实配置目录安装或复制文件。
4. 始终只维护一个最终 Skill 包；需要试验时在工作区的临时目录中进行。
5. 每次用户确认修改后，同步更新 `output/` 中的产物。

## 创建流程

### 1. 理解需求

- 优先从已有对话中提取目标、输入、输出、触发语句、边界和成功标准。
- 只追问真正影响设计的缺失信息，每次集中询问一个主题。
- 要求至少一个真实使用示例；需求已足够具体时不要机械追问。
- 使用与用户相同的语言沟通并编写 Skill，除非用户指定其他语言。

### 2. 检查重复

- 对照 `SKILLBUDDY_CONTEXT.md` 中的现有 Skills 判断是否重复或高度重叠。
- 发现重叠时，说明新建、扩展或合并的取舍，让用户决定方向。
- 不因名称不同就默认创建新的 Skill。

### 3. 确定目标平台

- 默认面向 `SKILLBUDDY_CONTEXT.md` 中已检测到的平台设计通用核心。
- 用户明确指定单一平台时，允许使用该平台的专属能力，但说明可移植性影响。
- 始终读取 [references/portability.md](references/portability.md)。
- 仅在目标包含相应平台时读取 `references/codex.md`、`references/claude-code.md` 或 `references/workbuddy.md`。

### 4. 设计 Skill 包

- 使用简短、具体的 kebab-case 名称，目录名与 frontmatter `name` 完全一致。
- 在 `description` 中同时写明“做什么”和“何时触发”；不要把关键触发条件只放在正文中。
- 只写当前 agent 完成任务时不能可靠推断的程序性知识。
- 仅在确定性、复用性或资源规模确实需要时增加 `scripts/`、`references/` 或 `assets/`。
- 将跨平台通用流程放在 `SKILL.md`，将宿主专属内容隔离为可选资源。

### 5. 实现产物

创建以下最小结构：

```text
output/<skill-name>/
├── SKILL.md
├── scripts/       # 可选
├── references/    # 可选
└── assets/        # 可选
```

- `SKILL.md` 必须包含 YAML frontmatter，且至少包含 `name` 和 `description`。
- 正文使用命令式、可执行的步骤，明确输入、决策点、输出和停止条件。
- 不创建 README、CHANGELOG、安装指南或其他与 agent 执行无关的文档。
- 不嵌入密钥、用户绝对路径或只在当前机器成立的环境信息。

### 6. 验证

- 检查 YAML、命名、目录结构、资源引用和脚本可执行性。
- 用 2 至 3 个真实请求检查是否能正确触发并完成任务。
- 增加至少一个不应触发的反例，检查 description 的边界。
- 对复杂或结果可客观判断的 Skill，使用当前 agent 可用的独立会话或子 agent 做正向测试。
- 未经用户同意，不启动高成本 benchmark、批量模型调用或会修改真实系统的测试。

### 7. 交付

- 确保 `output/` 中只有最终 Skill 包。
- 在回复中简要说明名称、主要资源和跨平台兼容性。
- 明确列出缺失的工具、MCP、运行时或权限依赖。
- 不自行安装；等待 SkillBuddy 展示产物并由用户确认目标平台。

## 修改已有 Skill

- 保留原名称，除非用户明确要求创建分支版本。
- 保留不相关的资源和元数据，不以重写为由删除未知文件。
- 说明重要行为变化，并重新执行触发、反例和兼容性检查。
