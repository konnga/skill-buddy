# Codex 适配

- 保持通用 `SKILL.md` 可独立执行，不在正文中依赖 `$skill-name` 调用语法。
- 需要 Codex/ChatGPT UI 元数据时，可增加 `agents/openai.yaml`，但不得让其他平台依赖该文件。
- `agents/openai.yaml` 中的显示名称、短描述和默认提示必须与 `SKILL.md` 保持一致。
- 使用 Codex subagent 做 forward-testing 时，给测试会话最少上下文，避免泄露预期答案或修改意图。
- 将 Codex 专属工具调用放进条件分支，并为缺少对应工具的 agent 提供通用操作描述。
- 不把 `$CODEX_HOME`、`~/.codex` 或 `.agents/skills` 等安装位置写入最终 Skill；安装由 SkillBuddy 处理。
