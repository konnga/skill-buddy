# Registry 服务：API 与部署

> 对应 PRD Phase 2/3。自托管的 skills 注册中心：组织、令牌、版本、策略、审计。

## 快速开始

```bash
# 开发
cd apps/registry
ADMIN_TOKEN=dev-secret pnpm dev

# 企业部署（Docker）
ADMIN_TOKEN=change-me docker compose up -d
```

数据全部落在单个 SQLite 文件（`DB_PATH`，Docker 卷 `registry-data`），
备份 = 拷走一个文件。

## 认证与角色（RBAC）

| 角色 | 凭证 | 能做什么 |
|---|---|---|
| admin | `ADMIN_TOKEN` 环境变量 | 一切：建组织、发令牌、跨组织读写、全局审计 |
| owner | 组织令牌（role=owner） | 本组织：发布 skill、发成员令牌、设置策略、看审计 |
| member | 组织令牌（role=member） | 本组织：搜索、拉取、读策略 |

令牌为 `skm_` 前缀随机串，服务端只存 SHA-256。**组织间完全隔离**：
令牌只能看到自己组织的 skills。

## API 摘要

所有 `/api/*` 需要 `Authorization: Bearer <token>`。

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/healthz` | 公开 | 健康检查 |
| POST | `/api/orgs` | admin | 创建组织 `{name, displayName?}` |
| GET | `/api/orgs` | 任意 | admin 见全部；组织令牌见自己 |
| POST | `/api/orgs/:org/tokens` | owner/admin | 签发令牌 `{name, role}` → `{token}` |
| GET | `/api/skills?q=` | 任意 | 搜索（名称/描述/标签），组织内可见 |
| GET | `/api/skills/:org/:name?version=` | member+ | 拉取（默认最新版），记审计 |
| GET | `/api/skills/:org/:name/versions` | member+ | 版本历史 |
| POST | `/api/skills/:org/:name` | owner+ | 发布 `{version, description?, tags?, content, resources?}`；版本不可变，重复 409 |
| GET | `/api/orgs/:org/required` | member+ | 读策略（必装 skills 清单） |
| PUT | `/api/orgs/:org/required` | owner+ | 设策略 `{skills: []}` |
| GET | `/api/audit?org=&limit=` | owner/admin | 审计日志（发布/下载/令牌/组织/策略事件） |

resources（附属文件）以 `{相对路径: utf8 内容}` 内联存储，适合脚本/模板类
小文件；大二进制资产是后续演进点（对象存储外置）。

## 典型企业流程

```bash
# 平台工程师：建组织、给 Tech Lead 发 owner 令牌
curl -X POST $REG/api/orgs -H "Authorization: Bearer $ADMIN" -d '{"name":"acme"}'
curl -X POST $REG/api/orgs/acme/tokens -H "Authorization: Bearer $ADMIN" \
  -d '{"name":"lead","role":"owner"}'

# Tech Lead：发布团队规范，设为必装
skm publish ./security-rules --org acme --registry $REG --token $OWNER
curl -X PUT $REG/api/orgs/acme/required -H "Authorization: Bearer $OWNER" \
  -d '{"skills":["security-rules"]}'

# 成员 / CI：一条命令对齐全部必装 skills（策略下发落地点）
skm sync --org acme --agents claude-code,cursor,codex \
  --registry $REG --token $MEMBER
```

桌面端对应能力：设置里配置 Registry 地址 + 令牌 → 「团队库」页浏览/搜索/
安装；skill 详情页可直接发布。

## 尚未实现（诚实边界）

- **SSO（OIDC）**：当前为令牌认证。扩展点在 `src/auth.ts` 的
  `authenticate()`——接 OIDC 时在此校验 IdP JWT 并映射到 org/role，
  API 层无需改动
- **Web 管理控制台**：管理操作目前走 API/CLI；控制台作为独立前端
  消费现有 API 即可，无服务端改造
- **上架审批流**：owner 直发。审批 = skills 表加 `status` 字段 + 审批端点
- **大文件资产**：resources 内联 JSON，未接对象存储
