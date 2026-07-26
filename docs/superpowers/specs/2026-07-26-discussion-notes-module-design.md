# CodeNow OJ 讨论与笔记模块设计

**日期**：2026-07-26
**状态**：待批准
**范围**：仿博客交互的用户笔记/讨论模块，私有为主、单篇可发布公开，双向关联自建题库，Markdown 安全渲染、标签、评论、点赞收藏与举报

## 1. 背景

CodeNow OJ 已完成认证、题库云端化与游客数据迁移（见 `2026-07-25-user-auth-data-persistence-design.md`）。顶栏「讨论」入口目前仍是占位吐司（`app/components/topbar.tsx` 的 `onToast("讨论区正在开发中")`）。用户缺少一个记录解题思路、题解笔记，并可选择分享给他人的场所。

本模块新增「讨论与笔记」功能：用户以 Markdown 写作笔记，可从自己的题库插入题目引用卡片，也可在题目详情页直接为某题挂笔记；笔记默认私有，作者可将单篇发布为公开，公开后所有登录用户可浏览、评论、点赞、收藏、举报。整套实现严格复用现有「用户私有 + `version` 乐观并发同步 + 本地优先迁移」五层架构，不新造机制。「单篇发布公开」是本项目首个打破「所有私有查询必带 `user_id`」铁律的场景，也是首个真正渲染用户富文本的场景，故安全设计是本 spec 的重点。

## 2. 已确认的产品决策

以下第 1–4 项已与产品方确认；第 5–13 项为设计阶段依据现有架构与安全约束做出的裁决，均标注理由，供评审时推翻。

1. **可见范围**：私有为主 + 单篇可发布公开。默认私有，作者可将某篇笔记切换为公开；公开后所有登录用户可浏览/评论/点赞/收藏/举报。
2. **交互功能**：Markdown 编辑器 + 安全详情渲染、标签/分类、评论区、点赞 + 收藏，全部实现。
3. **题目关联**：双向。(a) 写笔记时从自己题库选题，在正文插入可点击的题目引用卡片；(b) 在题目详情页 `app/problem/[id]` 直接为该题挂笔记（一题可挂多篇，多对一）。
4. **交付物**：先产出本 spec 与分阶段 plan，批准后再实现，本文不含业务代码。
5. **物理命名统一为 `notes`**（表、外键列 `note_id`、索引、仓储、store、client-lib、REST 资源、路由全用同一名族），顶栏与文案仍称「讨论」。理由：避免 `posts` 与 `notes` 在数据/API/UI/限流四层各叫一个名导致外键列名、索引名、文件名对不上而编译不过（详见附录 A 命名对照表）。
6. **公开笔记允许游客（未登录）只读**浏览正文、评论与点赞数；发布、评论、点赞、收藏、举报一律需登录。理由：对齐内置题库「公共只读」现状，利于分享。
7. **评论仅对 `public` 且 `published` 的笔记开放，评论区默认纯文本渲染**（不走 Markdown）。理由：私有帖不开放自评可消除「私有期自评在转公开后被一并曝光」的歧义，纯文本评论收窄 XSS 攻击面。
8. **私有笔记：作者可收藏（作为稍后读书签）、禁止点赞、禁止评论**；非作者与游客对私有笔记一律 `404`。
9. **一题可挂多篇笔记**（多对一），题目关联索引用普通 `index`，不设唯一约束。
10. **软下架用正交列 `moderation_state`**（`visible`/`hidden`），不复用 `visibility` 回退，避免与作者主动设私有语义混淆；举报自动下架列为可选的阶段 5。
11. **标签每用户私有**；公开广场按标签「名称」文本聚合，不共享跨用户 `tag_id`。
12. **举报数据本期落库**（`reports` 表 + 提交端点），但人工审核后台为非目标；阈值自动下架为可选阶段 5。
13. **公开读首期用 `no-store`（无 `private`）兜底**，不上 CDN 公共缓存；公开响应采用「无用户态字段」的匿名序列化，个性化字段（`viewerLiked` 等）只出现在 `private, no-store` 响应中。CDN 公共缓存列为后续优化。

## 3. 目标与非目标

### 3.1 目标

1. 登录用户创建、编辑、软删除、列出自己的 Markdown 笔记，跨设备恢复。
2. 笔记默认私有；作者可将单篇发布为公开或取消发布，公开后对全体登录用户（及只读游客）可见。
3. 双向题目关联：正文插入题库题目引用卡片；题目详情页新增「笔记」Tab 挂该题笔记。
4. 标签/分类：为笔记打私有标签，列表按标签筛选。
5. 评论区：公开笔记下评论、回复（一层楼中楼）、删除，权限区分。
6. 点赞与收藏：对公开笔记点赞、收藏，作者可收藏自己的私有笔记。
7. Markdown 富文本安全渲染：默认纯文本、白名单放开，杜绝存储型 XSS。
8. 游客本地草稿笔记安全、可预览、幂等地迁移上云。
9. 举报公开内容并落库；累计举报可自动软下架（可选）。

### 3.2 非目标

1. 人工审核后台、管理员角色、封禁与申诉工单系统。
2. 无限层级评论、评论点赞、@提及、站内通知与私信。
3. 字段级冲突自动合并、完整历史版本与协同编辑。
4. 公开内容的全文检索（FTS）、SEO/服务端首屏渲染（延续现有全 `use client` 拉取）。
5. 富文本所见即所得编辑器（仅 Markdown 源码 + 预览）、外链图片（首期仅允许 `data:`/自托管）。
6. 关注、粉丝、个人主页、积分与排行榜等社交体系。

## 4. 总体架构

模块沿用现有五层落地，零发明：

```
db/schema.ts（表 + 迁移）
  → app/server/notes/*-repository.ts（仓储：Result<T> + 所有权 + 版本冲突 + 公开读独立路径）
    → app/api/notes|comments|reactions|reports|tags/route.ts（路由：resolveContext + apiError + 缓存头）
      → app/lib/note-api.ts（客户端 fetch 封装）
        → app/stores/note-store.ts（Zustand 本地缓存 + 账号切换 + hydrate + 五态同步）
          → app/notes/*、app/problem/[id] 笔记 Tab（页面与组件）
```

关键跨界点：**「单篇发布公开」打破「私有查询必带 `user_id`」铁律**。为此读取路径物理分离为两条独立方法——私有读 `owned(userId,id)`（`where` 恒带 `userId`）与公开读 `readPublic(id)`/`listPublic(cursor)`（`where` 仅命中 `visibility='public' AND status='published' AND moderation_state='visible' AND deleted_at IS NULL`，不带 `userId`）——**绝不在同一 `where` 用 `or` 混写**，出仓函数剥掉 `user_id` 只暴露作者展示名。

