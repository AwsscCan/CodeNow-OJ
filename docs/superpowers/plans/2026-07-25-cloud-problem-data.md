# Cloud Problem Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each authenticated user's folders, private problems, test cases, and per-language code drafts in D1 with optimistic concurrency.

**Architecture:** Focused repositories own SQL and require `userId`; route handlers own session and validation. Problem metadata and test-case bodies load separately so library lists stay small. Zustand remains the editing cache while a sync service reports local-only, saving, synced, failed, or conflicted state.

**Tech Stack:** TypeScript, Drizzle/D1, vinext route handlers, Zustand, Vitest

---

## File map

- Modify `db/schema.ts`; generate a new Drizzle migration.
- Create `app/server/problems/problem-validation.ts`, `problem-repository.ts`, and `draft-repository.ts`.
- Create `app/api/problems/route.ts`, `app/api/problems/[id]/route.ts`, `app/api/problems/[id]/test-cases/route.ts`, `app/api/folders/route.ts`, and `app/api/drafts/[problemRef]/route.ts`.
- Create `app/lib/problem-api.ts` and `app/hooks/use-cloud-save.ts`.
- Modify `app/stores/library-store.ts`, `app/stores/problem-store.ts`, `app/library/page.tsx`, and `app/problem/[id]/page.tsx`.

### Task 1: Add folders, problems, test cases, and drafts schema

**Files:** `db/schema.ts`, `tests/unit/problem-schema.test.ts`, `drizzle/0003_*.sql`

- [x] Write a failing test using `getTableColumns` and `getTableConfig` that asserts `folders.userId`, `problems.problemCode/version/deletedAt`, `testCases.problemId/sortOrder`, and `codeDrafts.problemRef/language/version`, plus unique keys `(userId, problemCode)` and `(userId, problemRef, language)`.
- [x] Run `npm run test:unit -- tests/unit/problem-schema.test.ts`; expect missing-export failures.
- [x] Define the four tables. Use integer versions defaulting to `1`, timestamp-ms fields, foreign keys to `users`, and indexes beginning with `user_id`. Store `problem_kind` beside `problem_ref` in drafts so public keys and private UUIDs cannot collide.
- [x] Run `npm run db:generate`; inspect the migration for both unique constraints and all foreign keys. Run the focused test and `npm run build`; expect PASS.
- [x] Commit with `git commit -m "feat: add cloud problem data schema"`.

### Task 2: Implement validation and user-scoped repositories

**Files:** `app/server/problems/problem-validation.ts`, `app/server/problems/problem-repository.ts`, `tests/unit/problem-repository.test.ts`

- [x] Write failing repository tests for: same problem code allowed across users; duplicate within one user rejected; user B cannot read/update user A; soft-deleted rows are absent; 512 KiB per input/output and 20 MiB per problem are enforced; stale version returns a typed conflict.
- [x] Run `npm run test:unit -- tests/unit/problem-repository.test.ts`; expect module-not-found.
- [x] Implement `validateProblem(input)` and `validateTestCases(items)` returning discriminated `{ ok: true, value } | { ok: false, code, field, message }` results. Export `ProblemConflictError` with `currentVersion` and `updatedAt`.
- [x] Implement `listProblems(userId, cursor)`, `getProblem(userId, id)`, `createProblem(userId, input)`, `updateProblem(userId, id, version, patch)`, `replaceTestCases(userId, problemId, version, cases)`, and `softDeleteProblem(userId, id, version)`. Every lookup includes `userId`; `replaceTestCases` uses a D1 batch/transaction and increments the parent version exactly once.
- [x] Run the focused tests; expect PASS. Commit `app/server/problems` and tests with `git commit -m "feat: add user scoped problem repository"`.

Repository result contracts must be explicit:

```ts
export type SaveResult<T> =
  | { ok: true; value: T; version: number; updatedAt: string }
  | { ok: false; status: 400 | 404 | 409 | 413; code: string; message: string; currentVersion?: number };
```

### Task 3: Expose problem, test-case, and folder APIs

