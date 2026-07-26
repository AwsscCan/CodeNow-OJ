# Private Administrator and Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add invitation-only accounts, a persistent owner administrator, safe user/content administration, and one-time temporary passwords.

**Architecture:** Better Auth's admin plugin supplies password hashing, user creation, bans, roles, and Session revocation. Thin application services enforce last-admin protection, forced password changes, audit redaction, and content ownership boundaries. Local auth uses a persistent ignored SQLite database; D1 keeps the same Drizzle schema.

**Tech Stack:** TypeScript, vinext/Next, Better Auth admin plugin, Drizzle ORM, SQLite/D1, React, Vitest, Playwright

---

### Task 1: Add administrator and moderation schema

**Files:**
- Modify: `db/schema.ts`
- Create: `tests/unit/admin-schema.test.ts`
- Create: generated `drizzle/0008_*.sql`

- [x] **Step 1: Write the failing schema test**

```ts
import { getTableColumns, getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { adminAuditLogs, aiConversations, codeDrafts, sessions, users } from "../../db/schema";

describe("administrator schema", () => {
  it("stores roles, bans, forced password changes, moderation markers, and audit indexes", () => {
    expect(getTableColumns(users)).toMatchObject({ role: expect.anything(), banned: expect.anything(), mustChangePassword: expect.anything() });
    expect(getTableColumns(sessions)).toHaveProperty("impersonatedBy");
    expect(getTableColumns(codeDrafts)).toHaveProperty("deletedAt");
    expect(getTableColumns(aiConversations)).toHaveProperty("deletedAt");
    expect(getTableConfig(adminAuditLogs).indexes.map((index) => index.config.name)).toContain("admin_audit_target_idx");
  });
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm run test:unit -- tests/unit/admin-schema.test.ts`

Expected: FAIL because `adminAuditLogs` and administrator columns do not exist.

- [x] **Step 3: Add the minimal schema**

Add `role`, `banned`, `banReason`, `banExpires`, and `mustChangePassword` to `users`; `impersonatedBy` to `sessions`; nullable `deletedAt` to `codeDrafts` and `aiConversations`; and an `admin_audit_logs` table with `id`, `adminUserId`, `action`, `targetType`, `targetId`, `requestId`, `metadataJson`, and `createdAt`. Add database CHECK constraints for `user|admin` and the fixed audit action set.

- [x] **Step 4: Generate and inspect migration**

Run: `npm run db:generate`

Expected: one new migration that defaults existing users to `user`, adds nullable moderation fields without data loss, and creates audit indexes.

- [x] **Step 5: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/admin-schema.test.ts && npm run build`

Commit: `git commit -m "feat: add administrator schema"`

### Task 2: Enable invitation-only Better Auth administration

**Files:**
- Modify: `app/lib/auth.ts`
- Modify: `app/lib/auth-client.ts`
- Modify: `app/api/auth/[...all]/route.ts`
- Modify: `app/lib/auth-compat.ts`
- Create: `tests/unit/invitation-auth.test.ts`

- [x] **Step 1: Write failing tests for plugin fields and closed registration**

```ts
it("returns 404 for public sign-up and reset-mail endpoints in invitation mode", async () => {
  process.env.INVITE_ONLY = "1";
  expect((await POST(request("/api/auth/sign-up/email"))).status).toBe(404);
  expect((await POST(request("/api/auth/request-password-reset"))).status).toBe(404);
});

