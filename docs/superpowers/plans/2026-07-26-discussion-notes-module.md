# Discussion & Notes Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a blog-style discussion & notes module: private-first Markdown notes that a user can publish publicly, with two-way problem-bank linking, tags, comments, likes/favorites, safe Markdown rendering, guest-data migration, and optional report/soft-hide moderation — reusing the existing five-layer "private + versioned + local-first" architecture end to end.

**Architecture:** One physical name family `notes` across all layers (table/`note_id`/index/repository/store/lib/REST/route; UI copy stays "讨论"). Public reads use a dedicated `readPublic`/`listPublic` path that never mixes `or(visibility=public)` into the private `where` and strips `user_id` on output. `SafeMarkdown` (new) is the single sanitized render exit; storage keeps Markdown source only. Note body/metadata edits go through `useCloudSave` (409 → conflict dialog); comments/reactions use the lightweight `PreferenceSync`-style path (409 → silent recount). Interaction writes use flat top-level routes (`/api/comments`, `/api/reactions`, `/api/reports`) so `guardUserWriteRequest`'s `pathname.split('/')[2]` maps to distinct rate-limit families. See `docs/superpowers/specs/2026-07-26-discussion-notes-module-design.md`.

**Tech Stack:** TypeScript, Next.js 16 (vinext/Cloudflare), React 19, Drizzle/D1 + better-sqlite3, better-auth, Zustand, Tailwind 4, remark + rehype-sanitize, Vitest, Playwright.

---

## 阶段 0：安全渲染基建（一切渲染前置）

### Task 0.1: Add SafeMarkdown sanitized renderer

**Files:** `app/components/notes/safe-markdown.tsx`, `app/lib/notes/markdown.ts`, `package.json`, `tests/unit/safe-markdown.test.tsx`

- [ ] Write failing tests: `<script>`, `<img onerror=...>`, `<a href="javascript:...">`, `<iframe>`, inline `on*`/`style`, `data:`-in-anchor payloads all render with no executable script/dangerous attr/protocol; allowed tags (`p/h1-6/ul/ol/li/blockquote/code/pre/strong/em/del/a/img/table.../hr/br`) and `code[class=language-*]` survive; external `a` gets `rel="noopener noreferrer nofollow" target="_blank"`.
- [ ] Run focused test; expect missing module.
- [ ] Install pinned `remark`/`remark-rehype`/`rehype-sanitize`/`rehype-stringify` (exact versions), add to `allowScripts` only if required. Implement the sanitize schema (tag + attribute + protocol whitelist) in `markdown.ts`; `SafeMarkdown` renders Markdown source → sanitized HTML at render layer, never stores rendered HTML.
- [ ] Verify no raw `dangerouslySetInnerHTML` receives unsanitized input; document the "single render exit" rule in a file header comment.
- [ ] Run tests/build; commit `git commit -m "feat: add SafeMarkdown whitelist renderer"`.

### Task 0.2: Evaluate route-scoped CSP hardening for /notes

**Files:** `app/middleware.ts`, `docs/auth-operations.md`, `tests/unit/notes-csp.test.ts`

- [ ] Write a test asserting responses under `/notes/*` and note API paths carry a `script-src` without `'unsafe-inline'` (nonce or route-scoped policy), while Monaco routes keep the existing relaxed CSP.
- [ ] Run focused test; expect failure.
- [ ] Implement route-scoped CSP (or document why deferred if Monaco/global constraints block it); record in ops docs the residual risk "global `unsafe-inline` makes SafeMarkdown the sole XSS defense".
- [ ] Run tests/build; commit `git commit -m "feat: harden CSP for notes rich-text routes"`.

## 阶段 1：笔记私有闭环

### Task 1.1: Add notes schema

**Files:** `db/schema.ts`, `tests/unit/notes-schema.test.ts`, `drizzle/00XX_*.sql`

- [ ] Write failing schema test: `notes` has `user_id` FK cascade, `version` default 1, `deleted_at`, `visibility`/`status`/`moderation_state`/`source`/`problem_kind` check constraints, redundant `like_count`/`favorite_count`/`comment_count` default 0, and the four indexes (user+updated, user+deleted, user+problem_ref, visibility+status+moderation+published).
- [ ] Run focused test; expect missing export.
- [ ] Define `notes` per spec §6.3. Do not add credential columns. Timestamps `timestamp_ms` notNull without default.
- [ ] Generate migration `npm run db:generate`, inspect the SQL + meta snapshot, run focused tests + build.
- [ ] Commit `git commit -m "feat: add notes schema"`.

### Task 1.2: Implement private note repository

**Files:** `app/server/notes/note-repository.ts`, `app/api/_lib/constants.ts`, `tests/unit/note-repository.test.ts`

