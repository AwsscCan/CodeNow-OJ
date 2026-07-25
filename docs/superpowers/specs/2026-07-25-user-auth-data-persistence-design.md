# CodeNow OJ 用户认证与数据持久化设计

**日期**：2026-07-25  
**状态**：已批准  
**范围**：自建邮箱密码认证、用户数据隔离、云端同步与游客数据迁移

## 1. 背景

CodeNow OJ 当前将自建题目、文件夹、测试点、当前代码、主题和 AI 对话主要保存在浏览器 `localStorage`。提交记录接口也没有用户归属字段。结果是用户换设备或清除缓存后会丢失数据，而且服务端数据无法安全隔离。

本设计增加自建邮箱密码登录系统，并将用户核心数据持久化到 Cloudflare D1。游客仍可使用本地模式，登录后可以将本地数据显式迁移到云端。

## 2. 已确认的产品决策

- 使用自建邮箱密码登录，不使用现有 ChatGPT 托管登录。
- 开放注册并强制验证邮箱。
- 使用 Resend 发送验证和密码重置邮件；开发环境提供测试邮件适配器。
- 首期同时实现忘记密码与邮件重置密码。
- 游客可浏览、做题并把数据保存到本机；登录后可选择同步到云端。
- 云端同步题目、测试点、文件夹、代码草稿、提交记录、主题设置和 AI 对话。
- AI API Key 只保存在用户设备，不上传云端。
- 多设备冲突使用版本号检测，由用户选择本地或云端版本，不静默覆盖。
- 认证方案使用 Better Auth + Drizzle + D1；如果 vinext/Worker 兼容性验证失败，停止后续开发并评估托管认证，不改为完全自研密码系统。

## 3. 目标与非目标

### 3.1 目标

1. 支持注册、邮箱验证、登录、退出、忘记密码和重置密码。
2. 所有私有数据都由服务端绑定到当前 Session 用户。
3. 题目和全部测试点可跨设备恢复。
4. 保存草稿、提交记录、主题设置和 AI 对话。
5. 安全、可预览且幂等地迁移现有游客数据。
6. 检测多设备并发修改，避免静默丢失数据。

### 3.2 非目标

- 第三方登录、手机验证码、多因素认证和账号合并。
- 管理员后台、用户封禁、积分与排行榜。
- 题目公开发布、共享题库和多人实时协作。
- 字段级冲突合并和完整历史版本系统。
- 云端保存用户的 AI API Key。

## 4. 总体架构

系统划分为四个模块：

### 4.1 认证模块

Better Auth 负责账户、密码凭据、Session、验证令牌和认证 Cookie。Resend 生产适配器发送真实邮件；开发测试适配器在未配置 Resend Key 时把验证链接写入仅限开发环境的日志。密码散列和令牌不进入业务代码。

### 4.2 用户数据模块

D1 是云端数据的唯一事实来源，Drizzle 管理类型和迁移。业务表通过 Better Auth 的 `user.id` 关联。服务端从 Session 推导 `userId`，任何私有 API 都不接受客户端提供的所有者字段。

### 4.3 客户端同步模块

游客继续使用现有 `localStorage`，界面明确显示“仅保存在本机”。登录用户以云端数据为主，本地仅保存尚未同步的修改和重试队列。资源通过 `version` 实现乐观并发控制。

### 4.4 页面与 API

新增认证页面和按资源划分的 API。顶栏展示真实登录状态。内置题库继续是公共只读数据；用户修改内置题面或测试点时创建私有副本。

## 5. 组件边界

### 5.1 认证组件

- `auth`：配置 Better Auth、Drizzle 适配器、Cookie、邮箱验证和密码重置。
- `auth-client`：浏览器端注册、登录、退出和 Session 查询客户端。
- `current-user`：在服务端解析 Session，并向私有 API 提供已验证用户。
- `email`：统一邮件接口，包含 Resend 和开发测试两个适配器。

Better Auth 路由统一挂载到 `/api/auth/*`。认证页面包括：

- `/login`
- `/register`
- `/verify-email`
- `/forgot-password`
- `/reset-password`

### 5.2 业务组件

- `problem-repository`：文件夹、题目及测试点的读取和事务写入。
- `draft-repository`：代码草稿和版本冲突。
- `submission-repository`：提交历史和用户隔离。
- `preference-repository`：主题与编辑器设置。
- `conversation-repository`：AI 对话和消息。
- `local-data-importer`：游客数据预览、冲突分析和幂等导入。

路由只负责身份、输入校验和响应映射，业务规则放在服务层，数据查询放在仓储层。

## 6. 数据模型

所有 ID 由服务端生成 UUID，时间统一使用 UTC。所有可编辑资源包含 `created_at`、`updated_at` 和整数 `version`。

### 6.1 Better Auth 表

- `user`：邮箱、显示名和邮箱验证状态。
- `session`：Session Token、过期时间和用户关联。
- `account`：邮箱密码凭据。
- `verification`：邮箱验证和密码重置令牌。