it("keeps sign-in and authenticated change-password available", async () => {
  expect((await POST(request("/api/auth/sign-in/email"))).status).not.toBe(404);
  expect((await POST(request("/api/auth/change-password"))).status).not.toBe(404);
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm run test:unit -- tests/unit/invitation-auth.test.ts`

Expected: public sign-up is still routed to Better Auth.

- [x] **Step 3: Configure Better Auth admin plugin**

Add `admin({ defaultRole: "user", adminRoles: ["admin"], allowImpersonatingAdmins: false })` and `adminClient()`; map all plugin fields to the Drizzle schema. In the auth catch-all route, return private/no-store `404` for `/sign-up/email`, `/send-verification-email`, `/request-password-reset`, and `/reset-password` while `INVITE_ONLY === "1"`; do not block sign-in or change-password.

- [x] **Step 4: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/invitation-auth.test.ts tests/unit/auth-api.test.ts && npm run build`

Commit: `git commit -m "feat: close public account registration"`

### Task 3: Add admin authorization, audit redaction, and account service

**Files:**
- Create: `app/server/admin/admin-authorization.ts`
- Create: `app/server/admin/admin-audit.ts`
- Create: `app/server/admin/admin-account-service.ts`
- Create: `tests/unit/admin-account-service.test.ts`

- [x] **Step 1: Write failing service tests**

```ts
it("creates an invited verified user with a one-time temporary password", async () => {
  const result = await service.invite(adminId, requestId, { email: "friend@example.test", name: "Friend" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{24,}$/);
  expect(await user(result.value.user.id)).toMatchObject({ role: "user", emailVerified: true, mustChangePassword: true });
  expect(JSON.stringify(await audits())).not.toContain(result.value.temporaryPassword);
});

it("refuses to ban the last active administrator", async () => {
  expect(await service.ban(adminId, requestId, adminId, "owner protection")).toMatchObject({ ok: false, status: 409 });
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm run test:unit -- tests/unit/admin-account-service.test.ts`

Expected: missing admin service modules.

- [x] **Step 3: Implement minimal services**

`requireAdmin` resolves the Session and returns `null` for missing/non-admin/banned users. Generate passwords with `crypto.getRandomValues`, call Better Auth admin endpoints for create-user, set-password, ban/unban, and revoke-user-sessions, update `mustChangePassword`, and write an allowlisted audit row in the same application operation. Reject sensitive metadata keys recursively.

- [x] **Step 4: Add last-admin, duplicate invitation, reset, ban, unban, and audit tests**

Verify duplicate email returns `409`, password reset revokes Sessions, audit metadata excludes email and password, and a second active admin permits banning the first.

- [x] **Step 5: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/admin-account-service.test.ts tests/unit/security-boundaries.test.ts`

Commit: `git commit -m "feat: administer invited accounts safely"`

### Task 4: Expose bounded administrator APIs

**Files:**
- Create: `app/api/admin/overview/route.ts`
- Create: `app/api/admin/users/route.ts`
- Create: `app/api/admin/users/[id]/route.ts`
- Create: `app/api/admin/users/[id]/sessions/route.ts`
- Create: `app/api/admin/audit/route.ts`
- Create: `tests/unit/admin-api.test.ts`

- [ ] **Step 1: Write failing route tests**

```ts
it.each(["anonymous", "normal-user"])("returns 404 to %s", async (identity) => {
  setIdentity(identity);
  expect((await usersRoute.GET(request("/api/admin/users"))).status).toBe(404);
});

it("lets an administrator invite and paginate users without returning password fields", async () => {
  setIdentity("admin");
  const created = await usersRoute.POST(request("/api/admin/users", "POST", { email: "friend@example.test", name: "Friend" }));
  expect(created.status).toBe(201);
  expect(JSON.stringify(await (await usersRoute.GET(request("/api/admin/users?limit=20"))).json())).not.toMatch(/password|token/i);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:unit -- tests/unit/admin-api.test.ts`

- [ ] **Step 3: Implement routes**

Use a shared `404` response and `Cache-Control: private, no-store`. Bound list limits to `1..50`, validate cursors, names, emails, and ban reasons, enforce body limits, and return a temporary password only from successful invite/reset responses.

- [ ] **Step 4: Verify ownership swapping and headers**

Add tests for forged user IDs, last-admin protection, missing targets, `x-request-id`, no-store, and audit pagination.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/admin-api.test.ts tests/unit/security-boundaries.test.ts`

Commit: `git commit -m "feat: expose private administrator APIs"`

### Task 5: Force first password change and persist local accounts

**Files:**
- Modify: `app/lib/auth.ts`
- Create: `app/api/account/complete-invitation/route.ts`
- Create: `app/(auth)/change-temporary-password/page.tsx`
- Modify: `app/components/auth-status.tsx`
- Modify: `.gitignore`
- Create: `tests/unit/temporary-password.test.tsx`
- Create: `tests/unit/local-auth-persistence.test.ts`

- [ ] **Step 1: Write RED tests**

Test that a user with `mustChangePassword` is redirected from private pages, the completion route requires the current password, clears the flag, and revokes other Sessions. Open the same configured SQLite filename twice and assert the created user remains visible.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm run test:unit -- tests/unit/temporary-password.test.tsx tests/unit/local-auth-persistence.test.ts`

- [ ] **Step 3: Implement persistence and completion**

Use `CODEFORGE_LOCAL_DB_PATH` or `.data/codenow.db`, create `.data/` when absent, migrate once per process, and ignore `.data/`. The completion route calls Better Auth change-password, clears `mustChangePassword`, revokes other Sessions, and returns no-store. The page never stores the temporary password.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/temporary-password.test.tsx tests/unit/local-auth-persistence.test.ts && npm run build`

Commit: `git commit -m "feat: persist and complete invited accounts"`

### Task 6: Add content moderation service and API

**Files:**
- Create: `app/server/admin/admin-content-service.ts`
- Create: `app/api/admin/content/route.ts`
- Create: `app/api/admin/content/[type]/[id]/route.ts`
- Modify: `app/server/problems/draft-repository.ts`
- Modify: `app/server/conversations/conversation-repository.ts`
- Create: `tests/unit/admin-content.test.ts`

- [ ] **Step 1: Write RED tests**

Create two users with private resources. Assert only an admin can list explicit content types, soft-delete and restore by opaque ID, normal repositories hide deleted records, another user cannot infer target existence, and audit rows contain IDs but not content.

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test:unit -- tests/unit/admin-content.test.ts`

- [ ] **Step 3: Implement typed moderation**

Accept only `problem`, `draft`, and `conversation` initially. Paginate metadata, load details explicitly, update `deletedAt` rather than deleting rows, filter deleted drafts/conversations in normal repositories, and audit `content.soft_delete` or `content.restore`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/admin-content.test.ts tests/unit/problems-api.test.ts tests/unit/conversations-api.test.ts`

Commit: `git commit -m "feat: moderate private user content"`

### Task 7: Build the administrator interface

**Files:**
- Create: `app/admin/page.tsx`
- Create: `app/components/admin/admin-dashboard.tsx`
- Create: `app/components/admin/admin-users.tsx`
- Create: `app/components/admin/admin-content.tsx`
- Create: `app/lib/admin-api.ts`
- Modify: `app/components/auth-status.tsx`
- Create: `tests/unit/admin-ui.test.tsx`

- [ ] **Step 1: Write RED component tests**

Test non-admin invisibility, user pagination, invitation form, one-time password panel dismissal, confirmation for ban/soft-delete, restore, and audit rendering without sensitive payloads.

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:unit -- tests/unit/admin-ui.test.tsx`

- [ ] **Step 3: Implement focused UI components**

Keep API calls in `admin-api.ts`; show the admin navigation only when the Session role is `admin`; use accessible dialogs and explicit confirmation text; clear the temporary password from React state when dismissed or navigating away.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/admin-ui.test.tsx tests/unit/auth-status.test.tsx && npm run build`

Commit: `git commit -m "feat: add private administrator console"`

### Task 8: Add bootstrap CLI and end-to-end coverage

**Files:**
- Create: `scripts/bootstrap-admin.mjs`
- Create: `app/api/internal/bootstrap-admin/route.ts`
- Modify: `package.json`
- Create: `tests/unit/bootstrap-admin.test.ts`
- Create: `tests/e2e/admin-invitations.spec.ts`
- Modify: `tests/e2e/helpers.ts`
- Modify: `docs/auth-operations.md`

- [ ] **Step 1: Write RED bootstrap tests**

Run the bootstrap module against a temporary SQLite database. Assert first creation returns a temporary password, the user is verified/admin/forced-change, rerun returns `alreadyExists: true` without a password, and production requires `--confirm-production`.

- [ ] **Step 2: Implement the guarded bootstrap endpoint and CLI**

The internal endpoint requires `Authorization: Bearer <ADMIN_BOOTSTRAP_TOKEN>`, refuses every request after an administrator exists, rate-limits failures, and never returns stored credentials. Add `admin:bootstrap:local` and make the CLI accept `--target local|preview|production`, `--email`, and `--confirm-production`; local mode calls the service directly and remote modes call the deployed guarded endpoint. Read the bootstrap token from protected standard input or environment, emit structured status to stdout, and emit the one-time password to stderr only after success. Never accept passwords or bootstrap tokens as command-line arguments.

- [ ] **Step 3: Write and run browser E2E**

Bootstrap `700whitebird007@gmail.com`, sign in with its temporary password, change it, invite a friend, complete the friend's first login, inspect their content, ban them, verify their Session is revoked, unban them, and soft-delete/restore a problem.

Run: `npm run test:e2e -- tests/e2e/admin-invitations.spec.ts`

Expected: PASS with no real secrets in trace or screenshots.

- [ ] **Step 4: Run final local gates and commit**

Run: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`, and `git diff --check`.

Commit: `git commit -m "test: verify private administrator invitations"`
