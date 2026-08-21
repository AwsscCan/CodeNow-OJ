# Mutant Execution Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert bounded incorrect-solution executions into the typed kill matrix consumed by the mutation quality kernel.

**Architecture:** A new adapter accepts generated candidates, mutant C++ sources, a language ID, and an injected Judge0-compatible runner. It rejects unsafe or compile-failing mutants, executes usable mutants with bounded concurrency, normalizes stdout, and emits deterministic `CandidateMutationResult[]` without persistence.

**Tech Stack:** TypeScript 5.9, Vitest 4, existing `staticCheck` policy and `GeneratedTest` type.

## Global Constraints

- Strict RED-GREEN-REFACTOR for every behavior.
- Maximum 8 distinct mutants and 50 candidates, therefore at most 400 scored executions.
- Do not write to the database, filesystem, cache, routes, or candidate objects.
- Runner exceptions propagate so the future pipeline adapter can preserve its pre-feedback candidate selection.
- Unsafe and compile-failing mutants produce `invalid_mutant` and are excluded from scoring.
- Runtime failure, timeout, and wrong stdout produce `killed`; normalized equal stdout produces `survived`.

---

### Task 1: Build the execution adapter

**Files:**
- Create: `app/api/_lib/mutant-feedback.ts`
- Create: `tests/unit/mutant-feedback.test.ts`

**Interfaces:**
- Consumes: `GeneratedTest[]`, `MutantSource[]`, numeric C++ language ID, and `MutantRunner`.
- Produces: `evaluateMutantFeedback(options): Promise<CandidateMutationResult[]>`.

- [x] **Step 1: Write failing tests**

Use a deterministic in-memory runner and literal expected matrices. Cover safe wrong/equal mutants, unsafe source, compile failure, runtime failure, whitespace-normalized output, duplicate mutant source removal, pool limits, and caller-input immutability.

- [x] **Step 2: Verify RED**

Run `npx vitest run tests/unit/mutant-feedback.test.ts` and confirm it fails only because `mutant-feedback.ts` is missing.

- [x] **Step 3: Implement the minimal adapter**

Expose:

```ts
export type MutantSource = { id: string; sourceCode: string };
export type MutantRunResult = {
  accepted: boolean;
  stdout: string;
  compileError: string;
  statusId: number;
};
export type MutantRunner = (sourceCode: string, input: string, languageId: number) => Promise<MutantRunResult>;
export async function evaluateMutantFeedback(options: {
  candidates: GeneratedTest[];
  mutants: MutantSource[];
  languageId: number;
  run: MutantRunner;
  concurrency?: number;
}): Promise<CandidateMutationResult[]>;
```

Deduplicate trimmed non-empty IDs and source code, retaining first occurrence, then cap at 8. Cap candidates at 50. Mark statically unsafe mutants invalid without calling the runner. Compile-probe remaining sources using empty stdin; any non-empty `compileError` is invalid. Evaluate the Cartesian product of usable mutants and candidates with a worker pool clamped to `1..8`. Normalize CRLF, trailing line whitespace, and final blank lines before output comparison.

- [x] **Step 4: Verify GREEN and refactor**

Run `npx vitest run tests/unit/mutant-feedback.test.ts tests/unit/test-quality-selection.test.ts`. Extract only concurrency and output normalization helpers while tests remain green.

- [x] **Step 5: Run static checks**

Run `npx eslint app/api/_lib/mutant-feedback.ts tests/unit/mutant-feedback.test.ts` and `git diff --check`.
