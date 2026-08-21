# Feedback-Guided Test Generation Design

## Objective

Improve CodeNow's AI test generation by combining four proven ideas:

1. testlib-style reusable generators and deterministic commands;
2. CodeNow's validated efficient/brute reference pair as the output oracle;
3. CodeContests-O-style feedback from deliberately incorrect solutions;
4. EvalPlus-style mutation scoring and greedy test-suite reduction.

The system must never delete or overwrite stored problems, test cases, code drafts, submissions, conversations, or folder relationships as part of generation or quality evaluation.

## Scope And Delivery Order

This is delivered as independently testable stages because generator execution and mutant execution have different failure modes.

### Stage 1: Quality kernel

Add a framework-independent module that consumes candidate tests and mutant execution outcomes. It computes which mutants each test kills, assigns deterministic quality scores, and chooses a bounded suite with greedy set cover while preserving category quotas and stable input order.

### Stage 2: Mutant execution feedback

Run a bounded pool of compiled incorrect C++ solutions against in-memory candidates through Judge0. A candidate kills a mutant when the mutant fails to compile, times out, crashes, or returns output different from the validated reference. Compile-failing mutants are excluded because they do not distinguish tests.

### Stage 3: Mutant generation

Ask the configured model for a small pool of plausible wrong solutions based on the problem profile and rejected algorithms. Apply the existing C++ static safety check, compile validation, deduplication, source-size limits, and a hard pool limit before execution. Failure to obtain usable mutants degrades to the current category/quota selection.

### Stage 4: testlib generator artifacts

Generate a testlib-compatible C++ generator plus a bounded list of deterministic commands. Validate the generator source, compile it in the sandbox, execute only allowlisted commands with fixed seeds and limits, parse stdout as candidate input, then run the validated reference to obtain expected output. Direct structured AI generation remains the fallback.

## Considered Approaches

### A. Port CodeContests-O as a separate service

This offers the closest research implementation but brings Python, SandboxFusion assumptions, unsafe resume logic, and a second orchestration stack. It would duplicate CodeNow's validated reference and Judge0 clients. Rejected because operational cost and data-flow ambiguity outweigh reuse.

### B. Put every feedback step inside `test-generation-pipeline.ts`

This is the smallest file-count change, but the existing pipeline already owns prompting, parsing, repair, quotas, verification, and retries. Adding mutation and generator execution there would make failures hard to isolate and tests highly coupled. Rejected.

### C. Add isolated quality and execution modules, then integrate incrementally

Recommended. Pure selection logic can be exhaustively tested without network calls. Judge0 and model boundaries remain adapters. Each stage has an explicit fallback, so quality enhancement cannot turn a usable candidate set into zero tests.

## Architecture

### Existing integration gap

The repository defines `generateReferenceCandidate`, `validateReference`, and `setCachedReference`, but no production caller currently creates and stores a validated reference. Both generation routes only read `getCachedReference`, so ordinary requests remain on direct AI input/output generation. Before pipeline mutation feedback can be enabled, a route-level TDD stage must create, validate, and cache the reference with a bounded fallback that preserves current generation when reference construction fails.

```text
structured AI candidates or testlib generator outputs
                       |
                       v
             input validation + dedup
                       |
                       v
        validated reference computes expected output
                       |
                       v
        bounded mutant pool runs through Judge0
                       |
                       v
             candidate x mutant kill matrix
                       |
                       v
     quota-preserving greedy set-cover selection
                       |
                       v
       response only; existing UI append/save flow
```

The quality kernel has no database, HTTP, environment, or filesystem dependencies. Execution adapters receive explicit inputs and return typed results. The orchestration layer can abandon a failed quality pass and return the already verified candidates unchanged.

## Core Contracts

`app/api/_lib/test-quality-selection.ts` owns:

```ts
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
  categoryQuota: Record<Category, number>,
): { tests: GeneratedTest[]; report: QualitySelectionReport };
```

Selection is deterministic. It first reserves quota coverage, choosing the candidate in each missing category that kills the most not-yet-killed mutants. It then repeatedly chooses the remaining candidate with the largest marginal mutant kill count. Ties use original candidate order. If mutation data cannot fill the target, the remaining slots use the existing stable order. No candidate is mutated.

`app/api/_lib/mutant-feedback.ts` later owns execution orchestration and accepts an injected runner so tests exercise real selection behavior without mocking the quality kernel.

## Data Safety

- Generation endpoints remain read-only with respect to the database.
- No schema migration is required for Stages 1-3.
- Existing samples are exclusion fingerprints and prompt context; they are never candidates for deletion.
- Quality reduction applies only to the newly generated in-memory candidate pool.
- A quality-stage exception returns the pre-quality verified candidates and a warning.
- The final client save retains the existing optimistic version and transaction behavior.
- Submission rows, drafts, conversations, folders, and problem rows are outside this feature's write surface.
- testlib artifacts, when added, are ephemeral or cache-only. They are never stored by replacing test cases.

## Limits And Failure Handling

- At most 8 usable mutants per request.
- At most 50 candidate tests and 400 candidate-mutant executions.
- Judge0 concurrency remains bounded by the existing batch/client limits.
- Compile-failing or unsafe mutants are marked `invalid_mutant` and excluded from the denominator.
- A mutant that times out, crashes, or disagrees with the reference is killed by that candidate.
- Network failure, timeout, malformed model output, or zero usable mutants preserves existing quota selection.
- Mutation score is `killed usable mutants / usable mutants`; with zero usable mutants it is `0`, not `NaN` and not a quality claim.

## Reporting

`GenerationReport` will gain optional mutation fields so older consumers remain compatible:

```ts
mutation?: {
  attempted: boolean;
  usableMutants: number;
  killedMutants: number;
  score: number;
  reducedCandidates: number;
};
```

`qualityOk` continues to require exact count, complete outputs, satisfied category quotas, and honest reference verification. Mutation score is initially diagnostic and ranking input; it does not make an unverified suite high quality.

## Test Strategy

1. Pure unit tests prove deterministic greedy selection, quota preservation, invalid-mutant exclusion, stable ties, fallback filling, and immutability.
2. Adapter tests prove compile failures are excluded while wrong output, runtime error, and timeout kill mutants.
3. Pipeline tests prove quality feedback changes candidate choice only when a validated reference and usable mutants exist.
4. Regression tests prove existing samples remain unchanged and zero usable mutants return the previous selection.
5. Repository tests continue proving failed test-case replacement transactions preserve prior test rows; this feature does not call replacement APIs.

## Success Criteria

- Every production behavior is introduced by a failing test observed before implementation.
- Given a hand-checked kill matrix, selected tests kill the maximum reachable mutants for the bounded greedy strategy while satisfying quotas.
- Quality evaluation failure never reduces the number of usable generated tests.
- No database migration or destructive write is introduced.
- Existing generation, problem repository, submission persistence, and UI append tests remain green.
