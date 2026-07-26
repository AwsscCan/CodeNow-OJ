# Per-User AI Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store each logged-in user's AI provider keys encrypted on the server and resolve them for AI requests without returning full keys to the browser.

**Architecture:** A dedicated Drizzle table stores AES-256-GCM ciphertext per `(userId, provider)`. Authenticated credential APIs expose only configuration status and masked suffixes, while a shared server resolver injects decrypted keys into existing AI routes. A client synchronizer migrates existing browser keys once and then keeps only non-secret status in memory.

**Tech Stack:** TypeScript, Web Crypto API, Drizzle ORM, SQLite/D1, vinext/Next, Zustand, Vitest, Playwright

---

### Task 1: Add the encrypted credential schema

**Files:**
- Modify: `db/schema.ts`
- Create: `tests/unit/ai-credential-schema.test.ts`
- Create: generated `drizzle/0009_*.sql`

- [ ] **Step 1: Write the failing schema test**

```ts
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { expect, it } from "vitest";
import { userAiCredentials } from "../../db/schema";

it("stores one encrypted credential per user and provider", () => {
  const config = getTableConfig(userAiCredentials);
  expect(Object.keys(userAiCredentials)).toEqual(expect.arrayContaining([
    "userId", "provider", "ciphertext", "iv", "keyVersion", "maskedSuffix", "createdAt", "updatedAt",
  ]));
  expect(config.checks.map((item) => item.name)).toContain("user_ai_credentials_provider_check");
  expect(config.primaryKeys).toHaveLength(1);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:unit -- tests/unit/ai-credential-schema.test.ts`

Expected: FAIL because `userAiCredentials` is not exported.

- [ ] **Step 3: Add the minimal table and generate migration**

```ts
export const userAiCredentials = sqliteTable("user_ai_credentials", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["deepseek", "openai", "custom"] }).notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  maskedSuffix: text("masked_suffix").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.provider] }),
  check("user_ai_credentials_provider_check", sql`${table.provider} in ('deepseek', 'openai', 'custom')`),
]);
```

Run: `npm run db:generate`. Inspect the generated SQL and ensure it creates only the new table and indexes.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/ai-credential-schema.test.ts tests/unit/admin-schema.test.ts && npm run build`

Commit: `git commit -m "feat: add encrypted AI credential schema"`

### Task 2: Implement Web Crypto credential storage

**Files:**
- Create: `app/server/ai/ai-credential-service.ts`
- Create: `tests/unit/ai-credential-service.test.ts`

- [ ] **Step 1: Write RED service tests**

Create a migrated in-memory database with users `user-a` and `user-b`. Use a fixed 32-byte Base64URL test master key and assert:

```ts
const service = createAiCredentialService(db, testMasterKey);
await service.save("user-a", "deepseek", "sk-user-a-secret");
await service.save("user-b", "deepseek", "sk-user-b-secret");
expect(await service.resolve("user-a", "deepseek")).toBe("sk-user-a-secret");
expect(await service.resolve("user-b", "deepseek")).toBe("sk-user-b-secret");
expect(JSON.stringify(await db.select().from(userAiCredentials))).not.toContain("sk-user");
expect(await service.listStatus("user-a")).toMatchObject({ deepseek: { configured: true, maskedSuffix: "cret" } });
```

Add tests proving two saves of the same plaintext use different IVs, delete removes only the selected provider, invalid providers fail before querying, and an invalid/missing master key throws `AI credential encryption is unavailable` without including credential data.

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:unit -- tests/unit/ai-credential-service.test.ts`

Expected: FAIL because the service module is missing.

- [ ] **Step 3: Implement minimal AES-256-GCM service**

Implement `createAiCredentialService(db, masterKey)` with:

