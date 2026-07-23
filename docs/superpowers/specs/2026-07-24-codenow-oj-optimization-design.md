# CodeNow OJ 全面优化设计文档

**日期**: 2026-07-24 | **状态**: 实施中

---

## 项目背景

CodeNow OJ 是一个基于 Next.js (vinext) 框架构建的在线编程评测平台，支持：
- C++17 代码在线编辑（Monaco Editor）
- 服务端判题（Judge0 API）
- AI 辅助解题与测试点生成（DeepSeek/OpenAI）
- 桌面编程伙伴（桌宠）
- 三套主题（亮色/暗色/少女）
- 提交记录持久化（Cloudflare D1）

## 问题清单与修复方案

### 第一批：安全修复 + 测试点验证 ✅ 已完成

| # | 问题 | 修复 |
|---|------|------|
| 1 | API Key 明文传输 | 服务端环境变量 `AI_API_KEY` 优先，客户端 key 降级为 fallback |
| 2 | 服务端开放代理 (SSRF) | 新增 `validate-endpoint.ts`，硬编码白名单（deepseek.com, openai.com, anthropic.com） |
| 3 | 无请求频率限制 | 新增 `rate-limit.ts`，基于内存 Map 的滑动窗口限流 |
| 4 | 无安全头 | 新增 `middleware.ts`，添加 CSP/XFO/CORS 等安全头 |
| 5 | Buffer 在 Edge 不兼容 | judge route 改用 Web Crypto API (TextEncoder/btoa) |
| 6 | 魔数散落 | 提取到 `constants.ts`，覆盖 Judge0/AI/UI 三类 |
| 7 | ESLint 不完整 | 添加 react-hooks 和 import 插件 |
| 8 | 测试点生成错误 | 新增 `verify-tests.ts`，用 Judge0 + 参考解答反向验证 AI 生成的测试点 |
| 9 | 提交记录 ID 格式无校验 | PATCH 路由新增题号格式校验 |

**新增文件**：
- `app/api/_lib/constants.ts` — 统一常量
- `app/api/_lib/rate-limit.ts` — 限流中间件
- `app/api/_lib/validate-endpoint.ts` — AI API 端点白名单
- `app/api/_lib/verify-tests.ts` — Judge0 测试点验证
- `app/middleware.ts` — 安全头中间件

**修改文件**：
- `app/api/judge/route.ts` — Buffer → Web Crypto + 限流 + 常量
- `app/api/ai/route.ts` — 端点白名单 + env key + 超时信号 + 限流
- `app/api/chat/route.ts` — 同上
- `app/api/generate-problem/route.ts` — 同上 + 验证集成
- `app/api/generate-tests/route.ts` — 同上
- `app/api/submissions/route.ts` — 限流 + 常量 + ID 校验
- `app/api/_lib/complexity-tests.ts` — validateEndpoint + 常量 + 验证集成
- `eslint.config.mjs` — react-hooks + import 排序

---

### 第二批：架构重构 🔨 进行中

**目标**：将 1182 行 `page.tsx`（56 个 useState，零组件拆分）重构为生产级架构。

#### 路由结构（三页）

```
/              → 首页（导航 + 统计）
/library       → 题库页
/problem/[id]  → 做题页
```

#### 目录结构

```
app/
├── page.tsx                    # 首页
├── library/page.tsx            # 题库
├── problem/[id]/page.tsx       # 做题
├── components/
│   ├── topbar.tsx
│   ├── problem-panel.tsx
│   ├── code-panel.tsx
│   ├── console-panel.tsx
│   ├── ai-modal.tsx
│   ├── chat-drawer.tsx
│   ├── import-modal.tsx
│   ├── rename-modal.tsx
│   ├── submission-modal.tsx
│   ├── mascot.tsx
│   └── toast.tsx
├── hooks/
│   ├── use-local-storage.ts
│   ├── use-cursor.ts
│   ├── use-workspace-resize.ts
│   ├── use-mascot-drag.ts
│   └── use-debounce.ts
├── stores/
│   ├── problem-store.ts      # 题目、代码、判题结果
│   ├── library-store.ts       # 题库、文件夹
│   ├── theme-store.ts         # 主题、编辑器主题
│   └── ai-store.ts            # AI 配置、聊天
├── api/
│   └── problems/route.ts      # 新增：题库 CRUD
├── layout.tsx                  # 保留
├── globals.css                 # 保留（不改样式）
└── chatgpt-auth.ts            # 保留
```