安全基座 `SafeMarkdown`（新增）是所有富文本渲染的唯一出口，存储只存 Markdown 原文、渲染层白名单消毒。

## 5. 组件边界

### 5.1 服务端组件（`app/server/notes/`）

- `note-repository`：笔记 CRUD、私有列表、独立公开读（`readPublic`/`listPublic`）、发布切换、软删除、题目引用卡随体替换、乐观并发。
- `comment-repository`：评论创建/列表/删除，权限（评论作者或帖主）、软删占位、`comment_count` 原子维护。
- `reaction-repository`：点赞/收藏 toggle（复合主键幂等），计数聚合与冗余计数维护。
- `report-repository`：举报落库（同人对同目标唯一），阈值统计（阶段 5 自动下架）。
- `tag-repository`：每用户私有标签的 upsert 与列出，`note_tags` 随体替换。
- `note-migration`：扩展 `import-service` 的 `notes` 校验与写入分支（含悬空 `problem_ref` 降级）。

路由层只负责身份、输入校验、缓存头与响应映射，业务规则在仓储层。

### 5.2 客户端组件（`app/lib/`、`app/stores/`、`app/components/notes/`）

- `note-api`：类型化 fetch 封装，只提交 `title/content/tags/visibility/problemRefs` 等白名单字段，绝不夹带 `userId`。
- `note-store`：Zustand，游客草稿 + UI 偏好走 `persist`，云镜像与计数缓存不落盘；`switchNoteAccount` 切账号清缓存、`hydrateNotes` 登录覆盖。
- 新建组件：`SafeMarkdown`、`NoteCard`、`NoteEditor`、`ProblemRefPicker`、`ProblemRefCard`、`NoteVisibilityToggle`、`CommentList`、`CommentComposer`、`SyncStatusIndicator`、`ReportDialog`。
- 复用组件：`Topbar`、`AuthStatus`、`Toast`/`useToast`、`SyncConflictDialog`、`useCloudSave`、`.modal` 弹窗、`.difficulty` 徽章、`.library-page` 栅格、`.sync-status` 五态样式。

### 5.3 页面（`app/notes/`、`app/problem/[id]`）

- `app/notes/page.tsx`：笔记列表（我的 / 公开广场双视图）。
- `app/notes/new/page.tsx`：编辑器（新建）；编辑已有笔记复用同组件，经 `app/notes/[id]?edit=1` 进入。
- `app/notes/[id]/page.tsx`：详情（安全正文、引用卡、点赞收藏、评论区、举报）。
- `app/problem/[id]/page.tsx`：新增第三 Tab「笔记」，与本模块同源。

## 6. 数据模型

所有 ID 由服务端 `crypto.randomUUID()` 生成，时间统一 `timestamp_ms`（毫秒），业务层写入时显式赋 `created_at`/`updated_at`（D1 无 `CURRENT_TIMESTAMP`）。可编辑且需同步的资源带整数 `version`，并软删除 `deleted_at`（可空、纳入列表索引）。私有查询恒带 `user_id`；「公开可见」是唯一放宽读所有权约束的场景，实现见 6.7。表名 `snake_case`，与现有 `db/schema.ts` 风格一致。

### 6.1 认证表

复用现有 `user`/`session`/`account`/`verification`，不新增或修改。全部新业务表通过 `user_id`（或 `reporter_user_id`）外键关联 `user.id`，`onDelete = cascade`。

### 6.2 业务表总览

| 表 | 主要字段 | 关键约束 |
|---|---|---|
| `notes`（笔记主表） | `id`, `user_id`, `title`, `content`(md), `summary?`, `cover_url?`, `visibility`(private\|public), `status`(draft\|published), `moderation_state`(visible\|hidden), `hidden_reason?`, `source`(standalone\|problem), `problem_kind?`, `problem_ref?`, `like_count`, `favorite_count`, `comment_count`, `published_at?`, `version`, `deleted_at?`, `created_at`, `updated_at` | 乐观并发 `version`；软删除；`visibility`/`status`/`moderation_state`/`source`/`problem_kind` 各配 `check`；冗余计数由服务端同批维护 |
| `note_problem_refs`（正文引用的多道题） | `id`, `note_id`, `user_id`, `problem_kind`, `problem_ref`, `sort_order` | 归属与父笔记一致；`(note_id, sort_order)` 唯一；随帖整体 `replace`；无独立 `version` |
| `note_comments`（评论） | `id`, `note_id`, `user_id`, `parent_id?`, `content`, `version`, `deleted_at?`, `created_at`, `updated_at` | 仅公开笔记可评；`parent_id` 自引用一层楼中楼；软删保留占位 |
| `note_reactions`（点赞 + 收藏合表） | `user_id`, `note_id`, `kind`(like\|favorite), `created_at` | 复合主键 `(user_id, note_id, kind)` 天然幂等；toggle 用 insert/delete；`kind` 配 `check` |
| `tags`（每用户私有标签） | `id`, `user_id`, `name`, `created_at` | `(user_id, name)` 唯一 |
| `note_tags`（笔记-标签多对多） | `note_id`, `tag_id`, `user_id` | 复合主键 `(note_id, tag_id)`；归属与父笔记一致 |
| `reports`（公开内容举报） | `id`, `reporter_user_id`, `target_kind`(note\|comment), `target_id`, `reason`, `status`(open\|reviewed\|dismissed\|actioned), `created_at`, `updated_at` | `(reporter_user_id, target_kind, target_id)` 唯一（同人同目标只举报一次） |

`problem_kind` / `problem_ref` 完全复用现有约定：`problem_kind='private'` 时 `problem_ref` 指向 `problems.id`（写入校验 `ownedProblem`，跨用户题视为无效），`problem_kind='public'` 时指向公共题 Key。本模块不新造题目关联字段。

### 6.3 `notes`（笔记主表）字段明细

「题目详情页挂的笔记」**不单独建表**，实现为 `notes` 的一种：`source='problem'` + `problem_ref`/`problem_kind` 绑定该题；「独立笔记/讨论帖」用 `source='standalone'`。取舍论证：两者字段完全同构（标题、Markdown、标签、评论、点赞、收藏、可见性、版本、软删），拆表将导致仓储/路由/客户端/store/渲染五层各写两遍，严重违反 DRY，且「题目笔记转公开讨论帖」会退化为跨表迁移。用一个 `source` 枚举 + 复用 `problem_ref` 即可覆盖全部场景，与现有 `code_drafts`/`ai_conversations` 复用 `problem_ref` 的思路一致。

