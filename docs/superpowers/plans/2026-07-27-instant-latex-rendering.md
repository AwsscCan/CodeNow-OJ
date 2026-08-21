# 题面 LaTeX 即时渲染实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除题面中原始 LaTeX 文本先出现、随后才变成 KaTeX 的可见中间态。

**Architecture:** 保留 `marked -> DOMPurify` 安全边界，在同一个同步渲染函数中对已净化临时 DOM 执行 KaTeX auto-render。`SafeMarkdown` 变成无异步副作用的纯输出组件。

**Tech Stack:** React 19、TypeScript、marked、DOMPurify、KaTeX、Vitest、Testing Library、Playwright。

## Global Constraints

- 不改变题目、测试点、草稿、提交记录或文件夹持久化数据。
- 不新增 Markdown/LaTeX 依赖。
- KaTeX 必须只处理已经通过 DOMPurify 的 HTML。
- 不提交或推送 Git 变更。

---

### Task 1: 锁定同步渲染契约

**Files:**
- Modify: `tests/unit/safe-markdown-latex.test.tsx`
- Test: `tests/unit/safe-markdown-latex.test.tsx`

**Interfaces:**
- Consumes: `renderMarkdownToSafeHtml(markdown: string): string`、`SafeMarkdown`。
- Produces: 首次客户端渲染同步包含 `.katex` 的回归契约。

- [x] 添加渲染函数同步返回 `.katex` 的测试。
- [x] 添加组件 `render` 返回后立即存在 `.katex` 的测试。
- [x] 运行 `npx vitest run tests/unit/safe-markdown-latex.test.tsx`，确认测试因当前异步 effect 设计失败。

### Task 2: 把 KaTeX 纳入同步安全管线

**Files:**
- Modify: `app/lib/notes/markdown.ts`
- Modify: `app/components/notes/safe-markdown.tsx`
- Test: `tests/unit/safe-markdown-latex.test.tsx`
- Test: `tests/unit/safe-markdown.test.ts`

**Interfaces:**
- Consumes: 已净化 HTML、KaTeX `renderMathInElement`。
- Produces: `renderMarkdownToSafeHtml` 的最终 KaTeX HTML；无异步副作用的 `SafeMarkdown`。

- [x] 静态导入 KaTeX auto-render，并复用当前 delimiters、ignoredTags 与 `throwOnError` 设置。
- [x] 在 DOMPurify 之后用临时容器同步渲染公式，异常时返回已净化 HTML。
- [x] 删除 `SafeMarkdown` 的动态 import、effect 和 ref。
- [x] 运行两个 Markdown 测试文件，确认通过。

### Task 3: 回归与浏览器验收

**Files:**
- Verify: `app/lib/notes/markdown.ts`
- Verify: `app/components/notes/safe-markdown.tsx`
- Verify: `tests/unit/safe-markdown-latex.test.tsx`

**Interfaces:**
- Consumes: 完成后的同步 Markdown/KaTeX 管线。
- Produces: 测试、构建与真实浏览器时序证据。

- [x] 运行全部单元测试。
- [x] 运行生产构建。
- [x] 运行相关 ESLint 与 `git diff --check`。
- [x] 使用 Playwright 打开 `CS0421`，验证 `.problem-md` 出现时已经包含 `.katex`，且没有原始公式中间态。
