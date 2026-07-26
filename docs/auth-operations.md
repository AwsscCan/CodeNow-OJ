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

邮件失败时账户保持未验证；检查 Resend 控制台、域名状态与 Worker Secret。数据库写入失败时不得向客户端显示“已保存”。