| 列 | 类型 | 约束 / 说明 |
|---|---|---|
| `id` | `text` | 主键 UUID |
| `user_id` | `text` | 作者，`references(user.id, cascade)`，`notNull` |
| `title` | `text` | `notNull`，≤ 200 字符 |
| `content` | `text` | `notNull`，Markdown 原文，≤ 512 KiB（字节） |
| `summary` | `text` | 可空，列表摘要（作者自填或服务端截取），≤ 500 字符 |
| `cover_url` | `text` | 可空，封面（受 CSP `img-src` 约束，仅 `data:`/自托管） |
| `visibility` | `text` enum `['private','public']` | `notNull` `default('private')` + `check` |
| `status` | `text` enum `['draft','published']` | `notNull` `default('draft')` + `check`；仅 `status='published' AND visibility='public'` 时对非作者可见 |
| `moderation_state` | `text` enum `['visible','hidden']` | `notNull` `default('visible')` + `check`；与 `visibility` 正交，`hidden` 时公开不可见但作者可见 |
| `hidden_reason` | `text` | 可空，软下架原因 |
| `source` | `text` enum `['standalone','problem']` | `notNull` `default('standalone')` + `check` |
| `problem_kind` | `text` enum `['private','public']` | 可空（仅 `source='problem'` 时有值）+ `check` |
| `problem_ref` | `text` | 可空，与 `problem_kind` 成对 |
| `like_count` / `favorite_count` / `comment_count` | `integer` | 均 `notNull` `default(0)`，冗余计数，仅统计未软删子项 |
| `published_at` | `integer(timestamp_ms)` | 可空，首次发布公开时置值 |
| `version` | `integer` | `notNull` `default(1)`，乐观并发 |
| `deleted_at` | `integer(timestamp_ms)` | 可空，软删除 |
| `created_at` / `updated_at` | `integer(timestamp_ms)` | 均 `notNull`，业务层写入 |

**冗余计数取舍**：`like_count`/`favorite_count`/`comment_count` 冗余化，避免公开列表每行 `count()` 聚合的 N 次扫描。它们不是真相源（`note_reactions`/`note_comments` 才是），只在同一 D1 batch / 本地 transaction 内随反应/评论写入原子 `+1/-1`，异常时以聚合重算为准。**计数列不参与 `version` 冲突判定**（高频点赞不应持续对作者笔记制造 409 阻断编辑）。

索引：
- `index('notes_user_id_updated_at_idx').on(user_id, updated_at)` —— 作者私有列表游标分页。
- `index('notes_user_id_deleted_at_idx').on(user_id, deleted_at)` —— 软删过滤。
- `index('notes_user_id_problem_ref_idx').on(user_id, problem_kind, problem_ref)` —— 题详情页拉该题笔记（普通 index，允许一题多笔记，决策 9）。
- `index('notes_visibility_status_moderation_published_at_idx').on(visibility, status, moderation_state, published_at)` —— 公开广场列表游标分页（跨用户、不带 `user_id`）。

### 6.4 `note_problem_refs`（正文题目引用卡）

支撑「写笔记时从自己题库选题插入可点击引用卡片」，一篇可引用多道有序题目。

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | `text` | 主键 UUID |
| `note_id` | `text` | `references(notes.id, cascade)` `notNull` |
| `user_id` | `text` | `references(user.id, cascade)` `notNull`（冗余作者列，供所有权直查） |
| `problem_kind` | `text` enum `['private','public']` | `notNull` + `check` |
| `problem_ref` | `text` | `notNull` |
| `sort_order` | `integer` | `notNull` |

索引：`uniqueIndex('note_problem_refs_note_id_sort_order_unique').on(note_id, sort_order)`；`index('note_problem_refs_user_id_note_id_sort_order_idx').on(user_id, note_id, sort_order)`。写入照搬 `test_cases` 的 `delete + insert` 事务整体替换（`replaceTestCases` 样板），与父笔记 `version` bump 同批次。**不带独立 `version`**（随父笔记走）。单篇引用数 ≤ 50。

### 6.5 `note_comments`（评论，一层楼中楼）

| 列 | 类型 | 约束 |
|---|---|---|
| `id` | `text` | 主键 UUID |
| `note_id` | `text` | `references(notes.id, cascade)` `notNull` |
| `user_id` | `text` | 评论者，`references(user.id, cascade)` `notNull` |
| `parent_id` | `text` | 可空，`references(note_comments.id, cascade)` 自引用（须标注 `AnySQLiteColumn`） |
| `content` | `text` | `notNull`，≤ 64 KiB（字节），纯文本 |
| `version` | `integer` | `notNull` `default(1)`，供作者删除自评的乐观并发 |
| `deleted_at` | `integer(timestamp_ms)` | 可空，软删占位（楼中楼被删父楼仍显示「已删除」，占位不计入 `comment_count`） |
| `created_at` / `updated_at` | `integer(timestamp_ms)` | 均 `notNull` |

**只做一层 `parent_id`**（回复评论）而非无限嵌套。**权限**（决策 7/8）：仅当目标笔记 `visibility='public' AND status='published' AND moderation_state='visible'` 时任意登录用户可评；私有笔记不可评（含作者本人），非作者请求私有笔记评论一律 404。删除许可给评论作者或帖主。写评论与父笔记 `comment_count += 1` 同批次；软删评论 `-1`。

索引：`index('note_comments_note_id_deleted_at_created_at_idx').on(note_id, deleted_at, created_at)`（帖内列表游标 `created_at|id`）；`index('note_comments_user_id_created_at_idx').on(user_id, created_at)`；`index('note_comments_note_id_parent_id_created_at_idx').on(note_id, parent_id, created_at)`（楼中楼展开）。

### 6.6 `note_reactions` / `tags` / `note_tags` / `reports`

**`note_reactions`（点赞 + 收藏合表）**：点赞与收藏结构完全一致（`user_id × note_id` 布尔存在关系），合表用 `kind` 区分省一张表与一套仓储，符合 DRY。

| 列 | 类型 | 约束 |
|---|---|---|
| `user_id` | `text` | `references(user.id, cascade)` `notNull` |
| `note_id` | `text` | `references(notes.id, cascade)` `notNull` |
| `kind` | `text` enum `['like','favorite']` | `notNull` + `check` |
| `created_at` | `integer(timestamp_ms)` | `notNull` |

主键 `primaryKey({ columns: [user_id, note_id, kind] })` 天然幂等，重复点赞 `onConflictDoNothing`，取消用 `delete`，无 `version`。索引 `index('note_reactions_note_id_kind_idx').on(note_id, kind)`。**目标约束（决策 8）**：`like` 仅允许 `public+published+visible` 笔记；`favorite` 允许 `public+published+visible` 或（作者本人对其自有笔记，作稍后读）；越权/不可见统一 404。