**Files:** `app/api/problems/route.ts`, `app/api/problems/[id]/route.ts`, `app/api/problems/[id]/test-cases/route.ts`, `app/api/folders/route.ts`, `tests/unit/problems-api.test.ts`

- [x] Write route tests with injected user/repository dependencies. Cover anonymous `401`, user A success, user B `404`, invalid payload `400`, stale version `409`, oversize `413`, and list responses that omit `input`/`expectedOutput`.
- [x] Run `npm run test:unit -- tests/unit/problems-api.test.ts`; expect missing routes.
- [x] Implement handlers that call `requireUser`, reject client `userId`, map repository results to `{ error: { code, message, field? } }`, set `Cache-Control: private, no-store`, and return `version`/`updatedAt` after writes.
- [x] Implement folders with create/rename/move/delete. Validate that parent folders belong to the same user; deleting a folder moves its problems to its parent or the user's root folder and never deletes problems.
- [x] Run focused tests, `npm test`, and `npm run build`; expect PASS. Commit with `git commit -m "feat: add private problem APIs"`.

### Task 4: Persist code drafts with optimistic concurrency

**Files:** `app/server/problems/draft-repository.ts`, `app/api/drafts/[problemRef]/route.ts`, `tests/unit/drafts-api.test.ts`

- [x] Write failing tests for public and private problem refs, per-language uniqueness, anonymous `401`, cross-user isolation, insert at version 1, update to version 2, and stale update `409`.
- [x] Run `npm run test:unit -- tests/unit/drafts-api.test.ts`; expect failure.
- [x] Implement `getDraft(userId, problemKind, problemRef, language)` and `saveDraft(userId, input, expectedVersion)`. Private refs must resolve to a problem owned by the same user; source length uses the existing submission-source limit or a stricter shared constant.
- [x] Implement GET/PUT route mapping and return `{ draft, version, updatedAt }`; omit `userId` from client payloads.
- [x] Run focused tests and build; expect PASS. Commit with `git commit -m "feat: sync per language code drafts"`.

### Task 5: Hydrate the library and show explicit save state

**Files:** `app/lib/problem-api.ts`, `app/hooks/use-cloud-save.ts`, `app/stores/library-store.ts`, `app/stores/problem-store.ts`, `app/library/page.tsx`, `app/problem/[id]/page.tsx`, `tests/unit/cloud-save.test.ts`

- [x] Write fake-timer tests for the sync hook: anonymous changes stay `local-only`; authenticated edits debounce once; success becomes `synced`; network error becomes `failed` without deleting local state; `409` becomes `conflicted` and exposes both versions.
- [x] Run `npm run test:unit -- tests/unit/cloud-save.test.ts`; expect missing hook.
- [x] Implement `ProblemApi` as a typed fetch wrapper and `useCloudSave({ enabled, version, save, onConflict })`. Use an `AbortController`, a stable idempotency key per pending change, and retain the payload until success.
- [x] Add non-persisted store fields `cloudId`, `version`, and `syncStatus`. When logged in, hydrate library metadata from `/api/problems`; fetch a problem with test cases only when opened. Keep current localStorage behavior for guests.
- [x] Add visible save-state text and a conflict dialog with exactly two actions: “使用云端版本” and “用本地版本覆盖”. The overwrite action first refetches and sends the returned current version; never bypass version checking.
- [x] Run the focused test, `npm test`, and `npm run build`; expect PASS. Manually verify device A/device B conflict. Commit with `git commit -m "feat: sync private problems and drafts"`.

### Task 6: Phase verification

- [ ] Apply migrations to a disposable local D1 database and seed users A/B.
- Blocked locally: Wrangler 4.92.0/workerd 2026-05-15 crashes on Windows 10.0.26200 with access violation before starting Miniflare. The same migrations and seed were verified through the disposable better-sqlite3 adapter used by local tests.
- [x] Verify user A can create `CF0001` with 200 small tests and user B can independently create the same code.
- [x] Verify a 513 KiB input returns `413`, lists omit test bodies, and soft-deleted problems return `404`.
- [x] Run `npm run lint`, `npm test`, and `npm run build`; all must PASS.
- [x] Commit any test-only fixes with `git commit -m "test: verify cloud problem persistence"`.
