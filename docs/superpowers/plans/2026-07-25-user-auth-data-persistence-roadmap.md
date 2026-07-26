# User Authentication and Data Persistence Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver verified email/password accounts and secure cross-device persistence for all approved CodeNow OJ user data.

**Architecture:** Work is split into four independently testable plans. Authentication establishes the identity boundary first; cloud problem storage builds on it; local migration adds safe onboarding and recovery; preferences/AI sync finishes the approved data scope and release hardening.

**Tech Stack:** vinext/Next, TypeScript, Better Auth, Resend, Drizzle ORM, Cloudflare D1, Zustand, Vitest

---

## Required execution order

- [x] **Plan 1 — Authentication foundation:** Execute `docs/superpowers/plans/2026-07-25-user-auth-foundation.md`. Exit gate: verified registration/login/reset works in vinext and Cloudflare build; submissions are isolated by user.
- [x] **Plan 2 — Cloud problem data:** Execute `docs/superpowers/plans/2026-07-25-cloud-problem-data.md`. Exit gate: folders, private problems, test cases, and drafts persist cross-device with `409` conflict detection.
- [ ] **Plan 3 — Local migration and recovery:** Execute `docs/superpowers/plans/2026-07-25-local-data-migration-and-conflicts.md`. Exit gate: guest data imports idempotently and unsynced edits survive offline/session failures.
- [ ] **Plan 4 — Preferences, AI sync, release:** Execute `docs/superpowers/plans/2026-07-25-preferences-ai-sync-and-release.md`. Exit gate: approved non-secret data syncs, two-user E2E isolation passes, and preview deployment is signed off.

Do not begin a later plan until the previous plan's phase gate passes. In particular, a Better Auth/vinext/Worker incompatibility in Plan 1 stops the entire roadmap and triggers the fallback evaluation required by the approved design.

## Whole-program definition of done

- [ ] Registration, verification, login, logout, forgot/reset password, and Session revocation pass automated and preview tests.
- [ ] Every private API has anonymous, owner, and cross-user tests.
- [ ] Problems and test cases created on one device restore on a second device.
- [ ] Guest migration is previewable, idempotent, conflict-aware, and never deletes data before server confirmation.
- [ ] AI API keys never appear in cloud payloads, database schema, logs, or test artifacts.
- [ ] `npm run lint`, `npm test`, `npm run test:e2e`, and `npm run build` all pass.