**`tags` + `note_tags`（每用户私有标签，决策 11）**：`tags.user_id` 隔离、`(user_id, name)` 唯一。公开帖携带作者私有标签的**名称快照**（渲染只暴露 `name` 字符串，不暴露 `tag_id`/`user_id`）；公开广场按 `name` 文本聚合筛选（`note_tags join tags on name`），而非共享 `tag_id`。`tags.name` ≤ 32 字符、白名单字符 `[中英文数字\-_]`、trim 非空、单篇 ≤ 10 个。`note_tags` 复合主键 `(note_id, tag_id)`，索引 `note_tags_tag_id_idx`、`note_tags_user_id_note_id_idx`，随帖 `delete + insert` 替换。

**`reports`（举报，决策 12）**：仅对公开内容举报（举报私有内容直接 404）。`target_id` 指向 `notes.id` 或 `note_comments.id`，**不设外键**（跨类型多态），有效性由服务端校验。`uniqueIndex('reports_reporter_target_unique').on(reporter_user_id, target_kind, target_id)` 防刷；`index('reports_status_created_at_idx').on(status, created_at)`。`reporter_user_id` 绝不出现在任何面向作者或公众的响应中。

### 6.7 数据限制

沿用现有 512 KiB / 64 KiB 量级；笔记正文类上限就近定义在仓储顶部，跨域上限进 `app/api/_lib/constants.ts`，API 与迁移共用同一套校验。字节上限一律 `new TextEncoder().encode(x).byteLength`（不用 `String.length`）。

| 项 | 上限 |
|---|---|
| `notes.title` | 200 字符 |
| `notes.content`（Markdown） | 512 KiB（字节） |
| `notes.summary` | 500 字符 |
| `note_comments.content` | 64 KiB（字节） |
| `tags.name` | 32 字符，白名单字符，trim 非空 |
| 单篇标签数 | ≤ 10 |
| 单篇正文引用题目数 | ≤ 50 |
| `reports.reason` | 500 字符 |
| 列表接口 | 不返回 `content` 全文（返回 `summary` 或截断） |

### 6.8 公开可见性的查询层实现

读取分离为两条独立路径，绝不在同一 `where` 混 `or`：

1. **私有读（作者）**：`ownedNote(userId, id)` = `and(eq(user_id), eq(id), isNull(deleted_at))`，作者永远能读自己任意 `visibility`/`status`/`moderation_state` 的笔记。列表恒带 `user_id`。
2. **公开读（浏览者/游客）**：独立 `readPublicNote(id)` / `listPublicNotes(cursor)`，`where` 仅命中 `and(eq(visibility,'public'), eq(status,'published'), eq(moderation_state,'visible'), isNull(deleted_at))`，**不带 `user_id`**。出仓 `publicNote(row)` 用显式列举字段写法（非 spread + deleteProperty），把 `user_id` 映射为 `author: { name, avatarUrl }` 后剥离原始所有者列。评论/点赞的公开读同理走独立 `publicRead` 方法。

非作者请求私有/未发布/已下架/已软删笔记统一 `404`（不区分「不存在」与「无权限」，防枚举）。作者取消发布、软删或被软下架后，公开查询下次即因 `where` 不命中而消失。

### 6.9 游客本地笔记迁移（复用 `data_imports`）

游客态笔记先落 `localStorage`（`codenow-notes-local`，界面标注「仅保存在本机」），登录后经现有 `data_imports` 幂等通道一次性上云，**不新增迁移表**，复用 `(user_id, idempotency_key)` 唯一约束与 `previewFingerprint` 一致性校验。扩展四处见第 9 节。评论/点赞/收藏属云端互动数据，不参与游客迁移。

## 7. 核心流程

### 7.1 发布与可见性切换

1. 新建笔记默认 `visibility='private'`、`status='draft'`、`moderation_state='visible'`、`source` 依入口（独立笔记 `standalone`，题详情页 `problem`）。
2. 作者在编辑器切「公开」时二次确认，`PATCH` 携带 `version` 将 `visibility='public'`、`status='published'`、首次发布置 `published_at`。
3. 取消发布：`PATCH` 回 `private`/`draft`，公开查询下次即不命中。
4. 计数与评论随笔记可见性对公众收敛，但保留于库（作者可见），不物理删除。

### 7.2 题目关联（双向）

- **正文引用卡**：编辑器 `ProblemRefPicker` 搜自己题库选题，正文光标处插入引用 token；保存时随体全量替换 `note_problem_refs`，私有引用校验 `ownedProblem`，失败整篇 `400 INVALID_PROBLEM_REF`。详情页 `SafeMarkdown` 在**消毒之后**由受信 `ProblemRefCard` 组件按 `problem_ref` 服务端反查题号/标题/难度渲染，点击跳做题页（见 11.3 第 7 条，杜绝 token→HTML 注入）。
- **题详情页笔记 Tab**：`app/problem/[id]` 新增第三 Tab，按当前题 `problem_ref`（云端私有题用 `cloudId`+`private`，本地/内置/公共题用 `problem.id`+`public`，与 `library` 的 `openArchived` 分流一致）拉 `source='problem'` 的该题笔记列表，含「＋ 为本题写笔记」按钮预填 `problem_ref`。

## 8. 客户端同步与冲突

严格复用「本地优先 + `version` 乐观并发」基座（`useCloudSave`、`codenow-sync-queue`、`SyncConflictDialog`、`local-data-migration`），不新造机制。

### 8.1 游客态（未登录）

- 草稿笔记存 `localStorage`（`note-store` 的 `persist.name = 'codenow-notes-local'`），编辑器/列表显式标注「仅保存在本机」。
- 游客只读公开笔记列表与详情；发布/评论/点赞/收藏/举报需登录，未登录触发登录引导（跳 `/login`），对应写接口 `401 AUTH_REQUIRED`。
- 游客态不落 IndexedDB 重试队列，持久化靠 `persist`，登录后由迁移向导一次性上云。

### 8.2 登录态（Hydrate 与防抖保存）

1. **Hydrate**：登录后拉云端「我的笔记」列表（游标 `updatedAt|id`）覆盖写入 `note-store` 云缓存，记录每篇 `version`。参照 `use-conversation-sync` 的 `generation` ref 防竞态。
2. **正文/元数据编辑**（标题、正文、标签、分类、可见性）走 `useCloudSave`：`{ enabled: !!userId, version, save, onConflict, resourceType: 'note', resourceId: noteId }`，防抖 600ms 保存，成功回写新 `version`。
3. **评论/点赞/收藏**属低冲突可自动合并，走轻量范式（仿 `PreferenceSync`）：即时/防抖写入带 `Idempotency-Key`，`409` 时**静默重拉最新计数覆盖本地，不弹冲突对话框**。
4. 所有写请求不带 `userId`；服务端条件更新，`version` 不一致返回 `409` + `currentVersion`/`updatedAt`。

### 8.3 冲突处理

