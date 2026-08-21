# Mutation Quality Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, quota-preserving greedy selector that ranks newly generated tests by the incorrect solutions they kill without reading or writing stored data.

**Architecture:** A new pure TypeScript module consumes `GeneratedTest[]` and a precomputed candidate-mutant outcome matrix. It excludes invalid mutants, reserves category quotas using marginal mutation kills, fills remaining slots by greedy set cover, and falls back to stable input order. The module has no database, network, filesystem, Judge0, or model dependencies.

**Tech Stack:** TypeScript 5.9, Vitest 4, existing `GeneratedTest` type from `complexity-tests.ts`.

## Global Constraints

- No production code is written before its focused test has failed for the expected missing-behavior reason.
- Do not modify `db/schema.ts`, migrations, repositories, routes, or stored test cases.
- Do not delete, replace, reorder, or mutate the caller's candidate array.
- Invalid mutants are excluded from both numerator and denominator.
- Selection and tie-breaking are deterministic and use original candidate order.
- Targets are clamped to `0..candidates.length`; category quotas are non-negative integer minimums.

---

### Task 1: Mutation-aware greedy selection

**Files:**
- Create: `app/api/_lib/test-quality-selection.ts`
- Create: `tests/unit/test-quality-selection.test.ts`

**Interfaces:**
- Consumes: `GeneratedTest[]`, `CandidateMutationResult[]`, target count, and a category quota record.
- Produces: `selectMutationEffectiveTests(candidates, outcomes, target, categoryQuota)` returning selected tests and a `QualitySelectionReport`.

- [x] **Step 1: Write the failing behavior tests**

Create `tests/unit/test-quality-selection.test.ts` with hand-derived matrices covering:

```ts
it("selects quota-compatible tests with the largest new mutant coverage", () => {
  const candidates = [
    test("A", "boundary"),
    test("B", "boundary"),
    test("C", "ordinary"),
    test("D", "ordinary"),
  ];
  const outcomes = [
    killed(0, "m1"),
    killed(1, "m1"), killed(1, "m2"),
    killed(2, "m2"),
    killed(3, "m3"),
  ];

  const result = selectMutationEffectiveTests(candidates, outcomes, 2, {
    boundary: 1, ordinary: 1,
  });

  expect(result.report.selectedIndexes).toEqual([1, 3]);
  expect(result.report.killedMutants).toBe(3);
  expect(result.report.mutationScore).toBe(1);
});
```

Add separate tests proving invalid-mutant exclusion, original-order tie breaking, stable fallback when no outcomes exist, target clamping, and input immutability. Each test names the production mutation it catches.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/unit/test-quality-selection.test.ts
```

Expected: FAIL because `app/api/_lib/test-quality-selection.ts` does not exist. The failure must be a missing-module error, not a fixture or syntax error.

- [x] **Step 3: Add the minimal public types and selector**

Create `app/api/_lib/test-quality-selection.ts` with these public contracts:

```ts
import type { GeneratedTest } from "./complexity-tests";

export type MutationOutcome = "survived" | "killed" | "invalid_mutant";

export type CandidateMutationResult = {
  candidateIndex: number;
  mutantId: string;
  outcome: MutationOutcome;
};

export type QualitySelectionReport = {
  usableMutants: number;
  killedMutants: number;
  mutationScore: number;
  selectedIndexes: number[];
  redundantIndexes: number[];
};

export function selectMutationEffectiveTests(
  candidates: GeneratedTest[],
  outcomes: CandidateMutationResult[],
  target: number,
  categoryQuota: Record<string, number>,
): { tests: GeneratedTest[]; report: QualitySelectionReport };
```

Normalize outcomes into `Map<number, Set<string>>`. A mutant is invalid if any of its rows is `invalid_mutant`; remove it from every candidate's kill set. Ignore rows with unknown candidate indexes or empty mutant IDs.

For each quota category, repeatedly choose an unselected candidate in that category with the highest number of not-yet-covered usable mutants. Then fill remaining slots from all candidates using the same marginal score. Resolve ties by the lower original index. When every marginal score is zero, this naturally becomes stable original order.

Return selected tests in selection order. `redundantIndexes` is every unselected original index in ascending order. Derive `mutationScore` from unique killed usable mutants, returning `0` when the denominator is zero.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run tests/unit/test-quality-selection.test.ts
```

Expected: all tests PASS with no warnings.

- [x] **Step 5: Refactor only while green**

Extract only small private helpers needed to remove duplicated candidate ranking. Do not add Judge0, model calls, persistence, or generator support.

- [x] **Step 6: Run adjacent generation regression tests**

Run:

```bash
npx vitest run tests/unit/test-quality-selection.test.ts tests/unit/test-generation-pipeline.test.ts tests/unit/generate-tests-api.test.ts tests/unit/problem-repository.test.ts
```

Expected: all tests PASS. The repository regression confirms the new module did not alter stored-test replacement behavior.

- [x] **Step 7: Verify static quality**

Run:

```bash
npx eslint app/api/_lib/test-quality-selection.ts tests/unit/test-quality-selection.test.ts
git diff --check
```

Expected: both commands exit successfully.

## Plan Self-Review

- Spec coverage: deterministic greedy selection, quota reservation, invalid-mutant exclusion, stable fallback, bounded target, report fields, and immutability are covered.
- Scope boundary: Judge0 execution, mutant generation, pipeline integration, and testlib artifacts remain separate follow-up plans as required by the design.
- Type consistency: contract names and fields exactly match the design document.
- Data safety: no schema, repository, route, import, or persistence file is modified.
