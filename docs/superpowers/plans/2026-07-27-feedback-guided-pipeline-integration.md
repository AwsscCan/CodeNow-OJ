# Feedback-Guided Pipeline Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the problem page opt into validated-reference and mutant-guided test selection while retaining the current generation path as a lossless fallback.

**Architecture:** A reference resolver owns cache lookup, candidate generation, validation, and cache population. Validated references carry an optional bounded mutant pool. The generation pipeline over-generates a small candidate pool only when usable mutants exist, computes the kill matrix through the existing Judge0 runner, and applies the tested greedy selector. The API route uses dependency injection for observable orchestration tests, and the page explicitly requests feedback mode.

**Tech Stack:** TypeScript 5.9, Next.js route handlers, React 19, Vitest 4, Judge0, existing reference and generation modules.

## Global Constraints

- Strict RED-GREEN-REFACTOR for every production behavior.
- Do not modify database schema, migrations, repositories, test-case save APIs, submissions, folders, drafts, or conversations.
- `qualityMode !== "feedback"` preserves current fast behavior and request count.
- Reference construction, validation, mutant execution, or selection failure must preserve the pre-feedback generated candidates.
- Mutants are optional, capped at 8, source-deduplicated, statically checked, and never persisted.
- Feedback mode may verify at most `target + min(6, max(2, ceil(target / 3)))` candidates, capped at 50.

---

### Task 1: Carry a bounded mutant pool with validated references

**Files:**
- Modify: `app/api/_lib/reference-solution.ts`
- Modify: `tests/unit/reference-solution.test.ts`

- [x] Write a failing parser test proving `generateReferenceCandidate` retains at most 8 unique `{id, sourceCode}` mutants and drops blank/duplicate entries.
- [x] Run `npx vitest run tests/unit/reference-solution.test.ts` and confirm RED because `mutants` is absent.
- [x] Add optional `mutants: MutantSource[]` to `ReferenceCandidate` and `ValidatedReference`; extend the prompt schema and parser; pass the bounded array through every validated result.
- [x] Re-run the focused test and confirm GREEN.

### Task 2: Resolve and cache validated references with fallback

**Files:**
- Create: `app/api/_lib/reference-resolution.ts`
- Create: `tests/unit/reference-resolution.test.ts`

**Interface:**

```ts
export async function resolveValidatedReference(options: {
  apiKey: string;
  endpoint: string;
  model: string;
  problemDigest: string;
  samples: Array<{ input: string; output: string }>;
}, dependencies?: ReferenceResolutionDependencies): Promise<{
  validatedRef?: ValidatedReference;
  status: { ok: boolean; cached: boolean; message: string };
}>;
```

- [x] Write failing tests for cache hit, cache miss followed by successful validation/cache write, and generation/validation failure returning `{ok:false}` without throwing.
- [x] Verify RED from the missing module.
- [x] Implement the minimal resolver with injectable functions defaulting to the existing reference APIs.
- [x] Verify focused GREEN and lint.

### Task 3: Orchestrate feedback mode in the API route

**Files:**
- Modify: `app/api/generate-tests/route.ts`
- Modify: `tests/unit/generate-tests-api.test.ts`

- [x] Write a failing route test through `createGenerateTestsHandler(dependencies)`: feedback mode resolves a reference and passes it to generation; resolver failure still calls generation without a reference; fast mode never calls the resolver.
- [x] Verify RED because the route factory and quality-mode behavior do not exist.
- [x] Export a dependency-injected handler factory, preserve `POST` with production defaults, and add `qualityMode` parsing.
- [x] Verify all route tests GREEN.

### Task 4: Apply mutant feedback to an over-generated verified pool

**Files:**
- Modify: `app/api/_lib/test-generation-pipeline.ts`
- Modify: `tests/unit/test-generation-pipeline.test.ts`

- [x] Write a failing pipeline test with a validated reference, four candidates, and two mutants where the mutation-aware optimal quota-compatible pair differs from stable quota selection.
- [x] Verify RED because the report lacks mutation feedback and selection remains unchanged.
- [x] Add optional mutation report fields, bounded quality-pool verification, `evaluateMutantFeedback`, and `selectMutationEffectiveTests`. Catch feedback errors, warn, and retain ordinary quota selection.
- [x] Verify focused GREEN and existing generation regression tests.

### Task 5: Enable feedback mode from the problem page

**Files:**
- Modify: `app/problem/[id]/page.tsx`
- Modify: `tests/unit/problem-workspace-ui.test.tsx`

- [x] Write a failing UI test that inspects the `/api/generate-tests` request and expects `qualityMode: "feedback"` while existing samples remain appended, not replaced.
- [x] Add the one request field and optional mutation report typing; do not change persistence behavior.
- [x] Verify UI GREEN.

### Task 6: Full verification

- [x] Run focused reference, resolver, route, pipeline, quality, mutant, UI, and repository tests.
- [x] Run scoped ESLint and `git diff --check`.
- [x] Run `npm test`; report build warnings separately from failures.
