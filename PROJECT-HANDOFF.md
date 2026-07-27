# CodeNow OJ 项目交接文档

**交付日期**: 2026-07-27
**交付分支**: `feat/local-data-migration`
**仓库地址**: https://github.com/AwsscCan/CodeNow-OJ

## 1. 项目概述

CodeNow OJ 是一个面向 GNU C++17 的在线编程判题平台，前端 Next.js，后端 vinext(Cloudflare 适配)，目前全栈运行在 VSCode + Windows 本地环境。

**核心能力**：
- 内置 158 道编程题目(AcWing 基础课 109 题 + 经典题库 26 题 + 竞赛真题 23 题)
- C++17 在线编译判题(Judge0)
- AI 对话/解题助手(支持 DeepSeek/OpenAI/自定义 API)
- 少女主题(高木同学 AI 人设联动、桌宠、台词语料库)
- 用户笔记/讨论/Markdown+LaTeX 渲染
- 用户认证(better-auth) + 云端数据同步(D1)

## 2. 本地运行

```bash
# 前置：Node.js >= 22.13.0

pnpm install
npm run build        # 生产构建
npm run test:unit    # 558 单元测试
npm run test:e2e     # Playwright E2E 测试

# 启动生产服务器
npx vinext start --hostname 127.0.0.1 --port 3000

# 开发模式
npm run dev
```

网站入口：`http://127.0.0.1:3000`，题库页 `/library`，做题页 `/problem/P1001`。

## 3. 项目结构

```
CodeNow-OJ/
├── app/                          # Next.js 应用层
│   ├── api/                      # 后端 API 路由
│   │   ├── _lib/                 # 共享工具库
│   │   │   ├── constants.ts      # AI 参数常量
│   │   │   ├── takagi-persona.ts # 高木同学人设(共享模块)
│   │   │   ├── takagi-quotes.ts  # 高木原作台词库(61 条)
│   │   │   ├── test-generation-pipeline.ts  # AI 测试点分批生成
│   │   │   └── validate-endpoint.ts        # API 端点校验
│   │   ├── ai/route.ts           # AI 解题
│   │   ├── chat/route.ts         # AI 对话(少女主题联动 takagi persona)
│   │   ├── generate-problem/route.ts  # AI 题面解析(与测试点解耦)
│   │   ├── generate-tests/route.ts    # AI 分批生成测试点
│   │   ├── judge/route.ts        # Judge0 判题
│   │   ├── mascot-line/route.ts  # 桌宠台词(高木人设)
│   │   └── submissions/route.ts  # 提交记录
│   ├── components/               # React 组件
│   │   ├── auth-status.tsx       # 登录状态(渐变胶囊按钮)
│   │   ├── mascot.tsx            # 桌宠(高木)交互组件
│   │   ├── mascot-wrapper.tsx    # 桌宠挂载(少女主题限定)
│   │   ├── problem-editor.tsx    # 题面编辑器(贴图+Markdown)
│   │   ├── notes/                # 笔记模块
│   │   │   ├── note-editor.tsx        # 笔记编辑器
│   │   │   ├── safe-markdown.tsx      # Markdown 安全渲染(DOMPurify+KaTeX)
│   │   │   └── problem-notes-panel.tsx # 题目笔记面板
│   │   └── topbar.tsx            # 顶栏(共享组件)
│   ├── hooks/                    # 自定义 Hooks
│   ├── lib/                      # 前端工具库
│   │   └── paste-image.ts        # 粘贴图片共享管线
│   ├── stores/                   # Zustand 状态管理
│   │   ├── problem-store.ts      # 工作区状态(题目/代码/历史)
│   │   ├── library-store.ts      # 题库状态(文件夹/归档/内置题)
│   │   ├── mascot-store.ts       # 桌宠状态(台词/情境)
│   │   ├── memory-store.ts       # 用户记忆池
│   │   ├── ai-store.ts           # AI 配置
│   │   └── theme-store.ts        # 主题(亮/暗/少女)
│   ├── styles/                   # CSS 令牌(注：tokens.css 被引入，其余文件未接线！)
│   │   └── tokens.css            # 设计令牌(唯一被引入的文件)
│   └── globals.css               # 所有生效样式都在这里(不要怀疑)
├── public/                       # 静态资源
│   ├── catalog-index.json        # 题库轻量索引(112KB,不含 samples)
│   ├── problems/                 # 按需加载的单题完整 JSON
│   │   └── CS0331.json           # 例：CSP 认证单题
│   ├── acwing-course.json        # AcWing 原始数据(生成后不再被前端加载)
│   ├── classic-problems.json     # 经典题库原始数据(同上)
│   ├── contest-problems.json     # 竞赛真题原始数据(同上)
│   └── codenow/                  # 图片资产(icon/mascot/portrait)
├── scripts/testgen/              # 测试点数据工厂
│   ├── lib.mjs                   # 核心工具(种子构造/参考解/对拍/锚点校验)
│   ├── generate-bundled.mjs       # 经典+竞赛题库生成入口
│   ├── split-catalog.mjs         # 索引拆分(50MB→112KB)
│   ├── enhance-acwing.mjs        # AcWing 测试点增强
│   ├── classic-defs-{1,2,3}.mjs   # 经典题库定义(26 题)
│   ├── contest-defs.mjs          # CSP-J/NOIP/蓝桥杯定义(7 题)
│   ├── csp-cert-{1,2}.mjs        # CSP 认证第33-42次(16 题)
│   └── acwing-solvers-{1..6}.mjs  # AcWing 参考解(87 题)
├── tests/unit/                   # 558 个单元测试
├── docs/superpowers/specs/       # 设计文档
│   ├── 2026-07-26-girl-theme-ui-polish-design.md
│   ├── 2026-07-26-takagi-ai-persona-memory-design.md
│   └── 2026-07-26-workspace-fixes-and-editing-design.md
└── PROJECT-HANDOFF.md            # 本文档
```

