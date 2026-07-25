# Preferences, AI Conversation Sync, and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync non-secret preferences and AI conversations, then complete security, capacity, observability, and release verification for the whole account system.

**Architecture:** Preferences are a single versioned row per user; conversations and messages are user-owned paginated resources. Existing Zustand stores remain UI caches and explicitly exclude provider API keys from every cloud payload. Release checks exercise two users across all private resources.

**Tech Stack:** TypeScript, Drizzle/D1, Zustand, Vitest, browser E2E tooling available in the project environment

---

### Task 1: Add preference and conversation schema

**Files:** `db/schema.ts`, `tests/unit/user-sync-schema.test.ts`, `drizzle/0005_*.sql`

- [ ] Write a failing schema test for one `userPreferences` row per user and indexed `aiConversations`/`aiMessages` with user ownership, role enum validation, sort order, timestamps, and versions.
- [ ] Run the focused test; expect missing exports.
- [ ] Define tables. `settings_json` may contain UI-only settings; do not add an API-key or credential column. Messages use `role = user|assistant`; conversation deletion cascades to messages.
- [ ] Generate and inspect migration, then run focused tests and build.
- [ ] Commit with `git commit -m "feat: add preferences and conversation schema"`.

### Task 2: Implement preference sync without secrets

**Files:** `app/server/preferences/preference-repository.ts`, `app/api/preferences/route.ts`, `app/stores/theme-store.ts`, `tests/unit/preferences-api.test.ts`

- [ ] Write tests for anonymous `401`, per-user isolation, initial GET defaults, conditional PATCH, stale `409`, unknown-key rejection, and rejection of `apiKey`, `apiKeys`, `token`, or `secret` at any JSON depth.
- [ ] Run focused tests; expect failure.
- [ ] Allow only `themeMode` and `editorTheme` initially. Implement GET/PATCH with versioning and no-store responses.
- [ ] Hydrate cloud preferences after login and debounce changes; guests retain current local persistence. Never modify `ai-store` API-key persistence in this task.
- [ ] Run tests/build and commit with `git commit -m "feat: sync safe user preferences"`.

### Task 3: Implement user-owned AI conversations

**Files:** `app/server/conversations/conversation-repository.ts`, `app/api/conversations/route.ts`, `app/api/conversations/[id]/messages/route.ts`, `tests/unit/conversations-api.test.ts`

- [ ] Write tests for create/list pagination, append message, ordering, title update, deletion, anonymous access, cross-user `404`, message/content limits, and API-key-shaped payload rejection.
- [ ] Run focused tests; expect missing modules.
- [ ] Implement repository functions requiring `userId`; lists return conversation metadata only, messages load by cursor, and an append increments conversation version/updated time in one batch.
- [ ] Implement routes with unified errors, private/no-store caching, body limits, and idempotency keys for message append.
- [ ] Run focused/full tests and build; commit with `git commit -m "feat: persist user ai conversations"`.

### Task 4: Connect AI store to cloud conversations

**Files:** `app/stores/ai-store.ts`, `app/lib/conversation-api.ts`, `app/problem/[id]/page.tsx`, `tests/unit/ai-store-sync.test.ts`

- [ ] Write tests proving provider endpoint/model/API keys stay local, only role/content messages are uploaded, switching accounts clears prior conversations, guests remain local, and a failed append stays queued.
- [ ] Run focused tests; expect failures.
- [ ] Split `ai-store` persistence into `localConfig` and conversation cache. Implement typed cloud fetch calls containing only `conversationId`, `problemRef`, `role`, `content`, and idempotency key.
- [ ] Load conversation metadata after login; load messages on selection; preserve current local conversation when anonymous; clear user cache on logout.
- [ ] Run `rg -n "apiKey|apiKeys" app/lib/conversation-api.ts app/api/conversations`; expected no matches. Run tests/build and commit `git commit -m "feat: sync ai conversations without api keys"`.

### Task 5: Add persistent limits and privacy-safe observability

**Files:** `db/schema.ts`, `app/server/security/auth-rate-limit.ts`, `app/server/observability/events.ts`, `app/middleware.ts`, `tests/unit/security-boundaries.test.ts`, `docs/auth-operations.md`

- [ ] Write tests for IP+email auth limits, per-user write quotas, private cache headers, log redaction, Markdown/script payload handling, and account A/B object-ID swapping across every route family.
- [ ] Run focused tests; expect at least rate-limit and event failures.
- [ ] Extend the D1-backed `auth_rate_limits` service created in Plan 1 with per-user quota actions and expiry cleanup; never store raw password/reset token. Add structured events containing request ID, event name, status, duration, and opaque user hash only.
- [ ] Enforce quotas centrally and update operations docs with thresholds, Resend domain verification, D1 migration/backup/restore, secret rotation, incident Session revocation, and rollback steps.
- [ ] Run focused tests, lint, full tests, and build; commit with `git commit -m "feat: enforce account security boundaries"`.

### Task 6: Complete two-user end-to-end and release gates

**Files:** `tests/e2e/auth-data-sync.spec.ts`, `tests/e2e/helpers.ts`, `playwright.config.ts`, `package.json`, `docs/auth-operations.md`

- [ ] Add an E2E script that creates users A/B through a test mail sink; verifies both; creates the same problem code in both accounts; saves different tests/drafts/preferences/conversations; reloads; asserts isolation; tests reset-password Session revocation; migrates guest data; triggers a version conflict; logs out and checks private UI removal.
- [ ] Install and pin the browser runner with `npm install --save-dev --save-exact @playwright/test` and `npx playwright install chromium`. Add `test:e2e: "playwright test"` to `package.json` and create `playwright.config.ts` with Chromium, `baseURL: "http://127.0.0.1:3000"`, a vinext web server, trace-on-first-retry, and screenshot-only-on-failure.
- [ ] Run `npm run test:e2e`; expect PASS with screenshots/traces retained only on failure and no secrets in artifacts.
- [ ] Run final gates: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`; all PASS.
- [ ] Apply migrations to a disposable preview D1, deploy preview, repeat registration with Resend test recipient, and verify Cookie flags and no-store headers.
- [ ] Commit with `git commit -m "test: verify end to end account data isolation"` and do not promote production until the preview checklist is signed off.
