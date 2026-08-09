# WorkBuddy 适配

- 保持通用 `SKILL.md` 不依赖 WorkBuddy 输入框标签、模型选择器或专属函数调用名称。
- `.codebuddy-plugin/plugin.json` 属于插件分发元数据，不是普通 Skill 的必需文件。
- 仅在用户明确要求构建 WorkBuddy 插件时生成插件清单；不要将插件结构强加给跨平台 Skill。
- 检查脚本、MCP、GUI 和连接器能力是否在其他目标 agent 中存在。
- WorkBuddy 原生 `skill-creator` 的打包步骤可作为平台专属交付方式，但 SkillBuddy 工作流中不要自行安装或打包到真实目录。
- 不把 `~/.workbuddy`、插件市场或缓存目录写入最终 Skill；安装由 SkillBuddy 处理。