笔记正文/元数据 `save` 返回 `409` 时置 `status='conflicted'`、构造 `CloudConflict` 触发 `onConflict`，页面渲染复用 `<SyncConflictDialog>`：「使用云端版本」`discardPending(currentVersion)`，「用本地覆盖」`retryWithVersion(payload, currentVersion)`。首期只做整篇二选一，不做字段级合并。

### 8.4 五种同步状态

复用 `useCloudSave` 的 `SyncStatus`：`local-only`（仅本机）/`saving`（保存中）/`synced`（已同步）/`failed`（保存失败，进重试队列）/`conflicted`（存在冲突）。列表行与编辑器状态条统一展示，样式复用做题页 `.sync-status.<status>`。

### 8.5 账号切换与登出

- `note-store` 存 `noteAccountId`，`switchNoteAccount(userId)` 复刻 `ai-store.switchConversationAccount`：`id` 相同直接返回，否则整体重置本地笔记/评论/点赞收藏云缓存。
- 登出在 `AuthStatus.onSignedOut` 调 `switchNoteAccount(null)` 清私有内存态，但**不删游客未迁移草稿**。三页（`page`/`library`/`problem`）退出链路须统一补上，漏一处即跨用户串号。

### 8.6 重试队列

笔记正文写入复用单库 `codenow-sync-queue`（IndexedDB），`resourceType='note'`：按 `(userId, resourceType, resourceId)` 去重入队；`network` 指数退避重放、`auth`/`offline`/`conflict` 暂停待恢复；入队前敏感字段递归拒绝。评论/点赞/收藏为高频轻量写，**纯在线即时写、离线放弃**（仅提示），不进队列。

## 9. 游客数据迁移

游客草稿笔记纳入现有迁移向导，不新建入口。首次登录时与题目、测试点、草稿、AI 对话一并预览、确认、幂等提交。

### 9.1 接入现有向导（四处改动）

1. **`app/lib/local-data/types.ts`**：`LocalDataManifestV1` 增 `notes: LocalDataNoteV1[]`（`id`/`title`/`contentMarkdown`/`tags[]`/`category`/`problemRef?`/`problemKind?`/`visibility`，`fingerprint` 自动覆盖）。
2. **`app/lib/local-data/parse.ts`**：加 `readStore('codenow-notes-local', ...)` 分支，按 `SAFE_ID` 归一、正文按字节上限校验、`note.problemRef` 用 `sourceProblemIds` Map 记录待重映射（照搬 conversations）。
3. **`app/components/local-data-migration.tsx`**：`SOURCE_KEYS` 加 `'codenow-notes-local'`，`Preview.counts` 与展示区加「N 篇笔记」。
4. **`app/server/imports/import-service.ts`**：`validateManifest` 加 `notes` 分支（`onlyKeys` 白名单 + Markdown 只存原文）；`commit` 写入分支——`note.problemRef` 经 `problemIds` Map 重映射到新云端题目 UUID，`visibility` 一律 `private`。

### 9.2 预览、确认与提交

复用 `POST /api/imports/local-data/preview|commit`：预览返回含笔记数的 `counts`、`conflicts`、`previewFingerprint`；提交全程复用同一 `Idempotency-Key` + `previewFingerprint`（不一致 `409 PREVIEW_MISMATCH`）。`data_imports` 幂等兜底；成功前不删本地，成功后源数据保留七天。

### 9.3 悬空 `problem_ref` 降级（决策 6）

迁移时本地笔记关联的题目若在冲突决策中被用户选 `skip`，`problem_ref` 悬空：
- 该笔记**降级为 `source='standalone'` + 清空 `problem_ref`/`problem_kind` + 保留正文**，迁移报告 `warning` 提示用户。
- 正文 `note_problem_refs` 中指向被 skip 题的条目**静默剔除**，保留其余引用。
- 回归测试必须覆盖「游客建带题笔记 → 题被 skip → 笔记仍迁移成功且降级为无关联」全链路。

### 9.4 迁移安全约束

迁移是合并非覆盖；笔记一律 `private` 落库，公开须登录后作者显式操作；Markdown 只存原文渲染层消毒；payload 与队列同受敏感字段深度拒绝。

## 10. API 设计

所有私有端点先经 `resolveContext` 从 Session 解析 `userId`，未登录 `401`；跨用户/不存在统一 `404`；乐观并发冲突 `409` + `currentVersion`/`updatedAt`；超限 `413`；写配额 `429`。错误结构固定 `{ error: { code, message, field? } }`。

**路由形态裁决（决策 5，解决限流 family）**：`guardUserWriteRequest` 按 `pathname.split('/')[2]` 取 family。为让点赞/评论/举报拿到独立配额桶（不被并入笔记编辑配额），互动写入采用**扁平顶层路由**，父资源 id 入体/查询串；笔记读评论仍走嵌套只读路由。

### 10.1 端点

| 方法与路径 | family | 用途 |
|---|---|---|
| `GET /api/notes` | notes | 列表（`view=mine` 私有 / `view=public` 广场），标签/题目/可见性/关键词筛选 + 游标分页 |
| `POST /api/notes` | notes | 创建（默认 `private`，随体写标签与题目引用） |
| `GET /api/notes/:id` | notes | 详情（作者读任意；他人/游客仅读公开） |
| `PATCH /api/notes/:id` | notes | 改标题/正文/标签/引用或切 `visibility`（乐观并发） |
| `DELETE /api/notes/:id` | notes | 软删除（仅作者，带 `version`） |
| `GET /api/notes/:id/comments` | notes(读) | 评论列表（公开帖登录可见；私有帖 404） |
| `POST /api/comments` | comments | 发评论（体含 `noteId`；幂等键；仅公开帖） |
| `DELETE /api/comments/:id` | comments | 删评论（评论作者或帖主，带 `version`） |
| `POST /api/reactions` | reactions | 点赞/收藏（体含 `noteId`+`kind`；幂等） |
| `DELETE /api/reactions` | reactions | 取消（查询串 `noteId`+`kind`；幂等） |
| `GET /api/tags` | — | 当前用户标签（供编辑器补全，`private, no-store`） |
| `POST /api/reports` | reports | 举报（体含 `targetKind`+`targetId`+`reason`；仅公开内容） |

`USER_WRITE_LIMITS` 须新增 `notes`/`comments`/`reactions`/`reports` 四个 family，否则新端点写限流默认放行。

### 10.2 题目引用与题目笔记视图

- **引用卡随体 upsert**，不设独立 `/problem-refs` 端点：随 `POST`/`PATCH /api/notes/:id` 的 `problemRefs` 数组全量替换，在同一 batch/transaction 与 `version+1` 完成，避免两次写入的原子性与版本推进难题。
- **题目笔记视图复用列表筛选**，不新增 `/api/problems/:ref/notes`：题详情页请求 `GET /api/notes?problemRef=<ref>&problemKind=<kind>&view=mine`，由 `notes_user_id_problem_ref_idx` 支撑。

