# User Authentication Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add verified email/password accounts, secure sessions, password reset, real topbar identity, and user-isolated submission history.

**Architecture:** Better Auth owns credentials, verification tokens, and sessions through its Drizzle SQLite adapter. A request-aware database factory selects Cloudflare D1 in production and local SQLite in tests; Resend is behind a small mail interface. Every private route obtains the user from the server session and passes the immutable user ID into repositories.

**Tech Stack:** TypeScript, vinext/Next route handlers, Better Auth, Drizzle ORM, Cloudflare D1, better-sqlite3, Resend, Vitest

---

## File map

- Create `db/client.ts`: request/runtime-aware Drizzle database factory.
- Modify `db/schema.ts`: Better Auth tables and user-owned submissions.
- Replace `db/index.ts`: submission repository that requires `userId`.
- Create `app/lib/auth.ts`: Better Auth server factory and configuration.
- Create `app/lib/auth-client.ts`: browser Better Auth client.
- Create `app/lib/current-user.ts`: session-to-user guard.
- Create `app/lib/email.ts`: Resend and development mail adapters.
- Create `app/api/auth/[...all]/route.ts`: Better Auth route mount.
- Create `app/api/me/route.ts`: current user endpoint.
- Create `app/(auth)/*`: register, login, verification, forgot/reset password pages.
- Modify `app/components/topbar.tsx`: real anonymous/authenticated states.
- Modify `app/api/submissions/route.ts` and `app/hooks/use-judge.ts`: server-owned submission identity.
- Create/modify tests under `tests/unit/auth-*` and `tests/unit/submissions-api.test.ts`.

### Task 1: Prove Better Auth works in both local and Worker runtimes

**Files:**
- Modify: `package.json`
- Create: `app/lib/auth-compat.ts`
- Test: `tests/unit/auth-compat.test.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Install the pinned authentication dependencies**

Run:

```bash
npm install --save-exact better-auth @better-auth/drizzle-adapter resend
npm ls better-auth @better-auth/drizzle-adapter resend
```

Expected: npm resolves one compatible Better Auth release line, writes exact versions to `dependencies`, and `npm ls` shows no invalid peer dependency. Record the resolved versions in the commit message body so later tasks use that fixed lockfile.

- [ ] **Step 2: Write the failing compatibility test**

```ts
// tests/unit/auth-compat.test.ts
import { describe, expect, it } from "vitest";
import { createAuthOptions } from "../../app/lib/auth-compat";