```ts
type AiProvider = "deepseek" | "openai" | "custom";
type CredentialStatus = Record<AiProvider, { configured: boolean; maskedSuffix: string | null }>;

async function importMasterKey(encoded: string) {
  const bytes = Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), (value) => value.charCodeAt(0));
  if (bytes.byteLength < 32) throw new Error("AI credential encryption is unavailable");
  const derived = await crypto.subtle.digest("SHA-256", bytes);
  return crypto.subtle.importKey("raw", derived, "AES-GCM", false, ["encrypt", "decrypt"]);
}
```

For each save, generate a new 12-byte IV, encrypt UTF-8 bytes, Base64URL-encode ciphertext and IV, and upsert on `(userId, provider)`. Validate Key length `1..4096`. Never include plaintext in errors.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/ai-credential-service.test.ts tests/unit/security-boundaries.test.ts`

Commit: `git commit -m "feat: encrypt per-user AI credentials"`

### Task 3: Expose authenticated credential APIs

**Files:**
- Create: `app/api/ai-credentials/route.ts`
- Create: `app/api/ai-credentials/[provider]/route.ts`
- Modify: `app/lib/auth.ts`
- Create: `tests/unit/ai-credentials-api.test.ts`

- [ ] **Step 1: Write failing API tests**

Use injectable handler factories. Assert anonymous requests return 404, authenticated users see only their three statuses, PUT never echoes the Key, DELETE clears one provider, all responses are `private, no-store`, bodies over 8 KiB are rejected, and forged `userId` fields are rejected.

```ts
const saved = await handlers.PUT(request("/api/ai-credentials/deepseek", "PUT", { key: "sk-secret" }), "deepseek");
expect(saved.status).toBe(200);
expect(JSON.stringify(await saved.json())).not.toContain("sk-secret");
expect((await listHandlers.GET(request("/api/ai-credentials"))).headers.get("cache-control")).toBe("private, no-store");
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:unit -- tests/unit/ai-credentials-api.test.ts`

Expected: FAIL because both routes are missing.

- [ ] **Step 3: Implement handlers and runtime secret plumbing**

Extend `RuntimeBindings` and `RuntimeServices` with `AI_CREDENTIALS_MASTER_KEY`. Resolve the user only through `auth.api.getSession`. The list route calls `listStatus`; the provider route accepts only the three fixed providers and exact `{ key }` bodies. Return 404 for anonymous or invalid provider, 400 for invalid bodies, and never serialize service internals.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/ai-credentials-api.test.ts tests/unit/auth-factory.test.ts && npm run build`

Commit: `git commit -m "feat: expose private AI credential APIs"`

### Task 4: Resolve authenticated keys inside AI routes

**Files:**
- Create: `app/api/_lib/resolve-ai-key.ts`
- Modify: `app/api/ai/route.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/generate-problem/route.ts`
- Modify: `app/api/generate-tests/route.ts`
- Create: `tests/unit/ai-key-resolution.test.ts`

- [ ] **Step 1: Write RED resolver and route tests**

Test three cases with injectable services:

```ts
expect(await resolveAiKey({ sessionUserId: "user-a", provider: "deepseek", bodyApiKey: undefined })).toBe("stored-key-a");
await expect(resolveAiKey({ sessionUserId: "user-a", provider: "deepseek", bodyApiKey: "forged" })).rejects.toMatchObject({ status: 400 });
expect(await resolveAiKey({ sessionUserId: null, provider: "deepseek", bodyApiKey: "guest-key" })).toBe("guest-key");
```

For every AI route, assert authenticated requests pass the resolved key to the upstream fetch or generator and that responses/logs do not contain it.

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:unit -- tests/unit/ai-key-resolution.test.ts`

Expected: FAIL because `resolve-ai-key.ts` is missing.

- [ ] **Step 3: Implement resolver and replace direct body reads**

`resolveAiKeyForRequest(request, body)` validates `provider`, gets runtime services and Session, rejects `body.apiKey` for logged-in users, and calls `createAiCredentialService(...).resolve`. Guests may use `body.apiKey` or the explicit deployment-wide `AI_API_KEY` fallback. Logged-in users without their own provider credential receive a generic 400.

Update all four routes to call this helper before invoking upstream AI functions. Do not add user IDs to request bodies.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/ai-key-resolution.test.ts tests/unit/security-boundaries.test.ts && npm run build`