## 4. 关键架构决策

### 4.1 样式系统——只认 globals.css

**这是最重要的一条**。`app/styles/` 目录下除了 `tokens.css`（被 `@import` 引入）外，其余所有 CSS 文件（topbar.css、library.css、mascot.css……）**均未被任何文件引入，是死文件**。所有实际生效的样式都在 `app/globals.css` 这一个文件中。

- 修样式 → 改 `app/globals.css`
- 主题自适应 → 引用 `tokens.css` 的 `--color-*` / `--radius-*` / `--space-*` token
- 不要往 `app/styles/` 里的文件写新样式，它们不会生效

### 4.2 题库加载——轻量索引 + 按需单题

- 题库页加载 `catalog-index.json`（当前约 123KB，仅含元数据+sampleCount）
- 点击进入做题页时按需拉取 `/problems/{id}.json`（完整 samples）
- `scripts/testgen/split-catalog.mjs` 负责从三个大文件生成索引与单题文件
- **每次修改/新增题目后必须运行** `node scripts/testgen/split-catalog.mjs` 重新生成

### 4.3 数据工厂——JS 参考解产出测试点

- `scripts/testgen/lib.mjs` 提供 `buildProblem` 函数
- 每个题目定义需包含 `solve(input)`（参考解）和 `gen(rng)`（构造测试点）
- 可选 `brute(input)` 用于小规模对拍验证
- 可选 `skipAnchor: true` 表示跳过原题样例锚点校验
- 强制约束：单点 input ≤ 256KB（用 `buildSamples` 的防线）
- 约束：每题 ≥ 12 个测试点，覆盖 sample/boundary/special/ordinary/adversarial/performance 六类

### 4.4 高木同学 AI 联动

- 人设模块：`app/api/_lib/takagi-persona.ts`（`TAKAGI_CORE` + `buildTakagiChatPrompt` + `buildTakagiMascotPrompt`）
- 台词语料库：`app/api/_lib/takagi-quotes.ts`（61 条原作台词，按情境标签检索注入 prompt）
- 记忆池：`app/stores/memory-store.ts`（判题错误与提问习惯沉淀，反哺 AI）
- 触发条件：`themeMode === "girl"` 时 chat 传 `persona: "takagi"`，桌宠始终走 takagi 人设
- 反浮夸收敛：prompt 内置好坏对照范例，禁止波浪号/叠字卖萌

