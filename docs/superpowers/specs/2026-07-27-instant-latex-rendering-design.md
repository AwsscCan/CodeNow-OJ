# 题面 LaTeX 即时渲染设计

## 背景与问题

`SafeMarkdown` 当前先在客户端生成已净化的 Markdown HTML，再在 `useEffect` 中动态加载 `katex/contrib/auto-render` 并修改 DOM。题面因此经历“原始 `$...$` 文本 -> KaTeX DOM”两个可见阶段。

在 `CS0421` 的本地热服务测量中，原始公式文本约在导航后 240-251ms 出现，KaTeX 约在 265-315ms 出现，裸露窗口为 14-73ms。KaTeX 字体就绪只额外消耗约 20-33ms，因此主要延迟来自动态模块和 effect，而不是字体。

## 目标

- 客户端首次提交 `SafeMarkdown` 内容时，公式已经是 KaTeX DOM，不显示中间态 `$...$`。
- 保持 Markdown 白名单消毒、链接和图片 URI 限制。
- 代码块、`pre`、链接中的 `$` 不作为公式处理。
- 无公式内容不执行 KaTeX DOM 转换。
- KaTeX 解析失败时保留已净化的 Markdown，而不是让题面崩溃。
- 不改变题目、测试点、草稿或提交记录的数据模型和持久化逻辑。

## 方案

在 `renderMarkdownToSafeHtml` 内完成单阶段客户端渲染：

1. 使用 `marked` 解析 Markdown。
2. 使用现有 DOMPurify 白名单消毒 HTML。
3. 仅在源文本包含 `$` 时，把已消毒 HTML 放入临时 DOM 容器。
4. 同步调用静态导入的 KaTeX auto-render。
5. 返回已经包含 KaTeX DOM 的 HTML。

顺序必须是“先净化，后 KaTeX”。KaTeX 只接触已净化 DOM，等价于当前安全边界；不能在 KaTeX 后再次套用现有 DOMPurify 配置，因为该配置会删除 KaTeX 所需的 class 与 MathML 节点。

`SafeMarkdown` 删除动态 import、`useEffect` 和容器 ref，只负责按 `value` 计算最终 HTML并输出。服务端无 DOM 时继续返回转义纯文本兜底，避免引入服务端 DOM 模拟器。

## 错误处理

KaTeX 使用 `throwOnError: false`。若模块调用仍发生异常，捕获异常并返回已净化 Markdown HTML。安全净化失败不做降级绕过，继续由现有管线处理。

## 测试与验收

- RED：`renderMarkdownToSafeHtml("值为 $x+1$")` 同步返回 `.katex`，当前实现应失败。
- GREEN：同步渲染行内和块级公式；代码中的 `$HOME` 保持原样；普通 Markdown 与 XSS 测试继续通过。
- 组件测试：`render(<SafeMarkdown ... />)` 完成后无需 `waitFor` 即可查询到 `.katex`。
- 回归：运行相关单元测试、完整单元测试、生产构建和 `git diff --check`。
- 浏览器：重新测量 `CS0421`，确认不再观测到“原始 `$n$` 已出现但 `.katex` 尚未出现”的客户端中间态。

## 非目标

- 本次不更换 Markdown 引擎。
- 本次不引入 remark/rehype 数学插件。
- 本次不调整题目路由直接加载问题；该行为与 LaTeX 时序独立。
- 本次不改造测试点生成架构。