- [ ] Write tests: create with field whitelist + byte limits + sensitive-field rejection; `ownedNote` isolation; list cursor pagination `updatedAt|id`; conditional PATCH with `version` CAS + 409 conflict re-read; soft delete; `publicNote` output strips `user_id`; `ErrorResult.status` stays `400|404|409|413`.
- [ ] Run focused tests; expect missing module.
- [ ] Implement `createNoteRepository(db)` per spec: `Result<T>`, `ownedNote(userId,id)` with `isNull(deleted_at)`, `conflict(row)`, `publicNote` explicit-field output, private list + `readPublic`/`listPublic` stubs (public path filled in Phase 3). Move shared limits into `constants.ts`.
- [ ] Run focused/full tests + build; commit `git commit -m "feat: private note repository"`.

### Task 1.3: Implement note API routes and rate-limit family

**Files:** `app/api/notes/route.ts`, `app/api/notes/[id]/route.ts`, `app/server/security/auth-rate-limit.ts`, `tests/unit/notes-api.test.ts`

- [ ] Write tests: anonymous 401; per-user isolation; create/list/get/patch/delete; unknown-field 400; `CLIENT_USER_ID_FORBIDDEN`; stale-version 409; oversize 413; `privateNoStore` headers; `notes` write-quota 429.
- [ ] Run focused tests; expect failures.
- [ ] Implement `createNotesHandlers` + `resolveNoteContext` (session → `{userId, repository}`), `apiError`/`readJson`/`privateNoStore` reuse. Add `notes` to `USER_WRITE_LIMITS`.
- [ ] Run tests/build; commit `git commit -m "feat: private note API with write quota"`.

### Task 1.4: Note store, client lib, list page and editor

**Files:** `app/lib/note-api.ts`, `app/stores/note-store.ts`, `app/notes/page.tsx`, `app/notes/new/page.tsx`, `app/notes/[id]/page.tsx`, `app/components/notes/{note-card,note-editor,sync-status-indicator}.tsx`, `tests/unit/note-store.test.ts`

- [ ] Write tests: `note-api` sends no `userId`; `switchNoteAccount` clears prior cache and never cross-contaminates; guest drafts persist to `codenow-notes-local`; `hydrateNotes` overwrites on login; failed save queues via `useCloudSave`; cloud mirror + counts excluded from `partialize`.
- [ ] Run focused tests; expect failures.
- [ ] Implement `note-api` typed fetch, `note-store` (guest drafts + UI prefs persisted, cloud mirror/version not), "我的笔记" list page, editor (title/tags/category/visibility-toggle placeholder/`SafeMarkdown` preview/five-state indicator via `useCloudSave`), reusing `.library-page` grid + `.sync-status` styles. Public view/comments/reactions deferred.
- [ ] Wire logout `switchNoteAccount(null)` into the three `onSignedOut` callbacks (`page`/`library`/`problem`).
- [ ] Run tests/build; commit `git commit -m "feat: private notes list and editor"`.

## 阶段 2：题目关联 + 游客迁移

### Task 2.1: Add note_problem_refs and body-ref replacement

**Files:** `db/schema.ts`, `app/server/notes/note-repository.ts`, `app/api/notes/[id]/route.ts`, `drizzle/00XX_*.sql`, `tests/unit/note-problem-refs.test.ts`

- [ ] Write tests: `problemRefs` array replaced atomically with parent `version` bump (D1 batch + local transaction paths); private `problem_ref` validated via `ownedProblem`, cross-user ref → `400 INVALID_PROBLEM_REF`; `(note_id, sort_order)` unique; ≤ 50 refs.
- [ ] Run focused tests; expect failures.
- [ ] Define `note_problem_refs`; implement `replaceProblemRefs` (delete+insert in same batch/transaction as note update, poison-pill optimistic lock for D1). Generate migration.
- [ ] Run tests/build; commit `git commit -m "feat: note body problem references"`.

### Task 2.2: Problem-ref card token, picker and problem-page notes Tab

**Files:** `app/lib/notes/markdown.ts`, `app/components/notes/{problem-ref-card,problem-ref-picker}.tsx`, `app/stores/problem-store.ts`, `app/problem/[id]/page.tsx`, `tests/unit/problem-ref-card.test.tsx`

- [ ] Write tests: custom `:::note-problem{ref,kind}` token survives sanitize as a placeholder node and is rendered by trusted `ProblemRefCard` (server-looked-up title/difficulty), never via `dangerouslySetInnerHTML`; private ref hidden if not owned; `problem-store.tab` union extended to `"problem"|"tests"|"notes"`; problem page notes Tab lists `source='problem'` notes for the current `problem_ref` and "＋写笔记" prefills it.
- [ ] Run focused tests; expect failures.
- [ ] Implement token grammar + sanitize-schema allowance + post-sanitize component resolution; `ProblemRefPicker` (searches own library via `ProblemApi.list`); extend `problem-store` tab + add `.notes-content` panel matching `library` `cloudId`/`id` split.
- [ ] Run tests/build; commit `git commit -m "feat: problem reference cards and problem-page notes tab"`.

