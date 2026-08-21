# CSP Data Completion And Folder Tree Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布第 33-42 次每届 5 道、共 50 道 CSP 认证题，并让本地和云端文件夹支持任意合法层级移动及只解散本级，同时保证普通目录操作不丢题目、测试点和提交记录。

**Architecture:** 把路径树变换提取为无副作用函数，Zustand store 与 React 拖放层共同复用；云端移动映射到现有 `parentId` API。CSP 由 Playwright 从曙梦 OJ 权威来源导入并固化，再重建大目录、轻量索引和单题 JSON。

**Tech Stack:** TypeScript 5.9、React 19、Zustand 5、Vitest 4、Testing Library、Node.js ESM 数据生成脚本、Drizzle ORM。

## Global Constraints

- “全部题目”是虚拟根目录，不写入持久化目录数组。
- 文件夹最大深度保持 5 级。
- 本地和云端目录不可互相拖入。
- 内置目录与普通本地目录具有完全相同的移动、排序、解散和永久删除能力。
- 移动及解散不得修改或删除题目测试点、代码草稿和提交记录。
- 永久删除保留二次确认；只有该操作可删除本地目录子树内题目。
- CSP 认证生成产物严格覆盖第 33-42 次每届题号 1-5，共 50 道；标题与来源逐题核对，保留全部来源站公开样例，不伪造隐藏评测数据。

---

### Task 1: 路径树纯函数与本地无损解散

**Files:**
- Create: `app/lib/folder-tree.ts`
- Modify: `app/stores/library-store.ts`
- Create: `tests/unit/folder-tree.test.ts`

**Interfaces:**
- Produces: `planFolderMove(paths, source, destinationParent): FolderMovePlan`，返回 `ok/remap/nextPaths/error`。
- Produces: `dissolveFolderLevel(paths, folder): FolderDissolvePlan`，只删除本级并提升后代。
- Produces: store 方法 `moveFolder(source, destinationParent)` 与 `dissolveFolder(folder)`。
- Produces: persisted `builtinFolderOverrides: Record<string, string>` applied to bundled problems and P1001.

- [ ] **Step 1: Write the failing tests**

覆盖 `图论/最短路 -> 动态规划` 后得到 `动态规划/最短路`、拖到根得到 `最短路`、拒绝环/同名/超深、解散 `A/B` 后 `A/B/C/D -> A/C/D`，并断言归档的完整 `problem.samples` 引用内容未改变。

- [ ] **Step 2: Run tests to verify RED**

Run: `npx vitest run tests/unit/folder-tree.test.ts`
Expected: FAIL because `app/lib/folder-tree.ts` and new store methods do not exist.

- [ ] **Step 3: Implement minimal pure transforms and store adapters**