Commit: `git commit -m "feat: resolve AI keys by authenticated user"`

### Task 5: Synchronize credential status and migrate browser keys

**Files:**
- Create: `app/lib/ai-credential-api.ts`
- Create: `app/components/ai-credential-sync.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/stores/ai-store.ts`
- Modify: `app/library/page.tsx`
- Modify: `app/problem/[id]/page.tsx`
- Modify: `tests/unit/ai-store-sync.test.ts`
- Create: `tests/unit/ai-credential-sync.test.tsx`

- [ ] **Step 1: Write failing client tests**

Mock Session and credential API. Assert:

- Guest `setApiKey` still writes browser storage.
- Logged-in hydration exposes only `{ configured, maskedSuffix }` and never inserts the full cloud Key into Zustand.
- If cloud status is unconfigured and a local Key exists, sync uploads it once and removes local storage only after success.
- Failed upload keeps the local Key.
- Switching from `user-a` to `user-b` clears pending input and status before loading user B.
- AI request builders omit `apiKey` for logged-in users and retain it for guests.

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:unit -- tests/unit/ai-credential-sync.test.tsx tests/unit/ai-store-sync.test.ts`

Expected: FAIL because the sync component and credential status fields do not exist.

- [ ] **Step 3: Implement minimal client synchronization**

Add `credentialStatus` and `credentialAccountId` to the AI store. Keep `apiKeys` only for guest/pending input. `AiCredentialSync` loads status after login, migrates missing provider keys sequentially, deletes `codenow-api-keys` and `codeforge-api-keys` only after all non-empty local keys are saved, and resets account-bound state on Session changes.

Replace both settings panels with a controlled password input and status copy such as `已配置 ····1234`. Saving calls `AiCredentialApi.save`, clears the input/local secret, and refreshes status. Deleting requires explicit confirmation and calls the DELETE route. Request builders include `provider` and omit `apiKey` when logged in.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm run test:unit -- tests/unit/ai-credential-sync.test.tsx tests/unit/ai-store-sync.test.ts tests/unit/preference-sync.test.tsx && npm run build`

Commit: `git commit -m "feat: synchronize user AI credentials"`

### Task 6: Add end-to-end isolation and operations documentation

**Files:**
- Create: `tests/e2e/ai-credentials.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `docs/auth-operations.md`

- [ ] **Step 1: Write the failing E2E test**

Bootstrap two invited users in the isolated Playwright database. Through the credential UI, save `e2e-user-a-key-1111` for user A and `e2e-user-b-key-2222` for user B, reload both browser contexts, and verify each status shows only its own suffix. Delete user A's Key and verify user A becomes unconfigured while user B remains configured.

Disable trace and screenshots for this spec. Assert credential GET responses and rendered HTML never contain either full Key.

- [ ] **Step 2: Run and verify RED**

Run: `npm run test:e2e -- tests/e2e/ai-credentials.spec.ts`

Expected: FAIL until the complete UI and route integration is present.

- [ ] **Step 3: Document secret setup and recovery**

Add local and Cloudflare instructions:

```powershell
node scripts/generate-auth-secret.mjs
$env:AI_CREDENTIALS_MASTER_KEY='<generated 32-byte-or-longer Base64URL value>'
npx wrangler secret put AI_CREDENTIALS_MASTER_KEY --env preview
npx wrangler secret put AI_CREDENTIALS_MASTER_KEY --env production
```

Document that losing this Secret makes stored credentials undecryptable, backups must not contain the master key, and key rotation requires a forward re-encryption migration before replacing the old Secret.

- [ ] **Step 4: Run final gates and commit**

Run: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`, and `git diff --check`.

Commit: `git commit -m "test: verify per-user AI credential isolation"`