### 10.3 列表筛选与分页

`GET /api/notes` 参数：`view`（`mine` 默认 / `public`）、`cursor`（`updatedAt|id`）、`limit`（默认 50，夹逼 ≤ 50）、`tag`（`view=mine` 按 `tag_id`；`view=public` 按 `name` 文本，决策 11）、`problemRef`+`problemKind`、`visibility`（仅 `mine`）、`q`（匹配标题，正文全文列为非目标）。响应 `{ items, nextCursor }`，`limit+1` 探测。**列表项不返回完整正文**，附 `likeCount`/`commentCount`/`favoriteCount` 与（登录态）`viewerLiked`/`viewerFavorited`。

### 10.4 通用约定

- 客户端任意层级夹带 `userId` → `400 CLIENT_USER_ID_FORBIDDEN`。
- 字段白名单：`Object.keys(body).some(k => !允许集)` → `400 INVALID_REQUEST`（含 `field`）。
- 写入校验 Content-Type、请求体大小（`413 REQUEST_TOO_LARGE`）、字段字节长度（`413 CONTENT_TOO_LARGE`）、枚举、标签与引用数量。
- 乐观并发：`PATCH`/`DELETE` 必带 `version`，不符 `409 VERSION_CONFLICT`；`POST` 不强制。成功返回最新 `version`/`updatedAt`。
- 幂等键：评论/点赞/收藏/举报走请求头 `Idempotency-Key`（trim 非空、≤ 200 字符），点赞/收藏底层唯一约束 `onConflictDoNothing` 天然幂等，无 `version`。
- 敏感字段递归拒绝：仓储对 `create`/`update` 入参递归扫 key 名 `/(apikey|token|secret|password|credential)/i`（不误伤正文 value）。
- **仓储 Result 状态联合不扩（决策 3）**：`note-repository` 的 `ErrorResult.status` 严格沿用 `400|404|409|413`；`401`（未登录）与 `429`（写配额）一律由中间件/路由层 `apiError(number,...)` 产出，绝不进仓储 Result；「公开需登录」备选统一用 `401` 不用 `403`。

### 10.5 缓存策略（决策 13）

- 私有响应（`view=mine`、私有帖详情、评论、点赞收藏状态、`/api/tags`）：`privateNoStore`（`private, no-store`）。
- 公开响应（`view=public`、公开帖匿名视图）：**首期用 `no-store`（无 `private`）兜底**，采用无用户态字段的匿名序列化（不含 `viewerLiked`）；个性化字段只在 `private, no-store` 响应出现。CDN 公共缓存（`public, max-age=60, stale-while-revalidate` + 匿名无 cookie 路径 / `Vary: Cookie`）列为后续优化，防止登录用户个性化字段被缓存串味。

### 10.6 端点鉴权与越权语义

| 端点 | 401 | 404 | 409 | 413 | 429 |
|---|---|---|---|---|---|
| `GET /api/notes?view=mine` | 未登录 | — | — | — | 读配额(可选) |
| `GET /api/notes?view=public` | 游客允许 | — | — | — | IP 限流(可选) |
| `POST /api/notes` | 未登录 | — | — | 超限 | 写配额 |
| `GET /api/notes/:id` | 私有帖对游客/他人视为 404 | 不存在/跨用户私有/已软删/已下架 | — | — | — |
| `PATCH /api/notes/:id` | 未登录 | 非本人/不存在 | `version` 不符 | 超限 | 写配额 |
| `DELETE /api/notes/:id` | 未登录 | 非本人/不存在 | `version` 不符 | — | 写配额 |
| `GET /api/notes/:id/comments` | 私有帖非作者视为 404 | 帖不可见 | — | — | — |
| `POST /api/comments` | 未登录 | 帖不可见/非公开帖 | — | 超限 | 写配额 |
| `DELETE /api/comments/:id` | 未登录 | 非评论作者且非帖主/不存在 | `version` 不符 | — | 写配额 |
| `POST/DELETE /api/reactions` | 未登录 | 帖不可见（`like` 私有帖 404；`favorite` 仅作者自有私有帖放行） | — | — | 写配额 |
| `GET /api/tags` | 未登录 | — | — | — | — |
| `POST /api/reports` | 未登录 | 目标不可见/非公开/不存在 | — | — | 写配额 |

越权铁律：任何非本人私有资源访问一律 `404` 而非 `403`，防状态码枚举；举报对同一目标幂等返回成功。

## 11. 安全与隐私

本节聚焦「私有发布为公开」跨界风险区，是本模块最高风险面。

### 11.1 可见性模型

1. 两态 `visibility`（`private`/`public`）+ 正交 `moderation_state`（`visible`/`hidden`），TS `enum` 与 DB `check` 双重约束。
2. 公开读走独立 `readPublic`/`listPublic` 方法（`where` 不带 `userId`，见 6.8），绝不与私有 `where` 用 `or` 混写。
3. 请求方是否为作者由 `session.user.id === note.userId` 判定，绝不信任客户端标记。
4. 取消发布/软删/软下架后公开查询下次即不命中；已缓存公开响应靠短 `max-age`/`no-store` 自然过期。
5. 公开出仓只返回作者展示名与头像，绝不返回 `user.id`、邮箱或任何内部所有者列；用显式列举字段写法防泄漏。
6. 公开笔记允许游客只读（决策 6），评论/点赞/收藏/举报强制登录。

### 11.2 权限矩阵

| 操作 | 作者本人 | 其他登录用户 | 游客 |
|---|---|---|---|
| 读私有笔记 | ✅ | ❌ 404 | ❌ 404 |
| 读公开笔记 | ✅ | ✅ | ✅ |
| 创建笔记 | ✅ | ✅（各自私有） | ❌ 401 |
| 编辑/删除/发布自己的笔记 | ✅ | ❌ 404 | ❌ 401 |
| 编辑/删除他人笔记 | — | ❌ 404 | ❌ 401 |
| 评论笔记 | 仅公开帖 ✅ | 仅公开帖 ✅ | ❌ 401 |
| 删自己的评论 | ✅ | ✅ | ❌ 401 |
| 删他人评论 | ✅（作为帖主删自己帖下评论） | ❌ 404 | ❌ 401 |
| 点赞公开笔记 | ✅ | ✅ | ❌ 401 |
| 收藏 | 公开帖 ✅ / 自有私有帖 ✅（稍后读） | 公开帖 ✅ | ❌ 401 |
| 举报公开内容 | ✅ | ✅ | ❌ 401 |
| 处理举报 | ❌ 非目标 | ❌ | ❌ |

