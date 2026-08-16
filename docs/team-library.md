# Git 团队库

团队库使用企业 Git 仓库管理经过审核的 Skills、MCP 定义和组织策略。Git 是内容、版本、权限和审计的事实来源；SkillBuddy 负责同步、浏览、安装和本地状态检查。

## 企业团队如何使用

团队库面向两类角色：

- 维护者在“团队 → 管理”创建 Git 变更草稿，可新增、编辑、删除或导入 Skills、MCP Servers，编排岗位包，维护组织与团队策略，并通过 PR/MR 发布。
- 普通成员在“团队”浏览经过审核的资源或岗位包，查看必装、推荐、禁用、可升级和安装丢失状态，再安装到本机或指定项目。
- 项目负责人可在项目合规卡片中打开配置向导，生成 `.skillbuddy/team.yaml`，声明项目所属团队、岗位包和直接依赖。该文件应随项目代码提交。

所有管理操作都发生在独立的 `skillbuddy/<标识>` 分支。SkillBuddy 会在发布前检查资源格式、重复名称、岗位包失效引用和远程主分支是否已经变化；主分支不会被客户端直接修改。

## 仓库结构

```text
ai-team-library/
├── team-library.yaml
├── skills/
│   └── security-rules/
│       ├── SKILL.md
│       └── scripts/
├── mcp/
│   └── internal-docs.json
├── bundles/
│   └── frontend-developer.json
└── policies/
    ├── organization.yaml
    └── frontend.yaml
```

Skills 使用现有 `SKILL.md` 约定。首版 MCP 文件使用 JSON：

```json
{
  "version": "1.0.0",
  "description": "查询企业内部文档",
  "definition": {
    "name": "internal-docs",
    "transport": {
      "kind": "streamable-http",
      "url": "https://mcp.example.com",
      "headers": {
        "Authorization": { "kind": "env", "name": "INTERNAL_MCP_TOKEN" }
      }
    },
    "requiredSecrets": ["INTERNAL_MCP_TOKEN"]
  }
}
```

MCP 定义不能包含明文 Token、密码或 API Key，必须使用环境变量或密钥引用。

## 岗位环境包

`bundles/*.json` 用于把一个岗位或工作场景需要的 Skills 与 MCP Servers 组合起来：

```json
{
  "id": "frontend-developer",
  "name": "前端开发环境",
  "description": "团队前端项目的标准 AI 工具环境",
  "version": "1.0.0",
  "skills": [
    "skills/security-rules"
  ],
  "mcp": [
    "mcp/internal-docs.json"
  ]
}
```

客户端会在安装前展示全部成员、MCP 所需密钥、安装目标和策略检查结果。Bundle 中存在缺失引用或被禁用资源时，整包安装会被阻止；安装过程仍逐项经过 Skill 与 MCP 原有的主进程安全校验，并为每个资源记录独立来源。

岗位包适合表达岗位或场景的标准工作环境，例如前端开发、数据分析、客服运营或安全审计。维护者只维护包内成员，成员安装岗位包时仍可选择实际目标平台和项目目录。

## 仓库清单与多层策略

仓库根目录的 `team-library.yaml` 声明组织策略和可供项目选择的团队策略：

```yaml
version: 1
id: acme-ai
name: Acme AI Library
policies:
  organization: policies/organization.yaml
  teams:
    frontend:
      name: 前端团队
      file: policies/frontend.yaml
```

`team-library.yaml` 是团队库清单的唯一入口，`id` 和 `name` 为必填字段。`id` 使用 kebab-case，是项目配置和跨库资源引用使用的稳定标识；`name` 只用于界面展示。团队成员在 SkillBuddy 中添加团队库时只填写 Git 地址和分支，两者都由仓库维护者统一管理，不能由客户端覆盖。

策略文件支持 YAML 或 JSON；组织策略对所有使用该库的项目生效，团队策略由项目显式选择。未声明组织策略时使用空策略。

## 项目级团队要求

项目可以提交 `.skillbuddy/team.yaml`，声明该项目必须使用的团队资源：

```yaml
version: 1
library: acme-ai
teams:
  - frontend
requires:
  bundles:
    - frontend-developer
  skills:
    - skills/security-rules
  mcp:
    - mcp/internal-docs.json
```

`library` 是未限定引用使用的默认团队库 ID。存在多个团队库或需要跨库引用时，可使用 `团队库ID:资源引用`：

```yaml
version: 1
requires:
  bundles:
    - acme-ai:frontend-developer
  skills:
    - security-team:skills/security-rules
  mcp:
    - platform-team:mcp/internal-docs.json
```

