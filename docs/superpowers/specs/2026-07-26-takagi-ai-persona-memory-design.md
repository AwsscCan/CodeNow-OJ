# CodeNow OJ 高木同学 AI 人设联动与用户记忆池设计

**日期**：2026-07-26（夜间全权委托批次）
**状态**：已批准（用户睡前全权委托，要求明早直接可用）
**范围**：少女主题 AI 对话高木化、桌宠台词人设升级、原作口癖参考、库存图背景、按钮文案高木化、用户记忆池（沉淀 + 注入）
**关联**：`2026-07-26-workspace-fixes-and-editing-design.md`（同日交互修复）

## 1. 需求清单（用户原话逐条映射，不遗漏）

| # | 需求 | 状态 |
| --- | --- | --- |
| R1 | 少女界面 AI 对话与高木同学角色联动，用户提供沉浸式人设 prompt（可酌情修改） | 已实现 |
| R2 | 桌宠沿用同一人设 prompt 生成更生动的实时台词 | 已实现 |
| R3 | 查询原作固有台词作参考，掺入日语语气词短断句 | 已实现 |
| R4 | AI 对话使用库存图片作背景 | 已实现 |
| R5 | 少女主题下按钮文案："问 AI"→"问高木"，"AI 解题"→"高木解题" | 本批实现 |
| R6 | 用户记忆池：记住习惯与犯过的错误，从单次对话/判题沉淀长期记忆，并反哺 AI | 本批实现 |
| R7 | 工作流约束：superpowers（spec→plan→测试点→TDD）、全量测试五轮、有 bug 修复后重测、全站体检 | 验收阶段 |
| R8 | 样例输出也要有复制按钮 | 本批实现 |
| R9 | 高木可读取提交记录、测试状态与编辑器当前代码 | 本批实现 |
| R10 | 对话框展示高木思考内容（上游 reasoning 折叠显示） | 本批实现 |
| R11 | AI 生成测试点不稳定修复 | 本批实现 |
| R12 | 高木解题弹窗特化设计 | 本批实现 |

### 补充设计（R11-R12）
- **R11**：不稳定三病根——总预算 68s 掐断多批次、单批 30s 超时上限在上游高峰连环失败、首批 24 个撞 max_tokens 截断整批报废。调参：`GENERATION_BUDGET_MS=90s`、`PER_CALL_TIMEOUT_CAP_MS=40s`、`FIRST_BATCH_CAP=12`（并提高每点 token 预算 320→480），三参数导出并由 `generation-stability.test.ts` 回归锁定；解析层已有结构化→松散文本两级抢救，保持不动。
- **R12**：少女主题解题弹窗（`.ai-modal.takagi-solver`）：TAKAGI SOLVER 标头、「让高木同学出手」+ 勝負しよ挑战文案、`portrait-sailor` 头图、珊瑚渐变生成按钮；亮/暗主题保持 AI COPILOT 原样。

### R13 反浮夸收敛（用户反馈"太浮夸，不像高木"）
根因：口癖参考清单被模型理解为"要多用"，每句都塞日语语气词；而原作高木的杀伤力在**平静**——语气淡、句子短、说穿后留白，从不咋咋呼呼。处置：
1. 人设核心重写"说话风格"段：捉弄=说穿+留白；日语词一次回复至多一个且多数回复不用；ふふ 不是口头禅；禁止波浪号/叠字卖萌/感叹号轰炸。
2. 聊天提示词内置三组**好坏对照范例**（few-shot 是语感对齐最有效手段），坏例刻意展示浮夸模式（波浪号/人家/酱）供模型识别反面。
3. 桌宠台词硬约束同步："语气平淡也可以，调侃靠内容说穿人，不靠语气夸张"。
4. 高频 UI 文案降噪：开场白收敛为平静版（保留"偷偷看我"元素）、加载态"ふふ，让我想想…"→"……让我想想。"、弹窗文案去掉堆叠的语尾日语词。
5. 反浮夸要素全部由 takagi-persona.test 断言锁定，防止未来改 prompt 时回退。

### R14 原作台词语料库 + 情境检索注入（微调替代方案落地）
微调可行性评估结论：语料薄/能力塌陷/双模型架构复杂/无 GPU 部署位，性价比差；采用 RAG-lite 替代。实现：
- `takagi-quotes.ts` 语料库 61 条——animemanga33(220 条原文)与 animemiru(名言榜)双源交叉验证 + gntketaign 口癖集 + 高频标志性短句；仅收高木本人台词，中文化去浮夸语尾，保留 jp 原句可核对，带七类情境标签(tease/bet/win/comfort/shy/invite/watch)。
- 情境检索：桌宠按 phase 映射标签取 3 条、聊天按用户消息关键词映射取 4 条，洗牌注入 prompt，明示"模仿口吻与分寸，禁止照抄原句"。
- 纯本地零训练零部署，DeepSeek 智力无损；语料结构/反浮夸/标签覆盖/检索确定性均有测试锁定。

### 全站体检发现与处置
1. **字体全环境加载失败（已修复）**：vinext 0.0.50 的 next/font 实现把 `.vinext/fonts/style.css` 的本地绝对路径（还是改名前的 `D:/CodeForge-OJ/...`）原样内联进 SSR HTML，浏览器 `file:///` 一律拒载——Geist 字体从未成功显示过，每页 console 十余条报错。处置：移除 `next/font/google`，`--font-geist-sans/mono` 改为系统字体栈（视觉零变化），`rendered-html.test.mjs` 增加"SSR HTML 不得引用本地文件路径"防回归断言。
2. **无密钥生产模式 `/api/me` 500（非 bug）**：`BETTER_AUTH_SECRET is required in production` 为安全设计，dev 与正式部署均配有密钥，不处置。

