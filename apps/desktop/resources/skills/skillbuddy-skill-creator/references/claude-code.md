# Claude Code 适配

- 保持 Skill 的核心流程不依赖 Claude Code 的专属工具名称或插件调用语法。
- 仅在用户需要严格评测时使用 Claude 的 baseline、grader、blind comparison 或 description optimization 流程。
- 运行多轮 eval 或 description 优化前说明成本并取得用户同意。
- 将 Claude 专属 subagent 和评测产物放在工作区临时目录，不打包进最终 Skill。
- 需要 `compatibility` 或 Claude 插件元数据时，将其视为平台扩展，不让通用执行依赖它。
- 不把 `~/.claude/skills`、插件缓存或市场目录写入最终 Skill；安装由 SkillBuddy 处理。
