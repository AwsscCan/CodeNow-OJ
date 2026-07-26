# Private Administrator and Invitation System Design

## Goal

Operate CodeNow OJ as an invitation-only site for the owner and a small group of trusted friends. The same administrator identity works in persistent local development, Cloudflare preview, and Cloudflare production environments. Public registration and general-purpose outbound email remain disabled until a custom sending domain is available.

## Identity and account lifecycle

- Users have exactly one role: `user` or `admin`; new users default to `user`.
- The initial administrator email is `700whitebird007@gmail.com` and is marked verified when bootstrapped.
- A bootstrap command creates the first administrator idempotently. Re-running it never changes an existing password or silently promotes another account.
- Administrators create invited users through the admin interface. The server generates a high-entropy temporary password and returns it exactly once.
- Invited users must replace the temporary password on first login. Completing the change revokes every other Session.
- Public sign-up, verification-email resend, and self-service password reset are disabled while the site has no verified sending domain.
- An administrator may generate a new temporary password for a user. The old password and all active Sessions become invalid immediately.

Passwords and temporary credentials are never stored in plaintext, logged, returned by list APIs, written to audit metadata, or committed to Git.

## Authorization model

- Every admin page and API resolves the authenticated Session server-side and checks `role === "admin"`.
- Unauthorized and non-admin callers receive `404`, including for existing targets.
- Administrators may list users, inspect user-owned problems, test cases, drafts, submissions, preferences, and AI conversations, ban or unban users, revoke Sessions, create invitations, reset passwords, and soft-delete or restore content.
- Administrators cannot permanently delete user data through the web interface.
- The last active administrator cannot be demoted or banned.
- Banned users lose all Sessions immediately and cannot create a new Session until unbanned.
- Admin APIs remain protected by the existing rate limiting, private/no-store cache policy, request IDs, and structured-event redaction.

## Data model

Extend `user` with:

- `role`: `user | admin`, default `user`.
- `status`: `active | banned`, default `active`.
- `must_change_password`: boolean, default false.
- `ban_reason`: nullable short text.
- `banned_at`: nullable timestamp.

Add `admin_audit_logs` with an immutable identifier, administrator user ID, action enum, target type, opaque target ID, request ID, timestamp, and small redacted metadata JSON. The table must never contain passwords, tokens, email addresses, source code, test data, problem text, or conversation content.

Existing resources that already support soft deletion retain that behavior. Resources without a deletion marker receive a minimal `deleted_at` field only when required by the admin content workflow. Normal user repositories continue filtering deleted data.

## Components

### Admin authorization service

Provides `requireAdmin(request)` and last-admin invariants. It is the only authorization entry point used by admin routes.

### Account administration service

Creates invitation accounts, changes roles, bans/unbans accounts, revokes Sessions, and resets temporary passwords through Better Auth-compatible password hashing and account records. It owns transaction boundaries and audit writes.

### Content administration service

Lists private resources with pagination and soft-deletes or restores them. List responses return only the fields required by the selected admin view; detailed content is fetched explicitly.

### Admin interface

The `/admin` application contains an overview, user list/detail, content inspection, and audit history. Destructive actions require confirmation. Temporary passwords are shown in a one-time result panel and are not recoverable after dismissal.

### Bootstrap CLI

Accepts an environment target and administrator email. It generates a temporary password unless one is supplied through protected standard input. Local mode uses the persistent development SQLite database; preview and production modes use their respective D1 databases. Output contains the temporary password only after a successful transaction.

## Persistence and Cloudflare environments

- Local authentication uses an ignored persistent SQLite file instead of an in-memory database.
- `wrangler.jsonc` defines separate preview and production Workers and D1 bindings.
- Database IDs and non-secret deployment settings live in configuration; authentication secrets live in Wrangler Secrets.
- Preview and production never share a D1 database or authentication secret.
- The public address may use `workers.dev`; a custom domain is not required.
- Cloudflare deployment requires one interactive Wrangler login by the owner.

## Deployment pipeline

1. Generate and inspect migrations.
2. Run local migrations, bootstrap the local administrator, and execute all automated tests.
3. Back up preview D1, apply migrations, deploy preview, and bootstrap the preview administrator.
4. Run invitation, first-password-change, authorization, ban/unban, content moderation, Cookie, and no-store smoke tests.
5. Only if every preview gate passes, back up production D1, apply migrations, deploy production, and bootstrap the production administrator.
6. Run production read-only smoke tests plus an administrator login test, then report the site URL and one-time temporary password.

Any failed gate stops the pipeline before the next environment. D1 state is not rolled back by Worker version rollback, so database migrations use forward fixes and pre-migration backups.

## Error handling and security

- Duplicate invitations return a conflict without revealing whether an unrelated email exists to non-admin callers.
- Temporary-password generation uses cryptographically secure random bytes and meets the existing password limits.
- Admin write operations use transactions where database state and audit state must succeed together.
- Audit serialization uses an allowlist and rejects sensitive keys recursively.
- Content inspection responses use `Cache-Control: private, no-store`.
- Admin list endpoints use bounded cursor pagination and body-size limits.
- The bootstrap command refuses to run against an unknown target or a production target without an explicit production flag.

## Testing

Tests follow RED-GREEN-REFACTOR and cover:

- Schema defaults, constraints, indexes, migrations, and audit redaction.
- Anonymous, normal-user, and admin access for every admin route.
- Idempotent bootstrap, one-time temporary passwords, forced first password change, and Session revocation.
- Last-admin protection, ban/unban behavior, account isolation, and target ID swapping.
- Content list/detail, soft delete, restore, pagination, and no-store headers.
- Persistent local restart behavior.
- Two-user browser flows through the admin interface.
- Preview and production deployment gates without committing credentials or generated artifacts.

## Deliberate exclusions

- Public registration.
- Sending email to invited friends without a verified domain.
- Permanent data deletion from the admin interface.
- Billing, organizations, granular custom roles, impersonation, and bulk marketing email.