#### 状态管理：Zustand

4 个 Store：

| Store | 主要状态 | persist |
|-------|---------|---------|
| `theme-store` | themeMode, editorTheme | localStorage |
| `ai-store` | provider, endpoint, model, apiKeys, chatMessages | localStorage |
| `library-store` | archives, folders, selectedFolder, folderOrder, collapsedFolders | localStorage |
| `problem-store` | problem, code, results, compilerDiagnostic | localStorage |

> 注意：`problem-store` 同时使用 D1（提交记录）和 localStorage（工作区缓存）

#### 视觉冻结规则

**以下文件/内容不得修改**：
- `app/globals.css` — 所有 CSS（主题、动画、布局）
- `public/codenow/` — 所有图片资源
- 桌宠组件（mascot）的交互逻辑和动画
- 少女主题（`theme-girl`, `editor-theme-girl`）的所有样式
- 所有 HTML/CSS class 命名

**只重构**：状态管理、组件拆分、路由结构、数据流。

#### 组件提取映射

| 原 page.tsx 区域 | 新组件 | 依赖的 store |
|------------------|--------|-------------|
| 顶部导航栏 (line 1005-1010) | `topbar.tsx` | theme-store, pageView (router) |
| 题库页 (line 1012-1048) | `library/page.tsx` | library-store, problem-store |
| 做题工作区 (line 1049-1095) | `problem/[id]/page.tsx` | problem-store, ai-store, theme-store |
| 题目面板 (line 1055-1074) | `problem-panel.tsx` | problem-store |
| 代码面板 (line 1079-1093) | `code-panel.tsx` | problem-store, theme-store |
| 控制台面板 (line 1087-1092) | `console-panel.tsx` | problem-store |
| AI 解题弹窗 (line 1162-1177) | `ai-modal.tsx` | ai-store, problem-store |
| AI 对话侧栏 (line 1145-1154) | `chat-drawer.tsx` | ai-store, problem-store |
| 导入弹窗 (line 1098-1128) | `import-modal.tsx` | ai-store, library-store |
| 重命名弹窗 (line 1130-1136) | `rename-modal.tsx` | library-store |
| 提交代码弹窗 (line 1138-1143) | `submission-modal.tsx` | problem-store |
| 桌宠 (line 1177) | `mascot.tsx` | (内部状态) |
| Toast (line 1178) | `toast.tsx` | (全局) |

#### 自定义 Hooks

| Hook | 提取自 | 职责 |
|------|--------|------|
| `use-local-storage` | 多个 useEffect | 泛型 localStorage 读写 + 迁移 |
| `use-cursor` | handleCursorChange | 光标位置追踪（requestAnimationFrame 节流） |
| `use-workspace-resize` | startWorkspaceResize | 面板拖拽 resize |
| `use-mascot-drag` | startMascotDrag | 桌宠拖拽 |
| `use-debounce` | 多处 | 通用防抖 hook |

#### 题库 D1 持久化

新增 `app/api/problems/route.ts`：
- `GET` — 读取用户题库（按文件夹筛选）
- `POST` — 导入/创建题目
- `DELETE` — 删除题目
- `PATCH` — 更新题目元数据（重命名、移动文件夹）

`library-store` 启动时从 D1 同步，localStorage 仅做离线缓存。

---

### 第三批：测试 + 工程细节 📋 待做

| # | 任务 | 详情 |
|---|------|------|
| 1 | Vitest 测试 | coverage on: `complexity-tests.ts`（JSON 解析/修复）、`verify-tests.ts`、`rate-limit.ts`、API routes |
| 2 | a11y 改进 | 补全 aria-label、keyboard nav、focus management、prefers-reduced-motion |
| 3 | 错误信息优化 | 用户友好化错误文案，不暴露 HTTP 状态码细节 |
| 4 | 数据库迁移 | submissions 表 `submitted_at` 改用 integer（Unix timestamp） |
| 5 | 运行 `npm audit fix` | 修复 19 个已知漏洞 |

---

## 不变的原则

1. **视觉层冻结**：globals.css、public/ 资源、桌宠交互、主题动画 全部原样保留
2. **功能完整**：所有现有功能平迁，不丢失任何能力
3. **分批提交**：每批完成后自动 `git commit && git push`
4. **向后兼容**：localStorage key 迁移机制保留（`readMigratedSetting`）