写权限恒绑作者：所有 `update`/`delete`/`publish` 的 `where` 除 `id` 外必须重复带 `userId`（账号隔离铁律，见 commit 90ea687）。删评论授权 `comment.userId === actor || note.userId === actor`，皆不满足 404。

### 11.3 XSS 与 Markdown 安全渲染

笔记是本项目首个渲染富文本、面向公开受众的场景，安全要求最高。

1. **默认纯文本、白名单放开**：核心是「默认转义、仅按白名单显式放开」，非「默认渲染、黑名单封堵」。评论区默认纯文本渲染（React 转义即可），仅笔记正文走 Markdown → 安全 HTML。
2. **新增 `SafeMarkdown` 基建**：项目现无任何 Markdown/消毒库，本模块新增 `SafeMarkdown` 组件，采用 **remark + rehype + rehype-sanitize** 管线（版本锁定，供应链审查）。消毒在渲染层统一执行，存储只存 Markdown 原文，不存已渲染 HTML。**所有用户富文本渲染出口唯一经 `SafeMarkdown`**（禁止 SSR/邮件/导出等旁路绕过）。
3. **标签白名单**：仅 `p/h1-h6/ul/ol/li/blockquote/code/pre/strong/em/del/a/img/table/thead/tbody/tr/th/td/hr/br`；属性白名单 `a[href,title]`、`img[src,alt,title]`、`code[class]`（仅 `language-*`）。
4. **强制禁止**：剥离 `script/iframe/object/embed/style/link/meta/form/input/svg/math`；剥离全部 `on*` 事件属性、`style` 内联属性、`srcset`/`formaction`/`xlink:href` 等易绕过属性。
5. **协议白名单**：`a[href]` 仅 `http:/https:/mailto:`，拒 `javascript:`/`data:`（受控图片除外）/`vbscript:`/`file:`；外链加 `rel="noopener noreferrer nofollow"` + `target="_blank"`。
6. **图片与 CSP**：现有 middleware CSP 为 `img-src 'self' data: blob:`，外链图被浏览器拦。首期只允许 `data:`/自托管；放开外链需显式扩 CSP 白名单（安全决策点，非目标）。
7. **题目引用卡只渲染受信元数据（关键）**：引用卡在 Markdown 源码里以自定义 token（保留在消毒白名单里的占位指令，如 `:::note-problem{ref=… kind=…}` 指令节点）表示；**必须在 sanitize 之后，由受信 React 组件 `ProblemRefCard` 按 `problem_ref` 服务端反查题号/标题/难度渲染，绝不把 token 还原成 HTML 字符串再喂 `dangerouslySetInnerHTML`**。私有题引用渲染前校验 `ownedProblem`，防通过引用卡探测他人私有题存在性。token→组件是绕过消毒的天然缺口，故还原时机与语法在此钉死。
8. **CSP 纵深已知风险**：现有全站 CSP `script-src` 含 `'unsafe-inline' 'unsafe-eval'`（为 Monaco 放开，见 `middleware.ts`），一旦 `SafeMarkdown` 被绕过，CSP 无法兜底内联脚本，且公开笔记 XSS 爆炸半径覆盖全站登录用户。缓解：阶段 0 评估为 `/notes/*` 路由下发去掉 `script 'unsafe-inline'` 的独立 CSP 或 nonce；至少在本 spec 记录「当前 `unsafe-inline` 使 `SafeMarkdown` 成为唯一防线」并做 XSS 专项测试。

### 11.4 滥用防护

1. **写限流**：路由入口 `guardUserWriteRequest` 按 `pathname.split('/')[2]` 匹配 `USER_WRITE_LIMITS`，**必须新增 `notes`/`comments`/`reactions`/`reports` 四项**（硬编码表，漏加即漏防）。互动端点用扁平顶层路由保证 family 命中（决策 5）。
2. **配额基线**（进 `constants.ts`）：新建/编辑笔记 60 次/时，发评论 100 条/时，点赞收藏切换 300 次/时，举报 30 次/时。
3. **长度上限**：正文按字节卡（256 KiB 建议值，硬上限 512 KiB），评论 64 KiB，标签 ≤ 32 字符/≤ 10 个，超限 `413`。
4. **防刷**：点赞/收藏 `(user_id, note_id, kind)` 唯一约束天然幂等，`insert` 走 `onConflictDoNothing`；评论 `Idempotency-Key` + `(user_id, note_id, idempotency_key)` 唯一防重。
5. **举报与软下架（决策 10/12）**：`reports.status` 枚举 `open/reviewed/dismissed/actioned`，初始 `open`，同人同目标唯一。**本期 `reports` 仅落库**；累计 `open` 举报达阈值（建议 5 个不同用户）自动把 `moderation_state='hidden'` 的阈值触发逻辑列为**可选阶段 5**：在 `POST /api/reports` 仓储成功后同批 `count` 该目标 `open` 举报数，达阈值同批 `update moderation_state='hidden'` + `hidden_reason`。公开读 `where` 增加 `eq(moderation_state,'visible')`，与 `visibility` 正交（作者改 `visibility` 不能清除下架）。若阶段 5 不做，举报仅累积不自动下架。
6. **恶意协同举报**：唯一约束防同一用户重复举报，防不住多账号协同；首期无人工复核后台意味着误下架仅能靠作者改私有再重发自助恢复——记为已知取舍。
7. 举报不泄露 `reporter_user_id`。

### 11.5 隐私

1. 私有内容绝不进公开缓存/索引，响应 `private, no-store`；公开列表 `where` 物理上不可能命中 `private` 行。
2. 公开页缓存见 10.5（首期 `no-store` 兜底）。
3. 日志不记笔记/评论正文、邮箱、`user_id` 明文，沿用 `observability/events.ts` 宽脱敏正则，异常只记 `note_id`/`code`/`status`。
4. 软删保留：`deleted_at` 落值即软删，公开与私有查询均带 `isNull(deleted_at)`；保留 30 天供误删恢复与举报追溯后由后台物理清理，软删期间其评论/点赞不再对外可见。
5. `comment_count` 只计 `deleted_at IS NULL` 的评论；软删评论 `-1`（UI 楼中楼仍显示「已删除」占位，占位不计数）；笔记软删不维护其计数（笔记本身从列表消失）。

### 11.6 越权与隔离（对齐 13 节测试）

以下不变量必须逐条覆盖：(1) A 的私有笔记，B `GET` 返回 404；(2) B 对 A 任意笔记 `PATCH`/`DELETE`/发布一律 404；(3) B 不能删 A 帖下他人评论；(4) 游客对私有笔记及任何写操作 401，公开读 200；(5) 重复点赞/举报不产生第二条；(6) 作者改私有/软删/软下架后 B 与游客下次读立即 404；(7) 正文含 `<script>`/`<img onerror>`/`javascript:`/`<iframe>` 载荷经 `SafeMarkdown` 后无可执行脚本；(8) 任何请求夹带 `userId` 一律 `400 CLIENT_USER_ID_FORBIDDEN`。

