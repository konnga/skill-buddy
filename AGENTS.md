<!--
 * @Author: wjc
 * @Date: 2026-06-12 10:00:41
 * @LastEditors: wjc
 * @LastEditTime: 2026-06-12 15:10:26
 * @Description:
-->

## 项目约定

- 始终使用中文回复。
- 文档内容用中文书写
- git commit 信息用中文书写
- 不要每次任务完成后就 commit
- 修改代码前先确认当前工作区状态，不覆盖用户已有改动。
- 本仓库使用 pnpm workspace，根目录执行常用命令。
- 每次任务完成后不需要 build 和验证测试
- commit 要符合 commitlint.config.js 规范
- commit 的时候，根据 apps 下的不同应用进行 commit 信息的填写，比如：feat(admin): xxxx
- css 用 sass 开发
- css class 尽量使用tailwindcss 的原子 class 进行开发
- 可点击的内容，鼠标的样式是 cursor: pointer
- 注释使用 tsdoc 规范