具体字段以兼容性验证时锁定的 Better Auth 版本生成结果为准，不手工维护与库定义重复的认证 Schema。

### 6.2 业务表

| 表 | 主要字段 | 关键约束 |
|---|---|---|
| `folders` | `id`, `user_id`, `parent_id`, `name`, `sort_order` | 父文件夹必须属于同一用户 |
| `problems` | `id`, `user_id`, `problem_code`, 题面字段, `folder_id`, `origin`, `deleted_at` | `(user_id, problem_code)` 唯一 |
| `test_cases` | `id`, `user_id`, `problem_id`, `sort_order`, `input`, `expected_output`, `category`, `scale`, `targets`, `reason` | 所有者必须与父题一致 |
| `code_drafts` | `id`, `user_id`, `problem_ref`, `language`, `source_code` | `(user_id, problem_ref, language)` 唯一 |
| `submissions` | `id`, `user_id`, `problem_ref`, 题号/标题快照, `language`, `source_code`, `status`, `passed`, `duration_ms`, `submitted_at` | 历史快照不随题目改名更新 |
| `user_preferences` | `user_id`, `theme`, `editor_theme`, `settings_json` | 每用户一条 |
| `ai_conversations` | `id`, `user_id`, `problem_ref`, `title` | 归属当前用户 |
| `ai_messages` | `id`, `user_id`, `conversation_id`, `role`, `content`, `sort_order` | 对话必须属于同一用户 |
| `data_imports` | `id`, `user_id`, `idempotency_key`, `summary_json`, `created_at` | `(user_id, idempotency_key)` 唯一 |

`problem_ref` 可以指向私有题目 UUID 或稳定的公共题目 Key，并通过 `problem_kind` 区分。修改公共题时先创建 `origin = builtin_copy` 的私有题目。

### 6.3 数据限制

- 单个测试点输入或输出不超过 512 KiB。
- 单题测试数据总量不超过 20 MiB。
- 列表接口不返回测试点输入、输出和完整源代码。
- 数据限制集中配置，API 和迁移流程使用同一套校验。

## 7. 认证流程

### 7.1 注册与验证

1. 用户提交昵称、邮箱、密码和确认密码。
2. Better Auth 创建未验证账户。
3. 无论邮箱是否已注册，页面显示相同结果，避免账户枚举。
4. Resend 发送一次性验证链接。
5. 用户验证邮箱后才能登录。
6. 链接失效后可限流重发。

密码长度为 10–128 个字符，不强制特殊字符组合。登录、注册、重发验证邮件和密码重置同时按 IP 与规范化邮箱限流。

### 7.2 Session

- Cookie 使用 `HttpOnly`、生产环境 `Secure` 和 `SameSite=Lax`。
- 用户可选择“记住我”。
- 修改密码可撤销其他 Session；重置密码必须撤销所有已有 Session。
- 私有 API 未登录返回 `401`；资源不存在或属于其他用户时统一返回 `404`。

### 7.3 忘记密码

忘记密码请求始终返回相同提示。存在对应账户时，Resend 发送一次性重置链接。令牌必须短期有效、单次使用；成功重置后撤销全部 Session。

## 8. 游客数据迁移

首次登录时检测现有 `codenow-problem-library`、`codenow-workspace`、主题和 AI 对话数据。

1. 客户端解析并显示题目、测试点、草稿和对话数量。
2. 预览 API 校验大小、格式和与云端数据的冲突，但不写数据库。
3. 用户确认后使用新的幂等键提交导入。
4. 无冲突项目批量导入；题号冲突项目由用户逐项选择覆盖、保留两份或跳过。
5. 覆盖操作仍需携带云端 `version`，防止预览后数据已变化。
6. 成功后记录 `data_imports`，重复请求返回原结果而不创建副本。
7. 服务端确认成功前绝不删除本地数据。本地原始副本标记成功后保留七天。

导入批次要么完整成功，要么保持可安全重试。若数据过大而必须分批，每个子批次拥有独立幂等键和明确进度。

## 9. 日常同步与冲突

登录用户进入页面时加载云端数据。编辑操作立即更新本地工作副本，防抖后发送包含当前 `version` 的保存请求。

服务端执行条件更新：仅当数据库版本与请求版本一致时写入，并将版本加一。版本不一致返回 `409` 和云端版本元数据。客户端展示本地与云端更新时间，让用户选择完整保留本地版本或云端版本；首期不自动合并字段。

界面使用五种状态：

- 仅保存在本机
- 保存中
- 已同步
- 保存失败
- 存在冲突

网络失败时写入本地重试队列。恢复网络后使用幂等请求重试。Session 过期时保留待提交内容，重新登录后继续同步。退出时清空当前账户的内存状态和查询缓存，但不删除未迁移的游客数据。

## 10. API 设计

### 10.1 端点

