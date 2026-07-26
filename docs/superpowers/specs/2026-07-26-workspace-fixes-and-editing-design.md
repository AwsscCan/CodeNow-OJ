# CodeNow OJ 交互修复与题面编辑设计（brainstorm 决策记录）

**日期**：2026-07-26
**状态**：已实现并验收（用户全权委托，TDD 工作流）
**范围**：桌宠点击换台词/换动作/拖拽竞态、题库文件夹整行拖动、AI 解析添加题失败反馈、题面解析与测试点生成解耦、AI 解题请求瘦身、题面手动编辑
**关联**：`2026-07-26-girl-theme-ui-polish-design.md`（同日 UI 精修）

## 1. 问题清单与根因（浏览器实测定位）

| 症状 | 根因 |
| --- | --- |
| 点击桌宠换台词"没用" | ① 台词池(4-5 条/情境)被 `recentLines`(窗口 12)耗尽后，`pickLocalLine` 退化为不排除当前句的全池随机，1/4 概率原句返回；② 配置 AI Key 后取词走上游往返(1-3s)，点击后长时间无反馈 |
| 点击"切换不了动作" | 台词池中同 sprite 台词多，新旧句立绘帧撞车；同 mood 连续两句时 one-shot 动画不重放 |
| 桌宠拖拽偶发卡死跟手 | `pointerup` 监听挂在 `useEffect([dragging])`，pointerdown 与 effect 提交之间的渲染间隙会丢 up 事件（同步派发实测复现） |
| 文件夹"不能整体拖动排序" | 仅 14px 宽 `⋮` 按钮 `draggable`；且 `onDragStart` 未调 `dataTransfer.setData`，Firefox 拖拽根本不启动 |
| "AI 解析添加练习题失效" | 端到端链路实测本身通畅；失败反馈只有 2.6 秒底部 toast（英文上游报错），用户等待期间视线在弹窗内，错过即"无反应" |
| "复杂的题目没办法添加" | `/api/generate-problem` 把题面结构化与 12-30 个测试点生成焊死在一次请求里，复杂题必超时(45s 上限) |
| AI 解题慢 | 请求体携带全量测试点(最多 30 个)拼进 prompt |
| AI 识别错误无法修正 | 题面只读，无编辑入口 |

## 2. 方案权衡（brainstorm 结论）

1. **换台词必换新句**：在 `pickLocalLine` 内以 `recent` 队尾为"当前句"近似并排除（`setLine`/`reactToJudge` 均把当前句 append 到队尾，近似恒成立）。备选"传入当前句参数"改动面大（API 层 request 结构、route 降级路径），弃。
2. **必换动作**：候选中优先挑 sprite 与当前句不同者（全池反查当前句 sprite）；另给 `.mascot-character` 加 `key={message}` 按台词重建节点强制重放 one-shot 动画。备选"扩充台词池让 sprite 均匀"治标不治本，弃。
3. **点击即时反馈**：配置 AI Key 时先同步 `setLine` 一句本地台词垫场，AI 台词返回后覆盖（台词连换两次在桌宠场景观感自然）。备选"点击后气泡显示加载态"引入新 UI 状态，弃。
4. **拖拽竞态**：window 监听改在 `startDrag`（pointerdown 处理器内）同步挂载，`dragCleanup` ref 承担停止/卸载双路径清理。备选 `setPointerCapture` 方案需重排事件绑定结构，改动更大，弃。
5. **文件夹整行拖动**：`draggable`/`onDragStart`(含 `setData`)/`onDragEnd` 提升到 `.folder-entry` 行容器，`⋮` 降级为纯视觉 span。HTML5 drag 点击（无位移）不触发 dragstart，行内按钮点击不受影响。
6. **解析失败反馈**：弹窗内 `role="alert"` 持久错误条（`.generate-error`），重新生成/重开弹窗时清除；toast 保留作外围提示。备选"拉长 toast 时长"影响全站其它 toast，弃。
7. **解析与测试点解耦**：`/api/generate-problem` 新增 `withTests`（默认 false 只结构化题面+官方样例，秒级返回）；前端弹窗加默认关闭的"同时生成 AI 测试点"开关。测试点走做题页既有"AI 分批生成"（数量可选、分批补齐），不重复造轮子。**默认值取 false 是行为变更**，与用户确认的诉求一致（复杂题先入库）。
8. **AI 解题瘦身**：`handleAskAi`/`handleSendChat` 请求体 `samples` 裁剪为前 2 条（题意理解足够）；弹窗文案同步。服务端不强裁，保留其它客户端自主权。
9. **题面编辑**：做题页题面 Tab 内嵌 `ProblemEditor` 组件（标题/难度/时限/内存/描述/输入输出格式），保存走 `store.setProblem` → 既有本地持久化 + 云端乐观并发同步链路零新增机制；样例/测试点编辑复用"测试点"Tab。备选"题库页弹窗编辑"需另拉取全量题数据且离校对上下文远，弃。
10. **题目插图**：题面 description/inputFormat/outputFormat 改经 notes 模块既有 `SafeMarkdown` 唯一安全出口渲染（白名单已含 `img`，src 仅放行 https/data:image//blob:/相对路径），Markdown 图片语法即插图；`ProblemEditor` 三个题面 textarea 支持直接粘贴图片自动转 base64 data URL 内嵌，单图上限 300KB（防 localStorage 与 D1 行大小爆炸），超限持久报错提示改用外链。备选"上传 API + R2 对象存储"对个人使用场景过度设计（YAGNI），弃；纯文本题面经 marked(breaks:true) 渲染基本无损，个别 Markdown 符号被解释可用编辑功能修正。
11. **立绘多样性**："桌宠只剩两个状态"根因是 coding 池 5 句台词只用了 sprite 0/2 两帧（wa 池同病）。扩充 idle/coding/wa 池台词补齐 sprite 1/3/4/5 覆盖，并以"高频池 sprite 种类 ≥ 3"测试作多样性下限保护。实测做题页连点立绘从 2 种升至 5 种。
12. **闲置高木图片资产上岗**（少女主题限定装饰，均 `aria-hidden` + `alt=""` + lazy）：`portrait-ribbon`/`portrait-sailor`/`sunny-selfie` → 题库 hero 拍立得三连（复活 globals.css 既有 `.girl-portrait-stack` 死样式）；`study-smile` → 首页快速开始卡陪伴条；`sunny-selfie` → 桌宠比试确认弹窗头图。非少女主题条件不渲染（不浪费流量）。`expression-guide.png`(2.2MB) 为美术参考图，出于性能不上 UI。

## 3. 验收记录

- 单测：`mascot-lines`(必换句/优先换动作) · `mascot`(拖拽状态机/动画重放) · `use-mascot-line`(垫场即时反馈) · `library-folder-drag`(整行拖拽写 folderOrder) · `library-import-error`(持久错误条/开关默认值) · `generate-problem-api`(解耦：默认 1 次上游调用) · `problem-workspace-ui`(投放区/徽章/编辑题面/请求瘦身) · `problem-editor`(表单校验)。
- 浏览器实测（vinext 生产构建 + Playwright）：桌宠 10 连点 0 相邻台词重复、0 相邻立绘重复；同步 down-up 三轮无 dragging 残留（旧实现第 2 轮即卡死）；文件夹整行 `draggable`；解析假 Key 约 1 秒失败并在弹窗内出持久错误条；编辑题面保存后标题与面包屑即时更新。