describe("auth runtime compatibility", () => {
  it("creates edge-safe options without reading Node-only globals", () => {
    const options = createAuthOptions({
      baseURL: "http://localhost:3000",
      secret: "test-secret-at-least-32-characters",
    });
    expect(options.baseURL).toBe("http://localhost:3000");
    expect(options.emailAndPassword.requireEmailVerification).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test and verify the expected failure**

Run: `npm run test:unit -- tests/unit/auth-compat.test.ts`  
Expected: FAIL because `app/lib/auth-compat.ts` does not exist.

- [ ] **Step 4: Add the minimal runtime-neutral options and build probe**

```ts
// app/lib/auth-compat.ts
export function createAuthOptions(input: { baseURL: string; secret: string }) {
  return {
    baseURL: input.baseURL,
    secret: input.secret,
    emailAndPassword: {
      enabled: true as const,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
  };
}
```

Keep `compatibility_flags: ["nodejs_compat"]` in `vite.config.ts`; do not add a second runtime shim.

- [ ] **Step 5: Verify local tests and the Cloudflare production build**

Run: `npm run test:unit -- tests/unit/auth-compat.test.ts`  
Expected: PASS.  
Run: `npm run build`  
Expected: PASS without Node builtin or dynamic-eval errors from Better Auth.

- [ ] **Step 6: Commit the compatibility gate**

```bash
git add package.json package-lock.json vite.config.ts app/lib/auth-compat.ts tests/unit/auth-compat.test.ts
git commit -m "build: verify better auth worker compatibility"
```

If the build fails because Better Auth cannot execute in vinext/Workers, stop this plan and write `docs/superpowers/specs/2026-07-25-auth-compatibility-report.md` with the exact error and a recommendation for the external-auth fallback.

### Task 2: Add the request-aware database and authentication schema

**Files:**
- Create: `db/client.ts`
- Modify: `db/schema.ts`
- Create: `tests/unit/auth-schema.test.ts`
- Generate: `drizzle/0001_*.sql`

- [ ] **Step 1: Write a failing schema contract test**

```ts
// tests/unit/auth-schema.test.ts
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accounts, sessions, submissions, users, verifications } from "../../db/schema";

describe("authentication schema", () => {
  it("owns submissions and exposes every Better Auth table", () => {
    expect(getTableColumns(users)).toHaveProperty("emailVerified");
    expect(getTableColumns(sessions)).toHaveProperty("token");
    expect(getTableColumns(accounts)).toHaveProperty("password");
    expect(getTableColumns(verifications)).toHaveProperty("value");
    expect(getTableColumns(submissions)).toHaveProperty("userId");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test:unit -- tests/unit/auth-schema.test.ts`  
Expected: FAIL because the auth tables and `submissions.userId` do not exist.

- [ ] **Step 3: Define Better Auth tables and submission ownership**

In `db/schema.ts`, define `users`, `sessions`, `accounts`, and `verifications` with the exact field names required by the Better Auth version pinned in Task 1, then add this ownership contract:

```ts
export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  problemId: text("problem_id").notNull(),
  problemTitle: text("problem_title").notNull(),
  status: text("status").notNull(),
  passed: text("passed").notNull(),
  sourceCode: text("source_code").notNull(),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("submissions_user_problem_time_idx").on(table.userId, table.problemId, table.submittedAt)]);
```

Create `db/client.ts` with a `Database` type and two explicit factories: `createD1Db(binding)` using `drizzle-orm/d1`, and `createLocalDb(filename)` using `drizzle-orm/better-sqlite3`. Route code must receive a database instance; do not hide a global in-memory fallback.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate`  
Expected: one new migration containing the four Better Auth tables, `submissions.user_id`, its foreign key, and the composite index. Because existing submission rows have no owner, the migration must recreate or clear that table rather than assigning them to a real user.

- [ ] **Step 5: Run tests and build**

Run: `npm run test:unit -- tests/unit/auth-schema.test.ts`  
Expected: PASS.  
Run: `npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit the schema**

```bash
git add db/client.ts db/schema.ts drizzle tests/unit/auth-schema.test.ts
git commit -m "feat: add authentication database schema"
```

### Task 3: Implement verification and reset email delivery

**Files:**
- Create: `app/lib/email.ts`
- Test: `tests/unit/email.test.ts`

- [ ] **Step 1: Write failing adapter tests**

```ts
// tests/unit/email.test.ts
import { describe, expect, it, vi } from "vitest";
import { createEmailSender } from "../../app/lib/email";

describe("email sender", () => {
  it("uses the development sink without a Resend key", async () => {
    const sink = vi.fn();
    const send = createEmailSender({ environment: "development", sink });
    await send({ to: "dev@example.test", subject: "Verify", text: "http://localhost/verify" });
    expect(sink).toHaveBeenCalledWith(expect.stringContaining("http://localhost/verify"));
  });

  it("refuses the development sink in production", () => {
    expect(() => createEmailSender({ environment: "production", sink: vi.fn() }))
      .toThrow("RESEND_API_KEY");
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- tests/unit/email.test.ts`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the explicit adapter boundary**

```ts
// app/lib/email.ts
import { Resend } from "resend";

export type EmailMessage = { to: string; subject: string; text: string };
type Config = { environment: "development" | "test" | "production"; apiKey?: string; from?: string; sink?: (line: string) => void };

export function createEmailSender(config: Config) {
  if (!config.apiKey) {
    if (config.environment === "production") throw new Error("RESEND_API_KEY is required in production");
    return async (message: EmailMessage) => { (config.sink ?? console.info)(`[dev-email] ${message.to} ${message.subject} ${message.text}`); };
  }
  const resend = new Resend(config.apiKey);
  return async (message: EmailMessage) => {
    const result = await resend.emails.send({ from: config.from ?? "CodeNow <onboarding@resend.dev>", ...message });
    if (result.error) throw new Error(result.error.message);
  };
}
```

- [ ] **Step 4: Run the focused tests**

Run: `npm run test:unit -- tests/unit/email.test.ts`  
Expected: 2 tests PASS and no network request occurs.

- [ ] **Step 5: Commit**

```bash
git add app/lib/email.ts tests/unit/email.test.ts
git commit -m "feat: add verification email adapter"
```

### Task 4: Mount Better Auth and expose the current user

**Files:**
- Create: `app/lib/auth.ts`
- Create: `app/lib/current-user.ts`
- Create: `app/api/auth/[...all]/route.ts`
- Create: `app/api/me/route.ts`
- Test: `tests/unit/current-user.test.ts`

- [ ] **Step 1: Write failing current-user tests**

Create a test that injects `getSession`: with `null` it expects `requireUser()` to throw an `AuthRequiredError`; with `{ user: { id: "u1", email: "a@example.com", name: "A" } }` it returns that user. Keep the injected function signature `(headers: Headers) => Promise<Session | null>`.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- tests/unit/current-user.test.ts`  
Expected: FAIL because `current-user.ts` does not exist.

- [ ] **Step 3: Implement the auth factory and guards**

`app/lib/auth.ts` must call `betterAuth` with `drizzleAdapter(db, { provider: "sqlite", schema })`, the Task 1 options, verification email callback, reset email callback, and trusted same-origin URLs. Export a factory accepting `{ db, env, waitUntil }`; email callbacks pass their promises to `waitUntil` when it is available.

`app/lib/current-user.ts` exports:

```ts
export class AuthRequiredError extends Error {}
export type CurrentUser = { id: string; email: string; name: string };
export function createUserReader(getSession: (headers: Headers) => Promise<{ user: CurrentUser } | null>) {
  return {
    optional: async (headers: Headers) => (await getSession(headers))?.user ?? null,
    require: async (headers: Headers) => {
      const user = (await getSession(headers))?.user;
      if (!user) throw new AuthRequiredError("Authentication required");
      return user;
    },
  };
}
```

Mount `auth.handler` for both `GET` and `POST` in `app/api/auth/[...all]/route.ts`. `GET /api/me` returns `{ user: null }` anonymously and `{ user: { id, email, name } }` when authenticated; never return session tokens.

- [ ] **Step 4: Verify routes, cookies, and build**

Run: `npm run test:unit -- tests/unit/current-user.test.ts`  
Expected: PASS.  
Run: `npm run build`  
Expected: PASS and `/api/auth/[...all]` is present in build output.

- [ ] **Step 5: Manually smoke-test auth endpoints locally**

Run: `npm run dev`, then request `GET /api/auth/get-session`.  
Expected: an anonymous session response rather than 500, and a registration request prints a development verification URL.

- [ ] **Step 6: Commit**

```bash
git add app/lib/auth.ts app/lib/current-user.ts app/api/auth app/api/me tests/unit/current-user.test.ts
git commit -m "feat: mount email password authentication"
```

### Task 5: Add registration, login, verification, and password reset UI

**Files:**
- Create: `app/lib/auth-client.ts`
- Create: `app/(auth)/auth-form.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/register/page.tsx`
- Create: `app/(auth)/verify-email/page.tsx`
- Create: `app/(auth)/forgot-password/page.tsx`
- Create: `app/(auth)/reset-password/page.tsx`
- Modify: `app/globals.css`
- Test: `tests/rendered-html.test.mjs`

- [ ] **Step 1: Extend the rendered HTML test with auth-page assertions**

Assert that the production build contains the text labels `登录 CodeNow`, `创建账户`, `忘记密码`, and `重新设置密码` in the relevant rendered route payloads.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test`  
Expected: FAIL because the auth pages do not exist.

- [ ] **Step 3: Create the Better Auth client and accessible forms**

`app/lib/auth-client.ts` exports `createAuthClient({ baseURL: window.location.origin })` without embedding secrets. Use one `AuthForm` component for labelled inputs, field errors, disabled submit state, and a generic live-region error. Registration sends `name`, `email`, and `password`; login sends `rememberMe`; forgot password always shows the same success message; reset reads `token` from the URL and rejects a missing token before submission.

Use these fixed copy rules:

```ts
const GENERIC_REGISTER_RESULT = "如果该邮箱可以注册，我们已发送验证邮件。";
const GENERIC_RESET_RESULT = "如果该账户存在，我们已发送密码重置邮件。";
```

On successful login, only accept a same-origin relative `returnTo`; otherwise navigate to `/library`.

- [ ] **Step 4: Add focused auth styling**

Add `.auth-page`, `.auth-card`, `.auth-field`, `.auth-error`, and `.auth-success` styles to `app/globals.css`, reusing existing color variables and keeping labels visible. Do not restyle unrelated pages.

- [ ] **Step 5: Run tests and build**

Run: `npm test`  
Expected: all unit and rendered HTML tests PASS.  
Run: `npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/lib/auth-client.ts "app/(auth)" app/globals.css tests/rendered-html.test.mjs
git commit -m "feat: add account authentication pages"
```

### Task 6: Replace static identity in the topbar

**Files:**
- Create: `app/components/auth-status.tsx`
- Modify: `app/components/topbar.tsx`
- Modify: `app/page.tsx`
- Modify: `app/library/page.tsx`
- Modify: `app/problem/[id]/page.tsx`
- Test: `tests/unit/auth-status.test.tsx`

- [ ] **Step 1: Write component tests**

Mock the auth client session hook. Assert anonymous state renders `登录`; authenticated state renders the user name and `退出登录`; the avatar uses the first two visible characters of the name and falls back to the email prefix.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:unit -- tests/unit/auth-status.test.tsx`  
Expected: FAIL because `AuthStatus` does not exist. If DOM rendering support is missing, install `@testing-library/react` and `jsdom` as exact dev dependencies in this task.

- [ ] **Step 3: Implement `AuthStatus` and remove every hard-coded identity**

`AuthStatus` shows a login link with encoded `returnTo` when anonymous. When authenticated, it shows name/email and calls `authClient.signOut`, clears user-owned Zustand/query caches through a passed `onSignedOut` callback, then navigates to `/`. Replace all `LinR`, `LR`, `Lv.12`, and `1842` occurrences in the three pages and `Topbar`.

- [ ] **Step 4: Run focused and full tests**

Run: `npm run test:unit -- tests/unit/auth-status.test.tsx`  
Expected: PASS.  
Run: `rg -n "LinR|Lv\.12|1842" app`  
Expected: no matches.  
Run: `npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/auth-status.tsx app/components/topbar.tsx app/page.tsx app/library/page.tsx "app/problem/[id]/page.tsx" tests/unit/auth-status.test.tsx package.json package-lock.json
git commit -m "feat: show real account state in navigation"
```

### Task 7: Isolate submission history by authenticated user

**Files:**
- Replace: `db/index.ts`
- Modify: `app/api/submissions/route.ts`
- Modify: `app/hooks/use-judge.ts`
- Modify: `tests/unit/submissions-api.test.ts`

- [ ] **Step 1: Replace the current happy-path test with ownership tests**

Create three injected route contexts: anonymous, user A, user B. Assert anonymous POST/GET returns `401`; user A can create and list; user B cannot list or delete A's record; client-supplied `id`, `submittedAt`, or `userId` are ignored. Remove the rename-history assertion because submissions retain title/number snapshots.

- [ ] **Step 2: Run and verify failures**

Run: `npm run test:unit -- tests/unit/submissions-api.test.ts`  
Expected: FAIL because the route is anonymous and trusts client IDs/timestamps.

- [ ] **Step 3: Make repository ownership mandatory**

Export repository methods with these signatures:

```ts
listSubmissions(userId: string, problemId?: string, cursor?: string): Promise<SubmissionRecord[]>;
createSubmission(userId: string, input: NewSubmission): Promise<SubmissionRecord>;
getSubmission(userId: string, id: string): Promise<SubmissionRecord | null>;
deleteSubmission(userId: string, id: string): Promise<boolean>;
```

Every SQL predicate includes `eq(submissions.userId, userId)`. Generate `id = crypto.randomUUID()` and `submittedAt = new Date()` on the server. Remove bulk deletion by arbitrary problem IDs and submission renaming.

- [ ] **Step 4: Update API and client payloads**

`app/api/submissions/route.ts` obtains the user before accessing the repository and returns the unified `{ error: { code, message } }` shape. `use-judge.ts` sends only `problemId`, `problemTitle`, `status`, `passed`, and `sourceCode`; when anonymous, keep the submission in the existing in-memory client history and label it local-only rather than treating `401` as a judge failure.

- [ ] **Step 5: Run all regression checks**

Run: `npm run test:unit -- tests/unit/submissions-api.test.ts`  
Expected: PASS including cross-user cases.  
Run: `npm test`  
Expected: PASS.  
Run: `npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add db/index.ts app/api/submissions/route.ts app/hooks/use-judge.ts tests/unit/submissions-api.test.ts
git commit -m "feat: isolate submission history by user"
```

### Task 8: Harden and verify the complete authentication slice

**Files:**
- Modify: `db/schema.ts`
- Generate: `drizzle/0002_*.sql`
- Create: `app/server/security/auth-rate-limit.ts`
- Modify: `app/middleware.ts`
- Create: `tests/unit/auth-security.test.ts`
- Create: `docs/auth-operations.md`

- [ ] **Step 1: Write security regression tests**

Test malformed `Origin`, repeated registration/reset attempts, expired/replayed tokens through Better Auth's test client, production missing secrets, and that `/api/me` never exposes token/account/password fields.

- [ ] **Step 2: Run and verify at least one failure**

Run: `npm run test:unit -- tests/unit/auth-security.test.ts`  
Expected: FAIL until origin checks, rate limiting, and response filtering are connected.

- [ ] **Step 3: Add focused security configuration**

Keep the current CSP, add the deployed origin to Better Auth trusted origins, preserve `form-action 'self'`, and set auth responses to `Cache-Control: no-store`. Add `auth_rate_limits(key_hash, action, window_started_at, attempts, expires_at)` to D1 and implement atomic increment/check in `app/server/security/auth-rate-limit.ts`. Keys are SHA-256 hashes of normalized email or IP plus a server pepper; raw identifiers are never stored. Do not use the existing process-local Map for account endpoints.

- [ ] **Step 4: Document required secrets and local test flow**

`docs/auth-operations.md` must list `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, local no-key behavior, domain verification before public registration, migration apply commands, and Session revocation procedure. Never include real secret values.

- [ ] **Step 5: Run the phase gate**

Run: `npm run lint`  
Expected: PASS.  
Run: `npm test`  
Expected: PASS.  
Run: `npm run build`  
Expected: PASS.  
Perform a preview smoke test: register, inspect the development verification URL, verify, log in, create a submission, log out, and confirm the submission API returns `401`.

- [ ] **Step 6: Commit**

```bash
git add db/schema.ts drizzle app/server/security/auth-rate-limit.ts app/middleware.ts tests/unit/auth-security.test.ts docs/auth-operations.md
git commit -m "test: harden authentication and session flows"
```