## 5. NPM 脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run test:unit` | 558 个单元测试(Vitest) |
| `npm run test:e2e` | Playwright E2E |
| `npm run lint` | ESLint |
| `node scripts/testgen/generate-bundled.mjs` | 生成经典题库+竞赛题库 JSON |
| `node scripts/testgen/enhance-acwing.mjs` | 增强 AcWing 题库测试点 |
| `node scripts/testgen/split-catalog.mjs` | 拆分轻量索引+单题文件 |

## 6. 数据修改流程

### 新增 AcWing 题
1. 编辑原始数据文件 `public/acwing-course.json`
2. 在 `scripts/testgen/acwing-solvers-*.mjs` 添加对应 solver（solve + gen + 可选 brute）
3. `node scripts/testgen/enhance-acwing.mjs` 生成测试点
4. `node scripts/testgen/split-catalog.mjs` 重建索引

### 新增经典/竞赛题
1. 在 `scripts/testgen/classic-defs-*.mjs` 或 `contest-defs.mjs` 或 `csp-cert-*.mjs` 添加定义
2. 在 `scripts/testgen/generate-bundled.mjs` 确保 import 接线
3. `node scripts/testgen/generate-bundled.mjs` 生成
4. `node scripts/testgen/split-catalog.mjs` 重建索引
5. 更新对应的 `tests/unit/*-catalog.test.ts` 契约测试

### 修改样式
1. 编辑 `app/globals.css` 尾部追加
2. 颜色/圆角/间距引用 tokens.css 的 `--color-*` / `--radius-*` / `--space-*`

## 7. 组件 / 路由速查

| 路由 | 组件入口 | 说明 |
|---|---|---|
| `/` | `app/page.tsx` | 首页 hero + 快速开始 |
| `/library` | `app/library/page.tsx` | 题库(文件夹树+分类搜索) |
| `/problem/[id]` | `app/problem/[id]/page.tsx` | 做题页(题面+编辑器+判题) |
| `/notes` | `app/notes/page.tsx` | 笔记广场 |
| `/login` | `app/(auth)/login/page.tsx` | 登录 |
| `/register` | `app/(auth)/register/page.tsx` | 注册 |

## 8. 重要状态管理

| Store | 文件 | 持久化 |
|---|---|---|
| 工作区 | `problem-store.ts` | localStorage(codenow-workspace): problem/code/workspaceSplit/history/results |
| 题库 | `library-store.ts` | localStorage(codenow-problem-library): archives/folders/selectedFolder... |
| 主题 | `theme-store.ts` | localStorage(codenow-theme): themeMode/editorTheme |
| AI 配置 | `ai-store.ts` | localStorage(codenow-api-keys + codenow-ai-local-config) |
| 记忆池 | `memory-store.ts` | localStorage(codenow-user-memory) |

## 9. 已知问题 / 待办

1. **CSP 认证每届只有 1-2 题，需补齐到 4-5 题**——`scripts/testgen/csp-cert-complete.mjs` 已有补全代码但有语法 bug 待修
2. **`globals.css` 过长**（300KB+）——建议未来拆分但不影响功能
3. **`styles/` 目录除 tokens.css 外全是死文件**——考虑清理或接线
4. **AcWing 题库原始 JSON 29MB** 仍留在 public 目录供 enhance 脚本读取，前端不加载
5. **生产环境需要 BETTER_AUTH_SECRET 环境变量**，缺它会 500

## 10. 分支状态

- **当前分支**: `feat/local-data-migration`
- **最新提交**: 轮 1-28 逐轮标注 `opt: 第 N 轮——...`
- **测试**: 558/558 全绿
- **构建**: `npm run build` 通过

---

**建议接手的同事先做的事**：
1. `npm run build && npx vinext start --hostname 127.0.0.1 --port 3000` 跑起来看效果
2. `npm run test:unit` 确认测试全绿
3. 读 `docs/superpowers/specs/` 里的设计文档了解决策背景
4. **切记**：改 CSS 去 `app/globals.css`，别去 `app/styles/`