| 方法与路径 | 用途 |
|---|---|
| `GET /api/me` | 当前用户和迁移状态 |
| `GET/POST /api/problems` | 私有题目列表与创建 |
| `GET/PATCH/DELETE /api/problems/:id` | 题目详情、修改和软删除 |
| `PUT /api/problems/:id/test-cases` | 原子保存测试点集合 |
| `GET/POST/PATCH/DELETE /api/folders` | 文件夹管理 |
| `GET/PUT /api/drafts/:problemRef` | 草稿读取和保存 |
| `GET/POST /api/submissions` | 当前用户提交列表与创建 |
| `GET/DELETE /api/submissions/:id` | 提交详情与删除 |
| `GET/PATCH /api/preferences` | 用户偏好 |
| `GET/POST /api/conversations` | AI 对话列表与创建 |
| `GET/POST /api/conversations/:id/messages` | AI 消息读取与创建 |
| `POST /api/imports/local-data/preview` | 本地数据校验和冲突预览 |
| `POST /api/imports/local-data/commit` | 幂等导入 |

### 10.2 通用约定

- 客户端不得发送 `userId`。
- 写接口校验 Content-Type、请求大小、字段长度、枚举和用户配额。
- 错误结构为 `{ error: { code, message, field? } }`。
- 列表使用游标分页。
- 创建、迁移和重试写入接受幂等键。
- 成功的变更响应返回最新 `version` 和 `updatedAt`。

## 11. 安全与隐私

1. 密码、Session 和一次性令牌由 Better Auth 管理。
2. 所有私有资源查询都包含 `user_id` 条件，防止对象级越权。
3. Cookie 写接口校验同源信息，并采用适合 Cookie Session 的 CSRF 防护。
4. 题面和 AI 消息默认按纯文本渲染；Markdown 必须经过严格白名单消毒。
5. 日志不记录密码、Session、验证令牌、完整邮箱、AI API Key、完整源代码或测试数据。
6. Resend Key 与 Better Auth Secret 只通过部署环境密钥提供。
7. 用户数据响应不得进入共享缓存；相关页面使用动态渲染。
8. 注册、登录、邮件和重置接口使用持久化或平台级限流，不能只依赖单进程内存 Map。
9. 提交记录的 ID 和时间由服务端生成，客户端字段不可信。
10. 现有无所有者的服务端提交记录不得自动分配给首个登录用户。

## 12. 错误处理

- 邮件发送失败：账户保持未验证，可在限流后重发。
- D1 写入失败：保留本地副本，不显示“已同步”。
- 版本冲突：返回 `409`，禁止静默覆盖。
- 请求或资源超限：返回 `413` 及具体限制。
- 未登录或 Session 过期：返回 `401` 并保留未同步编辑。
- 越权或资源不存在：统一返回 `404`。
- 批量迁移失败：回滚当前批次或保持可安全重试，不清除本地数据。

## 13. 测试策略

### 13.1 单元测试

覆盖字段校验、所有权条件、版本比较、邮件模板、迁移冲突和幂等键。

### 13.2 仓储测试

使用本地 SQLite/D1 模拟验证事务、唯一约束、软删除、分页和条件更新。

### 13.3 API 集成测试

每个私有端点都包含未登录、本人访问和跨用户访问三个场景。额外覆盖超限、无效版本和重复幂等请求。

### 13.4 认证流程测试

覆盖注册、邮箱验证、登录、退出、重发邮件、忘记密码、重置密码、令牌过期、令牌重放、会话撤销和限流。

### 13.5 端到端测试

覆盖游客数据迁移、换设备恢复、Session 过期续存、登出清理和多设备冲突。

### 13.6 构建门禁

必须通过单元测试、完整测试、生产构建和 Cloudflare Worker 最小部署验证。

## 14. 分阶段交付

### 阶段 0：兼容性验证

验证 Better Auth 路由、Cookie、Drizzle D1 适配器、Resend、vinext 开发模式和 Cloudflare 生产构建。任何核心项失败都停止后续阶段并输出兼容性报告。

### 阶段 1：认证与提交隔离

实现认证页面、Session、邮件、限流和顶栏状态；为提交记录增加用户归属并修复全部查询。

### 阶段 2：题库与草稿云端化

实现文件夹、题目、测试点和代码草稿的 Schema、仓储、API、事务保存与版本冲突。

### 阶段 3：迁移与其余同步

实现游客数据迁移向导、重试队列、主题设置和 AI 对话同步。

### 阶段 4：上线准备

完成安全回归、容量限制、观测指标、数据备份方案和灰度上线。

## 15. 验收标准

- 用户可以完成注册、邮箱验证、登录、退出、忘记密码和重置密码。
- 用户 A 无法读取或修改用户 B 的任何私有资源。
- 设备 A 新建题目和测试点后，设备 B 登录可恢复相同数据。
- 游客数据迁移前可预览，重复提交不产生副本，失败不删除本地数据。
- 多设备同时编辑产生明确冲突提示，不发生静默覆盖。
- 登出后不继续展示上一账户数据。
- AI API Key 从未进入同步请求和数据库。
- 生产构建和 Cloudflare Worker 最小部署验证通过。
