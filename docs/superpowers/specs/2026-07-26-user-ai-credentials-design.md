# 用户级 AI API Key 加密存储设计

## 目标

登录用户可分别保存 DeepSeek、OpenAI 和自定义服务的 API Key，并在不同设备登录后继续使用。Key 必须按用户隔离，完整值不得出现在普通读取接口、日志、审计记录或管理员界面中。

## 架构选择

采用独立的 `user_ai_credentials` 表和服务端 AES-256-GCM 加密。普通偏好设置继续只保存主题等非敏感值，不把凭据混入 `settingsJson`。当前小规模私有部署不引入外部密钥托管服务。

服务端使用 `AI_CREDENTIALS_MASTER_KEY`。该值为至少 32 字节的 Base64URL Secret，只通过本地环境变量或 Cloudflare Worker Secret 提供。生产环境缺失或格式错误时，凭据写入和 AI 调用返回安全错误；不得回退到明文或固定密钥。测试使用显式注入的测试密钥。

## 数据模型

`user_ai_credentials` 每个用户和服务商最多一行：

- `userId`：外键，用户删除时级联删除。
- `provider`：`deepseek | openai | custom`，与 `userId` 组成主键。
- `ciphertext`：AES-GCM 密文，Base64URL 编码。
- `iv`：每次写入随机生成的 12 字节 IV，Base64URL 编码。
- `keyVersion`：初始为 `1`，为以后轮换主密钥保留边界。
- `maskedSuffix`：Key 末四位，只用于界面确认。
- `createdAt`、`updatedAt`。

数据库迁移不得读取或导入浏览器本地 Key，也不得把 Secret 写进迁移文件。

## 服务和 API

凭据服务提供 `listStatus`、`save`、`delete` 和仅供服务端 AI 路由使用的 `resolve`：

- `GET /api/ai-credentials` 返回三个服务商的 `{ configured, maskedSuffix }`，不返回密文、IV 或完整 Key。
- `PUT /api/ai-credentials/:provider` 接收单个 Key，验证长度和请求体大小，加密后覆盖当前用户对应记录。
- `DELETE /api/ai-credentials/:provider` 删除当前用户对应记录。
- 匿名请求统一返回 404；响应使用 `Cache-Control: private, no-store`。

所有查询都从服务端 Session 提取 `userId`，客户端提交的用户 ID 一律忽略或拒绝。管理员没有读取其他用户完整凭据的特殊权限。

## AI 请求数据流

登录用户调用 `/api/ai`、`/api/chat`、`/api/generate-problem` 和 `/api/generate-tests` 时，前端只发送 provider、endpoint、model 和业务内容。服务端按当前用户及 provider 解密 Key，再调用上游服务。

未登录用户继续允许使用浏览器本地 Key，并按现有方式随请求发送，以保留离线/试用行为。登录用户提交请求体中的 `apiKey` 将被拒绝，防止云端模式意外继续依赖浏览器 Secret。

## 客户端与迁移

登录后客户端读取凭据状态：

- 输入新 Key 并保存成功后，立即清空输入状态和对应 `localStorage` Key。
- 界面只显示“已配置 ····1234”、更新和删除操作。
- 切换用户时清空内存中的完整 Key，不允许前一个用户的 Key 泄漏到新 Session。
- 若云端未配置而浏览器已有对应本地 Key，自动上传一次；所有上传成功后才删除本地副本。失败时保留本地值并显示可重试状态，不静默丢失。
- 若云端已有 Key，绝不使用本地值覆盖。

## 错误与安全边界

- 解密失败返回通用“凭据不可用”，不暴露密文、算法细节或 Key 是否属于其他用户。
- Key、密文、IV 不进入日志、审计、异常消息、Playwright trace 或截图。
- 每个 IV 必须随机且不得复用；更新同一个 Key也生成新 IV。
- 使用 Web Crypto API，确保 Node、本地 SQLite 与 Cloudflare Workers 使用同一实现。
- 凭据写入和删除受现有用户写入限流保护。

## 测试策略

严格执行 TDD：

1. Schema 和迁移测试覆盖复合主键、外键、provider CHECK 和升级无数据损失。
2. 加密服务测试覆盖往返、随机 IV、错误主密钥、用户隔离、覆盖与删除，并断言数据库和 JSON 中无明文。
3. API 测试覆盖匿名 404、no-store、请求限制和只返回掩码。
4. AI 路由测试证明登录用户使用服务端凭据且拒绝请求体 Key，匿名用户保留本地 Key 模式。
5. UI 测试覆盖状态掩码、保存后清空、本地 Key 一次迁移、用户切换清理和失败保留。
6. E2E 使用测试 Key，关闭 trace 与截图，验证两个用户凭据互不影响。

## 非目标

- 管理员代用户设置或查看 Key。
- 团队共享 Key、额度管理或用量计费。
- 本阶段自动轮换主密钥；`keyVersion` 仅保留未来迁移能力。
- 在数据库或 Git 中保存 `AI_CREDENTIALS_MASTER_KEY`。