### Task 2.3: Guest note migration into existing wizard

**Files:** `app/lib/local-data/{types,parse}.ts`, `app/components/local-data-migration.tsx`, `app/server/imports/import-service.ts`, `tests/unit/note-migration.test.ts`

- [ ] Write tests: `LocalDataManifestV1.notes` parsed from `codenow-notes-local`; preview `counts` includes note count; commit maps `problemRef` through `problemIds`, defaults `visibility='private'`; **skipped-problem note degrades to `source='standalone'` + cleared ref + kept body + warning**; body refs to skipped problems silently dropped; sensitive-field rejection.
- [ ] Run focused tests; expect failures.
- [ ] Implement the four-site change (types/parse `SOURCE_KEYS`+`readStore`/migration component `counts`/import-service `validateManifest`+`commit`) with the orphan-ref degrade path.
- [ ] Run tests/build; commit `git commit -m "feat: migrate guest notes with orphan-ref degrade"`.

## 阶段 3：公开发布 + 广场 + 顶栏

### Task 3.1: Publish toggle and public read path

**Files:** `app/server/notes/note-repository.ts`, `app/api/notes/route.ts`, `app/api/notes/[id]/route.ts`, `tests/unit/note-public-read.test.ts`

- [ ] Write tests: `readPublic`/`listPublic` return only `public+published+visible+not-deleted`, strip `user_id`, expose `author.name` only; author sees any state via private path; non-author/guest gets 404 for private/unpublished/hidden/deleted; `view=public` serialization omits `viewerLiked`; publish sets `published_at`; unpublish/soft-delete removes from public next query.
- [ ] Run focused tests; expect failures.
- [ ] Implement `listPublic`/`readPublic` (independent `where`, no `or` with private), publish/unpublish via PATCH `visibility`/`status`, `view=public` branch in list handler with `no-store` (no `private`) anonymous serialization.
- [ ] Run `rg -n "or\(" app/server/notes` to confirm no public/private `where` mixing. Run tests/build; commit `git commit -m "feat: publish notes and public read path"`.

### Task 3.2: Tags and public square UI

**Files:** `db/schema.ts`, `app/server/notes/tag-repository.ts`, `app/api/tags/route.ts`, `app/notes/page.tsx`, `app/components/notes/note-visibility-toggle.tsx`, `drizzle/00XX_*.sql`, `tests/unit/tags.test.ts`

- [ ] Write tests: `tags` per-user unique `(user_id,name)`; `note_tags` replaced with note; `GET /api/tags` returns own tags only; `view=mine` filters by `tag_id`, `view=public` filters by `name` text; tag name whitelist/length; public square lists public notes with tag/keyword filter.
- [ ] Run focused tests; expect failures.
- [ ] Define `tags`+`note_tags`, implement `tag-repository` (upsert + replace), `/api/tags` read route, public-square view + tag sidebar + visibility toggle (二次确认), note-card badges. Generate migration.
- [ ] Run tests/build; commit `git commit -m "feat: private tags and public square"`.

### Task 3.3: Wire topbar 讨论 entry (four sites)

**Files:** `app/components/topbar.tsx`, `app/page.tsx`, `app/library/page.tsx`, `app/problem/[id]/page.tsx`, `tests/e2e/notes-nav.spec.ts`

- [ ] Write an E2E asserting the "讨论" button in all four topbar copies navigates to `/notes` and highlights when on `/notes`.
- [ ] Replace `onToast` placeholder with `router.push("/notes")` in `topbar.tsx` and the three hand-copied topbar JSX blocks; add `isActive("notes")` branch in `Topbar`.
- [ ] Run E2E/build; commit `git commit -m "feat: wire discussion nav entry to notes"`.

## 阶段 4：评论 + 点赞收藏

### Task 4.1: Comments schema, repository and flat route

**Files:** `db/schema.ts`, `app/server/notes/comment-repository.ts`, `app/api/comments/route.ts`, `app/api/comments/[id]/route.ts`, `app/api/notes/[id]/comments/route.ts`, `app/server/security/auth-rate-limit.ts`, `drizzle/00XX_*.sql`, `tests/unit/comments.test.ts`

