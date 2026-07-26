# CodeNow 认证运维说明

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
