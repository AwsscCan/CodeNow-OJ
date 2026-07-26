# CodeNow OJ 少女主题 UI 精修与做题入口设计

**日期**：2026-07-26
**状态**：已批准（用户全权委托）
**范围**：顶栏主题切换器与登录按钮美化、工作区同步状态徽章美化、首页真实做题入口、桌宠投放区收窄到编辑器代码区

## 1. 背景

现网四处体验断点：

1. **顶栏主题切换器**是原生 `<select>`（`app/components/topbar.tsx` 及三处内联复制），原生控件无法深度定制，在少女（girl）秋日玻璃主题下风格突兀。
2. **登录按钮**（`.header-login`）是一个细边框小链接，无质感，与少女主题的珊瑚渐变语言不符。
3. **工作区同步状态"仅本地"**（`app/problem/[id]/page.tsx` 的 `.sync-status`）在 `globals.css` 中完全没有样式声明，是裸文本；文案生硬。
4. **首页（做题 Tab 落地页）没有真正通向做题的入口**：`.hero-section` 系列类名在任何已引入的 CSS 中都不存在（样式裸奔）；"开始做题"按钮硬编码跳 `/problem/P1001` 且不装载题目，若 store 中是另一题会出现 URL 与内容错位。
5. **桌宠投放区过大**：`data-mascot-drop-zone` 挂在整个 `.code-panel`（含编辑器工具栏、控制台、状态栏），拖到控制台也会触发"比试确认"。需求：仅编辑器代码区触发。

另有架构债：`app/styles/*.css` 令牌化文件**未被任何入口引入**（globals.css 只引 tailwind + tokens.css），实际生效样式全在 `globals.css`；首页/题库/做题三页各自内联复制了顶栏 JSX（DRY 违规）。

## 2. 设计决策

1. **主题切换器改为三段式分段控件**（radiogroup 语义：☀ 亮 / ☾ 暗 / ❀ 少女），替代原生 select。分段控件可完全样式化，三主题各有激活态配色；无障碍角色从 `combobox` 变更为 `radiogroup`，相应回归测试同步更新。
2. **登录按钮升级为渐变胶囊**：带 `aria-hidden` 装饰符号 ✦，无障碍名保持"登录"；亮/暗主题蓝色渐变，少女主题珊瑚渐变（复用 `--color-primary-gradient` token）。
3. **同步状态改为带状态圆点的胶囊徽章**，文案 `local-only` 由"仅本地"改为"本地保存"（更温和、跨主题通用；不做按主题分文案的过度设计）。`app/components/notes/note-editor.tsx` 的同名文案一并统一。
4. **首页新增"快速开始"入口区**：
   - "继续做题"主 CTA 跳 `/problem/${store.problem.id}`（延续 problem-store 持久化的当前题），修复硬编码 P1001 的错位 bug；
   - 精选入口列表：内置 P1001 + AcWing 目录前 3 题，点击走 `loadLocalProblem` 后跳转（与题库页 `openBundled` 同语义）；
   - "进入题库"保留。hero 与入口区补齐三主题自适应样式（纯 token 引用）。
5. **桌宠投放区**：`data-mascot-drop-zone="editor"` 从 `.code-panel` 移到 `.editor-area`（Monaco 容器），控制台/工具栏/状态栏不再命中。判定函数 `droppedInsideEditor` 逻辑不变。
6. **DRY**：首页、题库页、做题页删除内联顶栏，统一使用 `app/components/topbar.tsx`（notes 三页已在用）。各页 `onSignedOut` 清理逻辑作为 prop 传入，行为不变。
7. **样式落点**：新样式追加进 `globals.css`（现网唯一生效入口），一律引用 `tokens.css` 的 `--color-*`/`--radius-*`/`--space-*` token 实现三主题自适应；不启用未接线的 `app/styles/*.css`（另行偿还的架构债，不在本次范围）。

## 3. 验收标准（TDD）

1. `Topbar` 渲染 `role="radiogroup"`（无障碍名"网站主题"）与三个 `role="radio"` 选项；当前主题 `aria-checked`，点击调用 `setThemeMode`。
2. 未登录时登录入口无障碍名为"登录"，装饰符号 `aria-hidden`。
3. 首页存在快速开始区：主 CTA 跳 store 当前题；精选条目点击后装载题目并跳对应 `/problem/{id}`。
4. 做题页 `[data-mascot-drop-zone]` 命中 `.editor-area` 自身，且 `.console-panel` 不在投放区子树内。
5. 做题页同步徽章渲染"本地保存"文案与状态圆点结构。
6. 既有测试全绿（`homepage-a11y` 的 combobox 断言按第 2.1 条决策更新为 radiogroup）。