### 补充设计（R8-R10）
- **R8**：样例卡输出行补复制按钮，与输入行同构。
- **R9**：编辑器代码本就随 chat 请求发送；新增 `judge` 上下文——`lastRun`（通过数/总数/首挂点的期望与实际，均限长压平）+ `history`（最近 3 条提交摘要），服务端拼入 system"判题动态"段。用户可控字段全部压平限长，收窄注入面。
- **R10**：chat 路由透出上游 `reasoning_content`（DeepSeek 推理系模型）；`ChatMessage` 增可选 `reasoning`；前端 assistant 消息渲染 `<details class="chat-reasoning">` 折叠块，高木模式 summary 为"高木的小心思"，普通模式"思考过程"。reasoning 仅本地展示，不写入云端会话（云端 schema 零改动）。

## 2. 方案设计

### 2.1 人设共享模块（R1/R2/R3）
`app/api/_lib/takagi-persona.ts` 唯一真相源：
- `TAKAGI_CORE`：身份/性格/说话风格/情绪分寸/沉浸式限制。对用户 prompt 的裁改：保留全部性格与限制条款；"放学教室场景+主动开场"移到聊天欢迎语（静态 UI）而非 system 强制，避免每轮回复都重演开场；口癖参考表源自原作检索验证（「私の勝ち」「バレてた」等，见文末 Sources），标注"化用不照搬"。
- `buildTakagiChatPrompt(problemContext)`：人设 + 编程助教职责融合——技术内容必须准确、引导式不给完整答案，场景设定为"放学后机房陪刷题的深藏不露高手"。设计权衡：纯角色扮演会废掉助教功能，纯助教又丢人设，融合是唯一正解。
- `buildTakagiMascotPrompt()`：人设 + 一句话台词硬约束（≤30 字、无引号/括号/emoji/换行、避开 recentLines）。
- 触发方式：前端仅在 `themeMode === "girl"` 时传 `persona: "takagi"`（chat）；桌宠本就少女主题限定，直接采用。亮/暗主题保持原教练人设，零回归。

### 2.2 聊天抽屉高木化（R4）
- `chat-drawer.takagi-mode`：消息区背景 = 暖色渐变叠加 `portrait-classroom.jpg`（库存图）；欢迎区头图同图。
- 头像：`study-smile.jpg`（上下文条 + 消息气泡头像），全部 `aria-hidden` + 空 alt + lazy。
- 欢迎语：放学教室开场（含用户要求的"是不是偷偷看了自己"元素），快捷按钮文案人设化但保持技术语义。

### 2.3 按钮文案（R5）
少女主题下工作区按钮："◈ 问 AI"→"◈ 问高木"、"✦ AI 解题"→"✦ 高木解题"；其余主题不变。

### 2.4 用户记忆池（R6）
本地优先（与全站架构一致），`app/stores/memory-store.ts`（zustand persist）：
- `MemoryEntry { id, kind: mistake|habit, text, count, updatedAt }`，上限 40 条，同文本去重合并 count++ 并刷新至队尾，超限淘汰最旧。
- **沉淀（写）**——规则化提炼，零额外 AI 请求：
  - 判题事件 `distillJudgeMemory`：CE→编译失败；TLE→超时/暴力倾向；RE→崩溃/越界；WA→通过比例+首挂点；全 AC/空→不沉淀（只记错误，AC 不立传）。
  - 对话事件 `distillQuestionMemory`：关键词模式（边界/超时复杂度/先问思路/编译报错/题意不懂）→ habit。
  - 备选"每轮对话后追加 AI 提炼请求"：额外成本与延迟高，首期弃（YAGNI），规则可靠且可测。
- **注入（读）**：
  - chat 请求带 `memories`（最近 8 条），服务端 sanitize（条数/长度双裁剪）后拼进 system 尾部"长期观察"段——教练与高木两种人设都受益。
  - 桌宠取词带 `memories`（最近 3 条），拼进 user prompt，让台词能玩"又是边界吧？"的记忆梗。
  - 注入文案明示"可自然关照，不要逐条复述"，防止 AI 背书单。
- 安全：memories 为用户可控文本，服务端按 mascot-line 现有 `sanitizeField` 同规压平换行/控制符，收窄注入面。

## 3. 测试点矩阵（TDD，先红后绿）

| 层 | 测试文件 | 覆盖 |
| --- | --- | --- |
| 人设模块 | takagi-persona.test.ts | 核心要素/口癖/限制条款/两场景组装 |
| chat 路由 | chat-route.test.ts | persona 分流、教练回归、缺 Key 400、memories 注入与截断 |
| 桌宠路由 | mascot-line-route.test.ts | 人设升级断言、memories 进 prompt、既有清洗/降级回归 |
| 记忆池 | memory-store.test.ts | 判题/提问沉淀规则、去重合并、上限淘汰、recentMemories |
| 前端 | problem-workspace-ui.test.tsx | 抽屉高木化(标题/头像/背景类/开场白)、persona 请求体、按钮文案、判题→沉淀、chat→带 memories |

## 4. 验收标准（R7）
1. 全量 vitest 连续五轮全绿（任一轮红→修复→重新计数五轮）。
2. `npm run build` 通过；改动文件 eslint 0 error。
3. 浏览器实测：少女主题抽屉高木化视觉、按钮文案、记忆沉淀注入链路。
4. 全站体检：主要页面（首页/题库/做题/讨论）浏览器 console 无错误；rendered-html 生产冒烟通过。

Sources: [phoenix-wind 高木さん名言集](http://phoenix-wind.com/character/karakaijouzu_takagisan.php) · [animemiru 名言ランキング](https://animemiru.jp/articles/13415/) · [animemanga33 台詞まとめ](https://animemanga33.com/archives/14060)