## 12. 错误处理

- 未登录/Session 过期：`401`，保留未同步编辑，重登后继续同步。
- 越权或资源不存在：统一 `404`（不区分无权限与不存在）。
- 版本冲突：`409` + `currentVersion`/`updatedAt`，禁止静默覆盖。
- 请求或字段超限：`413` + 具体限制。
- 写配额超限：`429` + `Retry-After`。
- 无效题目引用：整篇写入 `400 INVALID_PROBLEM_REF`。
- D1 写入失败：保留本地副本，不显示「已同步」。
- 迁移预览指纹失配：`409 PREVIEW_MISMATCH`；批量迁移失败回滚当前批次或保持可安全重试，不清本地。

## 13. 测试策略

### 13.1 单元测试
字段校验、字节上限、枚举、所有权条件、版本比较、幂等键、敏感字段递归拒绝、悬空 `problem_ref` 降级、`comment_count` 口径、`SafeMarkdown` 白名单消毒。

### 13.2 仓储测试
本地 SQLite/D1 模拟验证事务、唯一约束、软删除、分页、条件更新、公开读独立路径（`readPublic` 不返回私有/未发布/下架/软删）、原子父子写入（引用卡替换与 `version` bump、计数 bump）。

### 13.3 API 集成测试
每端点「未登录 + 本人 + 跨用户」三场景，公开端点加「游客只读」；额外覆盖超限、无效版本、重复幂等、写配额 `429`、`view=mine/public` 序列化差异（公开响应不含 `viewerLiked`）。

### 13.4 安全专项测试
XSS 载荷经 `SafeMarkdown` 消毒后无脚本/危险属性/危险协议；题目引用卡 token 不被还原为可执行 HTML；`CLIENT_USER_ID_FORBIDDEN`；软下架即时性；举报不泄露举报人。

### 13.5 端到端测试
游客建带题笔记 → 登录 → 迁移预览含笔记数 → 提交 → 云端可见；题被 skip 时笔记降级；发布公开 → 他人浏览/评论/点赞 → 取消发布后他人 404；多设备编辑触发冲突对话框；登出后私有列表清空且不串号；顶栏四处入口跳 `/notes` 且高亮。

### 13.6 构建门禁
`npm run lint`、`npm test`、`npm run test:e2e`、`npm run build` 全通过；迁移 `npm run db:generate` 生成的 SQL + meta 快照整批提交。

## 14. 分阶段交付

依赖拓扑：`SafeMarkdown` 是一切渲染前置基建，私有闭环先于公开，互动后于公开。

### 阶段 0：安全基建
新增 `SafeMarkdown`（remark + rehype-sanitize，版本锁定）、依赖选型与供应链审查、XSS 专项测试、评估 `/notes` 路由收紧 CSP。一切渲染前置。

### 阶段 1：笔记私有闭环
`notes` 表 + 迁移、`note-repository` 私有 CRUD、`/api/notes` 路由、`note-api`、`note-store`（含账号切换/五态同步）、我的笔记列表页、编辑器（不碰公开、评论、题目关联）。

### 阶段 2：题目关联 + 游客迁移
`note_problem_refs` 表与随体替换、正文引用卡 token 与 `ProblemRefCard`、`ProblemRefPicker`、做题页笔记 Tab；接入游客迁移四处改动（含悬空 ref 降级）。

### 阶段 3：公开发布 + 广场 + 顶栏
`visibility`/`status`/`moderation_state` 发布切换、独立 `readPublic`/`listPublic` 路径、公开广场视图、缓存二分（首期 `no-store` 兜底）、`tags`/`note_tags` 标签、顶栏四处入口接线。

### 阶段 4：评论 + 点赞收藏
`note_comments`/`note_reactions` 表与仓储、`/api/comments`/`/api/reactions` 扁平路由、`USER_WRITE_LIMITS` 四 family 落地、评论区与互动条 UI、轻量同步范式。

### 阶段 5：举报 + 软下架（可选）
`reports` 表与 `/api/reports`、举报入口 UI、阈值自动软下架闭环。若不做则仅前端提交入口 + 落库，`moderation_state` 保持手动。

每阶段带构建门禁与越权回归。

## 15. 验收标准

- 用户可创建、编辑、软删除、跨设备恢复自己的 Markdown 笔记。
- 用户 A 的私有笔记，用户 B 与游客无法读取或修改（统一 404）。
- 作者可将单篇发布公开，公开后他人/游客可读、登录用户可评论/点赞/收藏；取消发布后立即对外不可见。
- 正文可插入题库题目引用卡片并点击跳做题页；题目详情页笔记 Tab 可列出/新建该题笔记。
- 含 XSS 载荷的正文经 `SafeMarkdown` 渲染后无任何可执行脚本或危险属性。
- 游客草稿笔记迁移前可预览、重复提交不产生副本、失败不删本地；关联题被 skip 时笔记降级保留。
- 多设备并发编辑产生明确冲突提示，不静默覆盖；点赞/收藏 409 静默重拉不弹对话框。
- 登出后不再展示上一账户私有笔记与草稿，不跨用户串号。
- 写限流对 `notes`/`comments`/`reactions`/`reports` 四 family 生效。
- 生产构建与迁移生成通过。

## 附录 A：命名对照表（钉死，杜绝四层名字打架）

| 概念 | 物理表 | 外键列 | REST 资源 | 写 family | 仓储 | store / lib | 页面路由 |
|---|---|---|---|---|---|---|---|
| 笔记主体 | `notes` | `note_id` | `/api/notes` | `notes` | `note-repository` | `note-store` / `note-api` | `/notes`（文案「讨论」） |
| 正文引用卡 | `note_problem_refs` | `note_id` | 随 `/api/notes` 体 | （随 notes） | `note-repository` | — | — |
| 评论 | `note_comments` | `note_id` | 写 `/api/comments`，读 `/api/notes/:id/comments` | `comments` | `comment-repository` | `note-api` | 详情页内 |
| 点赞/收藏 | `note_reactions` | `note_id` | `/api/reactions` | `reactions` | `reaction-repository` | `note-api` | 详情页内 |
| 标签 | `tags` + `note_tags` | `note_id`/`tag_id` | `/api/tags`（读） | — | `tag-repository` | `note-api` | 侧栏/编辑器 |
| 举报 | `reports` | `target_id`（多态，无 FK） | `/api/reports` | `reports` | `report-repository` | `note-api` | 详情页内 |

物理名一律 `notes` 族；`Topbar` 展示文案与产品口径保留「讨论」。任何代码、迁移、索引、测试引用均以本表为准。