SkillBuddy 只把安装到当前项目目录、来源与团队库匹配且内容哈希仍为最新的资源视为合规。用户级安装不会满足项目要求；资源缺失、来源无法解析或内容哈希变化会分别显示为缺少、引用无效或版本漂移。

项目还可以增加只对当前项目生效的策略：

```yaml
version: 1
library: acme-ai
teams:
  - frontend
requires:
  bundles: []
  skills: []
  mcp: []
policy:
  required:
    skills: []
    mcp: []
  recommended:
    skills: []
    mcp: []
  blocked: []
```

有效策略按“组织 → 团队 → 项目”合并。必装和推荐资源取并集；相同 `ref + versions` 的禁用规则由后层覆盖前层。`.skillbuddy` 目录与 `team.yaml` 必须位于项目内且不能是符号链接。

## 组织策略

`policies.organization` 指向的组织策略文件支持必装、推荐和禁用资源。下面是 JSON 格式示例：

```json
{
  "required": {
    "skills": ["skills/security-rules"],
    "mcp": ["mcp/internal-docs.json"]
  },
  "recommended": {
    "skills": [],
    "mcp": []
  },
  "blocked": [
    {
      "ref": "mcp/legacy-database.json",
      "versions": "<=1.8.0",
      "reason": "旧版本可能泄露数据库凭据"
    }
  ]
}
```

当前版本展示必装、推荐和禁用状态，并在 Skill/MCP 安装前强制检查禁用规则。版本范围支持精确版本及空格分隔的比较器，例如 `<=1.8.0` 或 `>=1.0.0 <2.0.0`。

## 同步与认证

- 添加仓库时 SkillBuddy 会先检测远程状态，并自动识别远程默认分支。
- 已初始化的团队库只保存 Git 地址和分支；团队库 ID、名称从同步后的清单读取。
- 空仓库初始化时只需填写显示名称。SkillBuddy 根据仓库名生成稳定 ID，并生成标准目录、清单、组织策略和首次提交后推送。初始化完成后，ID 与名称由仓库清单统一管理。
- 非空但缺少或损坏 `team-library.yaml` 的仓库不会被自动修改，需要仓库维护者先修复清单。
- 支持 HTTPS 和 SSH Git 地址。
- 使用系统 Git、SSH Agent 或 Git Credential Manager，不在 SkillBuddy 中保存 Git 凭据。
- 每次同步使用浅克隆，并记录精确 Commit SHA。
- 同步先写入临时目录，成功后再替换当前缓存。
- 远程不可用时继续使用上一次成功缓存。
- 仓库中的符号链接、过多文件或过大内容会被拒绝。

## 安装来源

SkillBuddy 为团队库安装记录以下信息：

- 团队库 ID 和 Git 地址。
- 资源类型和仓库相对路径。
- 版本与 Commit SHA。
- 内容哈希或 MCP 定义哈希。
- 安装目标和安装时间。

因此，同名但来自不同团队库的资源不会再被视为同一个来源。

SkillBuddy 每次刷新团队库时会重新扫描记录中的本机和项目安装目标，并显示三种状态：

- `current`：实际内容与团队库当前版本一致。
- `outdated`：资源仍存在，但内容哈希与团队库不同，需要升级。
- `missing`：历史记录存在，但实际安装已经被移除，需要重新安装。

## 贡献与审核

团队成员通过“团队 → 管理”创建独立变更工作区。SkillBuddy 会克隆团队库默认分支并创建 `skillbuddy/<标识>` 分支，资源表单的修改会立即写入该工作区；“变更”页可审阅文件列表、校验问题和补丁，然后由应用执行提交、推送和创建 PR/MR：

- GitHub 仓库使用系统中的 `gh` 创建 Pull Request。
- GitLab 仓库使用系统中的 `glab` 创建 Merge Request。
- 未安装对应 CLI 或远程类型无法识别时，贡献分支仍会推送，并提示用户手动创建审核请求。
- Git、`gh` 和 `glab` 的凭据由系统工具管理，SkillBuddy 不保存仓库凭据。
- 放弃草稿时，SkillBuddy 会删除对应的本地临时 Git 工作区。

团队库的主分支应启用保护规则，并要求 CODEOWNERS、CI 校验或至少一名维护者审核后才能合并。

团队库不依赖 Registry 服务，也不提供 Registry 兼容或迁移模式。企业首次启用时直接创建 Git 团队库，所有内容从第一天开始通过分支和 PR/MR 管理。
