# Local Data Migration and Conflict Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a newly authenticated user safely preview and import guest localStorage data, then preserve unsynced edits through network and session failures.

**Architecture:** A versioned client parser converts legacy Zustand payloads into a canonical import manifest. Preview is read-only; commit requires the preview fingerprint and an idempotency key. A small IndexedDB-backed queue retries normal writes, while server versions continue to arbitrate conflicts.

**Tech Stack:** TypeScript, Drizzle/D1, Web Crypto, IndexedDB, Zustand, Vitest

---

## File map

- Modify `db/schema.ts`; generate migration for `data_imports`.
- Create `app/lib/local-data/parse.ts`, `fingerprint.ts`, `queue.ts`, and shared types.
- Create `app/server/imports/import-service.ts`.
- Create `app/api/imports/local-data/preview/route.ts` and `commit/route.ts`.
- Create `app/components/local-data-migration.tsx` and `app/components/sync-conflict-dialog.tsx`.
- Modify `app/layout.tsx`, `app/stores/library-store.ts`, `app/stores/problem-store.ts`.

### Task 1: Parse legacy local data without trusting it

**Files:** `app/lib/local-data/types.ts`, `app/lib/local-data/parse.ts`, `tests/unit/local-data-parse.test.ts`

- [ ] Write fixtures for current `codenow-*`, legacy `codeforge-*`, corrupt JSON, missing fields, duplicate test IDs, and oversize test bodies. Assert parsing never throws and produces `{ manifest, warnings }` or `{ error }`.
- [ ] Run `npm run test:unit -- tests/unit/local-data-parse.test.ts`; expect module-not-found.
- [ ] Define `LocalDataManifestV1` with `schemaVersion: 1`, folders, problems, current draft, preferences, and conversations. Implement strict string/enum/array guards; regenerate IDs; normalize folder paths; apply the same size limits as cloud APIs; never parse or include AI API keys.
- [ ] Run focused tests; expect PASS. Commit with `git commit -m "feat: parse legacy local user data"`.

Canonical result:

```ts
export type LocalDataParseResult =
  | { ok: true; manifest: LocalDataManifestV1; warnings: string[] }
  | { ok: false; error: { code: "INVALID_JSON" | "UNSUPPORTED_VERSION" | "DATA_TOO_LARGE"; message: string } };
```

### Task 2: Build read-only preview and conflict classification

**Files:** `app/lib/local-data/fingerprint.ts`, `app/server/imports/import-service.ts`, `app/api/imports/local-data/preview/route.ts`, `tests/unit/import-preview.test.ts`

- [ ] Write failing tests for anonymous `401`, stable SHA-256 fingerprints, no-conflict preview, same-code conflict, oversize rejection, and proof that preview does not write any table.
- [ ] Run `npm run test:unit -- tests/unit/import-preview.test.ts`; expect failure.
- [ ] Compute the fingerprint from deterministic JSON with sorted keys. Implement `previewImport(userId, manifest)` returning counts and conflicts `{ localProblemKey, cloudProblemId, problemCode, cloudVersion }`.
- [ ] Implement POST preview with `Cache-Control: no-store`, unified errors, and no database mutations. Return `previewFingerprint` and expiry metadata.
- [ ] Run focused tests and build; expect PASS. Commit with `git commit -m "feat: preview local data migration"`.

### Task 3: Commit imports atomically and idempotently

**Files:** `db/schema.ts`, `drizzle/0004_*.sql`, `app/server/imports/import-service.ts`, `app/api/imports/local-data/commit/route.ts`, `tests/unit/import-commit.test.ts`

- [ ] Write failing tests for required idempotency key, repeated identical commit returning the first result, fingerprint mismatch, conflict decisions `overwrite|duplicate|skip`, stale cloud version, rollback on an invalid item, and no local API key fields.
- [ ] Run the focused test; expect missing schema/handler failures.
- [ ] Add `dataImports(id, userId, idempotencyKey, fingerprint, resultJson, createdAt)` with unique `(userId, idempotencyKey)`. Generate and inspect the migration.
- [ ] Implement `commitImport`: check an existing idempotency result first; recompute fingerprint; validate every conflict decision; use D1 batch transactions; duplicate codes receive the first available `-COPY-N` suffix; overwrite requires the previewed `cloudVersion`; insert the result record in the same transaction.
- [ ] Run focused tests, all unit tests, and build; expect PASS. Commit with `git commit -m "feat: import local data idempotently"`.

### Task 4: Add the migration wizard

**Files:** `app/components/local-data-migration.tsx`, `app/layout.tsx`, `app/globals.css`, `tests/unit/local-data-migration.test.tsx`

- [ ] Write component tests: not shown to guests; shown once after login when valid local data exists; displays counts/warnings; requires a decision for each collision; cancellation preserves data; success marks but does not immediately delete source keys.
- [ ] Run focused tests; expect missing component.
- [ ] Implement three states: scan, preview, commit. Offer “导入并合并” and “暂不导入”; place destructive “放弃本地数据” behind a typed confirmation. For conflicts offer overwrite, keep both, or skip.
- [ ] Store `{ fingerprint, importedAt, cleanupAfter }` under `codenow-local-migration-state`. Cleanup may run only after seven days and only when its fingerprint still matches the source payload.
- [ ] Run tests and build; manually retry the same commit twice. Commit with `git commit -m "feat: add local data migration wizard"`.

### Task 5: Persist failed writes and resume after login

**Files:** `app/lib/local-data/queue.ts`, `app/hooks/use-cloud-save.ts`, `app/components/sync-conflict-dialog.tsx`, `tests/unit/sync-queue.test.ts`

- [ ] Write fake IndexedDB/fake timer tests for enqueue, deduplication by resource, exponential retry cap, reload recovery, `401` pause, `409` conflict pause, success removal, and logout retaining only anonymous/local entries.
- [ ] Run `npm run test:unit -- tests/unit/sync-queue.test.ts`; expect failure.
- [ ] Implement queue records `{ id, userId, resourceType, resourceId, idempotencyKey, baseVersion, payload, attempts, nextAttemptAt }`. Never store password, token, email, or AI API key. Retry delays are 1s, 5s, 30s, 2m, then manual retry.
- [ ] Connect the queue to `useCloudSave`; pause on offline/401/409. After re-authentication, only resume entries whose `userId` equals the current Session user. Render the same two-choice conflict dialog used by direct saves.
- [ ] Run focused tests, `npm test`, and build; manually edit offline, reload, log in, and recover. Commit with `git commit -m "feat: recover unsynced user edits"`.

### Task 6: Phase verification

- [ ] Import a fixture containing folders, two problems, test cases, a draft, preferences, and AI messages; verify counts and content.
- [ ] Repeat with the same idempotency key; verify no new rows.
- [ ] Simulate conflict, network failure, Session expiry, and account switch; verify no cross-account replay.
- [ ] Run `npm run lint`, `npm test`, and `npm run build`; all PASS.
- [ ] Commit verification fixes with `git commit -m "test: verify local migration and recovery"`.