- [ ] Write tests: comment only on `public+published+visible` notes (private note comment → 404, incl. author); one-level `parent_id`; create bumps `comment_count += 1` in same batch; soft-delete `-1` with placeholder retained; delete allowed for comment author or note author else 404; idempotency key uniqueness; `comments` write-quota family matches `/api/comments`; read list via nested `GET /api/notes/:id/comments` with cursor.
- [ ] Run focused tests; expect failures.
- [ ] Define `note_comments`; implement `comment-repository` (create/list/delete, count maintenance, `publicComment` output), flat `POST /api/comments` + `DELETE /api/comments/:id` (family `comments`) + nested read route. Add `comments` to `USER_WRITE_LIMITS`.
- [ ] Run tests/build; commit `git commit -m "feat: note comments with moderation-safe counts"`.

### Task 4.2: Reactions schema, repository and flat route

**Files:** `db/schema.ts`, `app/server/notes/reaction-repository.ts`, `app/api/reactions/route.ts`, `app/server/security/auth-rate-limit.ts`, `drizzle/00XX_*.sql`, `tests/unit/reactions.test.ts`

- [ ] Write tests: `(user_id,note_id,kind)` PK idempotent (`onConflictDoNothing`), toggle via POST/DELETE, no `version`; `like` only on public notes; `favorite` on public OR author's own private note; count bump in same batch; `viewerLiked`/`viewerFavorited` only in private responses; `reactions` write-quota family matches `/api/reactions`.
- [ ] Run focused tests; expect failures.
- [ ] Define `note_reactions`; implement `reaction-repository` (toggle + count maintenance + target-visibility guard per decision 8), flat `/api/reactions` route (family `reactions`). Add `reactions` to `USER_WRITE_LIMITS`.
- [ ] Run tests/build; commit `git commit -m "feat: note likes and favorites"`.

### Task 4.3: Comment and interaction UI (lightweight sync)

**Files:** `app/components/notes/{comment-list,comment-composer}.tsx`, `app/notes/[id]/page.tsx`, `app/lib/note-api.ts`, `tests/unit/note-interactions-sync.test.ts`

- [ ] Write tests: comments render as plain text (not Markdown); reactions optimistic-update with idempotency key; 409 silently refetches counts without conflict dialog; guest sees read-only composer prompting login; delete button visibility gated to comment author or note author.
- [ ] Run focused tests; expect failures.
- [ ] Implement interaction bar + comment list/composer on detail page using the `PreferenceSync`-style path (debounced/immediate write, 409 → silent recount), NOT `useCloudSave`.
- [ ] Run `rg -n "useCloudSave" app/components/notes/comment*` to confirm comments do not use the heavy path. Run tests/build; commit `git commit -m "feat: comment and reaction UI with light sync"`.

## 阶段 5：举报 + 软下架（可选）

### Task 5.1: Reports schema, endpoint and optional auto-hide

**Files:** `db/schema.ts`, `app/server/notes/report-repository.ts`, `app/api/reports/route.ts`, `app/components/notes/report-dialog.tsx`, `app/server/security/auth-rate-limit.ts`, `drizzle/00XX_*.sql`, `tests/unit/reports.test.ts`

- [ ] Write tests: report only public targets (private → 404); `(reporter_user_id,target_kind,target_id)` unique (repeat report idempotent, no double count); `reporter_user_id` never in any author/public response; optional: reaching threshold (5 distinct reporters) sets `moderation_state='hidden'` in same batch and hides from public reads; `reports` write-quota family matches `/api/reports`.
- [ ] Run focused tests; expect failures.
- [ ] Define `reports`; implement `report-repository` (insert with uniqueness, optional threshold count → auto-hide), `POST /api/reports` (family `reports`), report dialog UI. Add `reports` to `USER_WRITE_LIMITS`. If auto-hide deferred, land reports-only and keep `moderation_state` manual.
- [ ] Run tests/build; commit `git commit -m "feat: content reports with optional auto-hide"`.

### Task 5.2: Full end-to-end and release gates

**Files:** `tests/e2e/notes-lifecycle.spec.ts`, `tests/e2e/helpers.ts`, `docs/auth-operations.md`

- [ ] Add an E2E: guest creates a problem-linked note → login → migration preview shows note count → commit → note in cloud; publish public → user B browses/comments/likes → author unpublishes → B gets 404; multi-device edit triggers conflict dialog; XSS payload note renders inert; logout clears private list without cross-account leakage.
- [ ] Run `npm run test:e2e`; expect PASS with artifacts secret-free.
- [ ] Run final gates: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`; all PASS. Verify `db:generate` migrations + meta snapshots committed as a batch.
- [ ] Update ops docs with note limits, write-quota families, and the CSP/SafeMarkdown residual-risk note. Commit `git commit -m "test: verify discussion module end to end"`.

Preview D1 migration application, Cloudflare deployment, and any CDN public-cache rollout for public notes remain external release gates and are not part of these tasks.
