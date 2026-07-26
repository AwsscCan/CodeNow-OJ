# Cloudflare Private Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the invitation-only administrator system to isolated Cloudflare preview and production Workers with D1, backups, secrets, and enforced release gates.

**Architecture:** `wrangler.jsonc` defines distinct preview and production environments and D1 bindings. PowerShell-compatible release scripts validate authentication, back up D1, apply Drizzle migrations, deploy preview, run smoke tests, then promote production only after every preview check passes.

**Tech Stack:** Wrangler 4, Cloudflare Workers, D1, vinext, Drizzle migrations, Node.js scripts, Playwright

---

### Task 1: Add a safe Cloudflare configuration validator

**Files:**
- Modify: `.gitignore`
- Create: `scripts/validate-cloudflare-config.mjs`
- Create: `tests/unit/cloudflare-config.test.ts`

- [x] Write a failing unit test that passes sample JSON to `validateCloudflareConfig` and requires `env.preview` and `env.production`, different Worker names, different non-empty D1 IDs, `migrations_dir: "drizzle"`, `workers_dev: true`, and no inline secrets.
- [x] Run `npm run test:unit -- tests/unit/cloudflare-config.test.ts`; expect the validator export to be missing.
- [x] Implement the pure validator and ignore `.dev.vars`, `backups/`, and `.wrangler/` without creating deployment configuration before real database IDs exist.
- [x] Run the focused test; expect PASS.
- [ ] Commit with `git commit -m "ops: validate isolated Cloudflare environments"`.

### Task 2: Create preview and production D1 databases

**Files:**
- Create: `wrangler.jsonc` with returned database IDs
- Modify: `docs/auth-operations.md`

- [ ] Run `npx wrangler whoami`; if unauthenticated, run `npx wrangler login` and complete the official browser authorization.
- [ ] Run `npx wrangler d1 create codenow-oj-preview` and `npx wrangler d1 create codenow-oj-production`.
- [ ] Create the complete configuration with binding `DB`, the exact returned IDs under their matching environments, `migrations_dir: "drizzle"`, `workers_dev: true`, and distinct Worker names; run the validator against the real file.
- [ ] Run `npx wrangler deploy --dry-run --env preview` and `--env production`; expect both to succeed without deployment.
- [ ] Document database names, bindings, backup commands, and recovery order without recording account tokens.
- [ ] Commit with `git commit -m "ops: provision isolated D1 databases"`.

### Task 3: Configure secrets without exposing them

**Files:**
- Create: `scripts/generate-auth-secret.mjs`
- Modify: `docs/auth-operations.md`

- [x] Test that the generator emits at least 32 random bytes and never writes a file.
- [ ] Set distinct `BETTER_AUTH_SECRET` and `ADMIN_BOOTSTRAP_TOKEN` values with `npx wrangler secret put <NAME> --env preview` and `--env production`.
- [ ] Set `BETTER_AUTH_URL` and `INVITE_ONLY=1` as environment variables in `wrangler.jsonc`; omit `RESEND_API_KEY` and `AUTH_EMAIL_FROM` while no domain exists.
- [ ] Run `npx wrangler secret list` for each environment and verify only secret names are displayed.
- [ ] Commit documentation and generator with `git commit -m "ops: secure private release secrets"`.

### Task 4: Add guarded migration, backup, and deployment scripts

**Files:**
- Create: `scripts/release-cloudflare.mjs`
- Create: `tests/unit/release-gates.test.ts`
- Modify: `package.json`

- [x] Write failing tests with a fake command runner proving preview failure prevents production commands, backups precede migrations, and production requires successful preview smoke output.
- [x] Implement `release:preview` and `release:production` scripts using argument arrays rather than shell-built strings. Store backups under ignored `backups/` and stop on every non-zero exit.
- [x] Verify RED then GREEN with `npm run test:unit -- tests/unit/release-gates.test.ts`.
- [ ] Commit with `git commit -m "ops: gate Cloudflare database releases"`.

### Task 5: Deploy preview and run acceptance tests

**Files:**
- Create: `tests/e2e/cloudflare-preview.spec.ts`
- Modify: `docs/auth-operations.md`

- [ ] Export preview D1, apply all migrations with `npx wrangler d1 migrations apply DB --remote --env preview`, and deploy with `npx wrangler deploy --env preview`.
- [ ] Bootstrap `700whitebird007@gmail.com` in preview and capture its one-time password outside Git.
- [ ] Run browser checks for administrator first-password change, invited friend lifecycle, role isolation, bans, soft delete/restore, `Secure`/`HttpOnly`/`SameSite` Cookie flags, private/no-store headers, and public-registration `404`.
- [ ] Record only PASS/FAIL, Worker version, migration number, and opaque IDs in the operations checklist.
- [ ] Commit with `git commit -m "test: verify Cloudflare preview release"`.

### Task 6: Promote production automatically after preview gates

**Files:**
- Modify: `docs/auth-operations.md`

- [ ] Confirm the preview acceptance record is complete and the worktree is clean.
- [ ] Export production D1 before migration.
- [ ] Apply production migrations, deploy `--env production`, and bootstrap the same administrator email.
- [ ] Run read-only public smoke checks plus administrator login, Cookie, no-store, invite-only, ban, and Session revocation checks.
- [ ] If a Worker check fails, redeploy the prior Worker version; do not reverse D1 migrations and retain the backup for a forward fix.
- [ ] Record the final `workers.dev` URL and commit with `git commit -m "ops: release private CodeNow OJ"`.
