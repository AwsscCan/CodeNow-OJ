# CodeNow 认证运维说明

## 邀请制与首个管理员

私有部署设置 `INVITE_ONLY=1` 后，公开注册、重发验证邮件和密码重置入口返回 404。管理员在 `/admin` 创建好友账户，将一次性临时密码私下发送给好友；好友首次登录必须立即设置正式密码。系统只支持软删除用户内容，不提供永久删除。

本地首次初始化：

```powershell
$env:CODEFORGE_LOCAL_DB_PATH='.data/codenow.db'
npm run admin:bootstrap:local -- --email 700whitebird007@gmail.com --name 管理员
```

命令只允许在尚无管理员时成功一次。结构化结果写入标准输出，一次性临时密码仅写入标准错误；不要把输出重定向到仓库文件。生产远程初始化还必须提供 `--confirm-production`，并通过环境变量 `ADMIN_BOOTSTRAP_TOKEN` 传入令牌，禁止把令牌或密码放进命令行参数。

远程示例：

```powershell
$env:ADMIN_BOOTSTRAP_TOKEN='<从密码管理器读取>'
$env:ADMIN_BOOTSTRAP_URL_PREVIEW='https://<preview-worker>.workers.dev'
node scripts/bootstrap-admin.mjs --target preview --email 700whitebird007@gmail.com --name 管理员
```

初始化成功后立即登录并更换临时密码。重复执行只返回 `alreadyExists: true`，不会再次显示凭据。

## Cloudflare 私有发布

预览和生产必须分别使用 `codenow-oj-preview`、`codenow-oj-production` Worker，以及同名的两个独立 D1 数据库，绑定名统一为 `DB`。两套环境均启用 `workers.dev`、`INVITE_ONLY=1` 和 `migrations_dir="drizzle"`，不配置自定义域名、Resend 或公开注册。

不要把以下值写入 `wrangler.jsonc`：`BETTER_AUTH_SECRET`、`ADMIN_BOOTSTRAP_TOKEN`。用 `node scripts/generate-auth-secret.mjs` 为四个环境/用途分别生成值，再逐项执行 `wrangler secret put <NAME> --env preview|production`。每个值只进入密码管理器和 Wrangler 标准输入。

发布命令：

```powershell
npm run release:preview
npm run release:production
```

脚本先验证配置，再按“D1 导出备份 → 应用迁移 → 部署”的顺序执行。生产发布会先重新发布并冒烟验证预览；预览失败时不会执行任何生产命令。备份位于已忽略的 `backups/`。Worker 回滚只回滚应用版本，D1 迁移采用前向修复，并保留迁移前备份。

## 必需环境变量

- `BETTER_AUTH_SECRET`：至少 32 个随机字符；生产环境缺失时服务拒绝启动认证。
- `BETTER_AUTH_URL`：部署站点的 HTTPS 根地址。
- `RESEND_API_KEY`：Resend 服务端密钥。
- `AUTH_EMAIL_FROM`：已验证域名中的发件人，例如 `CodeNow <auth@example.com>`。

本地开发未配置 Resend 时，验证和重置链接仅输出到开发日志。生产环境禁止该回退。公开注册前必须在 Resend 完成发送域名的 DNS 验证。

## 数据库迁移

```bash
npm run db:generate
npx wrangler d1 migrations apply DB --local
npx wrangler d1 migrations apply DB --remote
```

先在本地和预览 D1 执行并完成注册、验证、登录、重置密码冒烟，再应用远端迁移。迁移前使用 `wrangler d1 export` 备份生产数据库。

## 密钥轮换与会话撤销

轮换 `BETTER_AUTH_SECRET` 会使现有签名数据失效，应安排维护窗口并通知用户重新登录。单用户密码重置会撤销该用户的全部会话；安全事件中可按 `user_id` 删除 `session` 表记录，随后确认 `/api/me` 返回匿名状态。

## 限流与故障排查

注册、登录、验证邮件和密码重置使用 D1 表 `auth_rate_limits`，同时按哈希后的 IP 与邮箱计数，窗口为 15 分钟。日志中不得记录密码、Session Token、验证 Token、完整邮箱、源代码、测试数据或 AI API Key。

账户写入配额按不透明用户哈希计数，窗口为 1 小时：文件夹和题目各 300 次、草稿与 AI 会话消息各 600 次、提交 300 次、偏好 120 次、本地数据导入 20 次。超限响应为 `429`、`Retry-After: 3600` 和 `Cache-Control: private, no-store`。过期计数由后续配额检查顺带清理。

邮件失败时账户保持未验证；检查 Resend 控制台、域名状态与 Worker Secret。数据库写入失败时不得向客户端显示“已保存”。

## Resend 上线检查

1. 在 Resend 控制台完成发送域名的 SPF、DKIM 和返回路径验证。
2. 将 `AUTH_EMAIL_FROM` 设置为已验证域名地址，并使用 Resend 测试收件人完成注册、验证和重置密码冒烟。
3. 确认日志、追踪和失败产物中不包含完整邮箱、验证链接或重置令牌。

## D1 备份、恢复与回滚

迁移和部署前执行 `wrangler d1 export DB --remote --output backups/<timestamp>.sql`，在隔离数据库导入备份并验证用户数、会话数和最新迁移号。恢复时先暂停写入，导入最近一次已验证备份，重新运行只读隔离检查，再恢复流量。

应用回滚优先切回上一 Worker 版本。数据库迁移默认前向修复；如必须回滚结构，先从迁移前备份恢复到新的 D1 数据库并切换绑定，禁止直接删除生产列。回滚后验证登录、Session、题目、草稿、偏好和会话读取。

## 密钥轮换与安全事件

轮换 Resend、AI 服务端密钥或其他 Worker Secret 时先写入新密钥、部署预览并完成冒烟，再撤销旧密钥。轮换 `BETTER_AUTH_SECRET` 会撤销所有现有会话，必须在维护窗口执行。

账户失陷时按 `user_id` 删除 `session` 表记录并重置密码；全局事件则撤销所有 Session。结构化安全事件只允许请求 ID、事件名、状态、耗时和不透明用户哈希，任何密码、令牌、邮箱、源代码、测试数据和消息内容都必须被移除。

## 本地端到端验证

运行 `npm run test:e2e` 会在 `127.0.0.1:3100` 启动隔离的 vinext 开发服务，并设置仅供该进程使用的 `E2E_TEST=1`。该开关启用进程内测试邮件收件箱；未设置时测试邮件端点固定返回 `404`，不得在预览或生产环境配置此变量。测试覆盖双账户题目、测试点、草稿、偏好、AI 会话隔离，本地数据迁移、版本冲突、密码重置撤销 Session 和注销清理。

Playwright 失败截图、trace 与报告写入已忽略的 `test-results/`、`playwright-report/`，不得提交或上传这些本地测试产物。预览发布仍必须使用 Resend 测试收件人单独完成真实邮件冒烟，不能用进程内收件箱代替。