路径变换只替换 source 前缀；解散只移除 folder 这一层。store 返回全新的数组，但保留归档中的 `problem` 对象和 samples；内置题通过 `builtinFolderOverrides` 记录有效路径。

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npx vitest run tests/unit/folder-tree.test.ts`
Expected: PASS.

### Task 2: 任意层级拖放与“全部题目”根落点

**Files:**
- Modify: `app/library/page.tsx`
- Modify: `tests/unit/library-folder-drag.test.tsx`
- Modify: `tests/unit/library-folder-menu.test.tsx`

**Interfaces:**
- Consumes: `planFolderMove` and store `moveFolder`/`dissolveFolder` from Task 1.
- Produces: row center = child, row edge = target sibling across parents, total-folder drop = root.

- [ ] **Step 1: Write failing component tests**

新增真实 DOM 拖放断言：`图论/最短路` 拖到 `动态规划` 行边缘后成为根级 `最短路`（与目标同级）；拖到“全部题目”后成为根级；解散父目录仅提升直接子树且保留题目 samples；危险删除取消时状态不变。

同时断言 `默认题库` 与 CSP/AcWing 内置目录拥有操作菜单，可作为拖放源和目标；永久删除确认后对应内置题进入 `hiddenBuiltins`，取消确认不变。

- [ ] **Step 2: Run tests to verify RED**

Run: `npx vitest run tests/unit/library-folder-drag.test.tsx tests/unit/library-folder-menu.test.tsx`
Expected: FAIL on cross-parent sibling drop, root drop, and level-only dissolve.

- [ ] **Step 3: Implement drag targets and cloud/local adapters**

让“全部题目”按钮接受拖放；行边缘调用统一 reparent + sibling order；云端先调用 `updateFolder(id, { parentId })`，成功后再更新 path/id 与 archive path 缓存。解散云端时只重写本级题目与去掉一层后的子目录路径。

- [ ] **Step 4: Preserve destructive delete semantics**

本地危险删除继续调用递归删除逻辑并要求确认；把无损 `dissolveFolder` 与递归 `deleteFolderTree` 分为不同 store 方法，避免共享错误实现。删除内置目录时隐藏其中内置题，移动/解散则只更新持久化路径覆盖。

- [ ] **Step 5: Run tests to verify GREEN**

Run: `npx vitest run tests/unit/library-folder-drag.test.tsx tests/unit/library-folder-menu.test.tsx tests/unit/folder-tree.test.ts`
Expected: PASS.

### Task 3: 云端目录数据安全回归

**Files:**
- Modify: `tests/unit/problem-repository.test.ts`
- Modify only if the test exposes a defect: `app/server/problems/problem-repository.ts`

**Interfaces:**
- Consumes: repository `deleteFolder(userId, id)`.
- Produces: verified contract that problems and children move to the deleted folder's parent while test cases remain attached.

- [ ] **Step 1: Write repository regression test**

创建父目录、本级目录、子目录、题目和测试点；删除本级目录后断言题目 `folderId` 等于父目录、子目录 `parentId` 等于父目录，并通过 `getProblem` 读回原测试点。

- [ ] **Step 2: Run test and classify result**

Run: `npx vitest run tests/unit/problem-repository.test.ts`
Expected: existing repository implementation should PASS; if it fails, retain the failure as RED and make the smallest transactional fix.

### Task 4: CSP 补全生成链

**Files:**
- Modify: `tests/unit/contest-catalog.test.ts`
- Create: `scripts/testgen/import-csp-shumeng.mjs`
- Create: `scripts/testgen/csp-cert-source.json`
- Delete: `scripts/testgen/csp-cert-1.mjs`, `scripts/testgen/csp-cert-2.mjs`, `scripts/testgen/csp-cert-complete.mjs`
- Modify: `scripts/testgen/generate-bundled.mjs`
- Regenerate: `public/contest-problems.json`
- Regenerate: `public/catalog-index.json`
- Create: every currently missing `public/problems/CS<session><number>.json` needed to complete sessions 33-42 to numbers 1-5 (34 files from the 16-file baseline)

**Interfaces:**
- Produces: 50-entry `csp-cert-source.json` imported into the contest build list.
- Produces: exactly the 50 IDs from `CS0331..CS0335` through `CS0421..CS0425` in generated public data.

- [ ] **Step 1: Strengthen generated-artifact contract**

按届次断言 `竞赛真题/CSP 认证/第33次` 至 `第42次` 各自恰有题号 1-5，总计 50 道；逐题断言权威标题和来源 URL；每题保留公开样例；断言轻量索引与全部对应单题文件可读。

- [ ] **Step 2: Run test to verify RED**

Run: `npx vitest run tests/unit/contest-catalog.test.ts`
Expected: FAIL with 错误届次映射、错误标题、16 个条目和 34 个缺失 ID。

- [ ] **Step 3: Fix definition syntax and generator wiring**

运行来源导入脚本抓取 2024-03 至 2026-05 十届题目，固化 50 道真实题面与公开样例；生成器读取该 JSON，完全替代三份错误旧定义。

- [ ] **Step 4: Regenerate artifacts**

Run: `node scripts/testgen/generate-bundled.mjs`
Run: `node scripts/testgen/split-catalog.mjs`
Expected: scripts exit 0 and report all 50 CSP certification IDs across the generated contest catalog.

- [ ] **Step 5: Run test to verify GREEN**

Run: `npx vitest run tests/unit/contest-catalog.test.ts tests/unit/catalog-index.test.ts`
Expected: PASS.

### Task 5: 全量验证

**Files:**
- Modify only for regressions caused by Tasks 1-4.

- [ ] **Step 1: Run focused suite**

Run: `npx vitest run tests/unit/folder-tree.test.ts tests/unit/library-folder-drag.test.tsx tests/unit/library-folder-menu.test.tsx tests/unit/problem-repository.test.ts tests/unit/contest-catalog.test.ts tests/unit/catalog-index.test.ts tests/unit/problem-persistence.test.ts`
Expected: PASS with zero failures.

- [ ] **Step 2: Run full unit suite**

Run: `npm run test:unit`
Expected: PASS with zero failures.

- [ ] **Step 3: Run lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: both exit 0.

- [ ] **Step 4: Review diff and data-safety invariants**

Run: `git diff --check`
Run: `git status --short`
Confirm no unrelated files changed; confirm no directory move/dissolve path calls problem/test/submission deletion APIs.
