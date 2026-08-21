# Companion Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production slice of CodeNow OJ's companion learning loop across ten coordinated tasks plus a focused AI test-generation latency optimization.

**Architecture:** Put learning intelligence in small pure modules under `app/lib/learning/`, extend stores only where persistent user state is needed, and integrate into `app/problem/[id]/page.tsx` after lower layers are tested. AI features must have deterministic local fallbacks.

**Tech Stack:** Next.js/vinext, React 19, Zustand, Vitest/jsdom, existing AI chat route, existing Judge0 result and submission types.

---

## Coordination Rules

- Each task agent must use `superpowers:test-driven-development`.
- Each task agent must not ask the user; the main agent owns product judgment.
- Each task agent must keep edits within the write scope listed for that task.
- If a task needs a shared integration file, it should export a pure function/component first and report the required integration hook; the main agent will merge shared UI edits.
- Do not revert or overwrite existing uncommitted work.
- Do not add new dependencies unless the task explicitly needs them and no local solution is reasonable.
- Absolute data-safety gate: do not edit `public/problems/*`, `public/catalog-index.json`, `public/contest-problems.json`, `drizzle/*`, `.data/*`, or destructive persistence code unless your task explicitly names that file. Existing problems, test cases, submissions, drafts, notes, preferences, conversations, and localStorage payloads must remain readable.
- Never run destructive commands such as `git reset --hard`, `git checkout --`, recursive deletion, or generation scripts that overwrite bundled catalog data.

## Shared Types To Prefer

- `Problem`, `Result`, `SubmissionRecord`, `TestCase` from `app/stores/problem-store.ts`.
- `MemoryEntry`, `MemoryKind` from `app/stores/memory-store.ts`.
- `MascotLine`, `MascotPhase`, `MascotMood` from `app/stores/mascot-lines.ts`.

## Task 1: AI Review Report Kernel

**Reference:** `alibaba/open-code-review`, `vercel-labs/openreview`.

**Files:**
- Create: `app/lib/learning/review-report.ts`
- Test: `tests/unit/learning-review-report.test.ts`

- [ ] Write failing tests for `buildLocalReviewReport(problem, code, results, history)`:
  - WA includes first failed test index and avoids full solution text.
  - TLE highlights complexity as next step.
  - CE uses compiler diagnostic when available.
- [ ] Run: `npm run test:unit -- tests/unit/learning-review-report.test.ts`
  - Expected: fails because module does not exist.
- [ ] Implement minimal exported types:
  - `ReviewReport { diagnosis: string; firstFailedHint: string; nextStep: string; avoidGivingAnswer: true }`
  - `buildLocalReviewReport(...)`.
- [ ] Re-run the task test and report status.

## Task 2: Weakness Radar

**Reference:** CP Tracker, AlgoTrack, LeetCode tracker dashboards.

**Files:**
- Create: `app/lib/learning/weakness-radar.ts`
- Test: `tests/unit/weakness-radar.test.ts`

- [ ] Write failing tests for `buildWeaknessRadar(submissions, memories)`:
  - Counts WA/TLE/CE/RE from `SubmissionRecord.status`.
  - Extracts top risk categories from memory text.
  - Ranks problems with repeated failed submissions above one-off failures.
- [ ] Run targeted test and verify RED.
- [ ] Implement pure helpers without UI or storage changes.
- [ ] Re-run targeted test.

## Task 3: Desk Note Engine

**Reference:** `fiorastudio/buddy`, OpenPersona short companion feedback.

**Files:**
- Create: `app/lib/learning/desk-notes.ts`
- Test: `tests/unit/desk-notes.test.ts`

- [ ] Write failing tests for `pickDeskNote(event, context, recentNotes)`:
  - Long idle returns a gentle nudge.
  - WA with boundary memory returns a boundary note.
  - Recent note text is avoided.
- [ ] Run targeted test and verify RED.
- [ ] Implement deterministic note selection with injectable RNG.
- [ ] Re-run targeted test.

## Task 4: Risk Memory Classifier and Editable Memory Operations

**Reference:** MemPalace, OpenPersona, MemMachine.

**Files:**
- Modify: `app/stores/memory-store.ts`
- Test: `tests/unit/memory-store.test.ts`

- [ ] Add failing tests for:
  - `classifyRiskMemory(text)` returning `boundary`, `overflow`, `complexity`, `compile`, `runtime`, `output`, or `statement`.
  - Store actions `deleteMemory(id)`, `togglePinned(id)`, `toggleMuted(id)`.
  - `recentMemories()` excludes muted entries and pinned entries survive capacity trimming.
- [ ] Run targeted test and verify RED.
- [ ] Extend `MemoryEntry` with optional `pinned?: boolean`, `muted?: boolean`, `risk?: RiskKind`.
- [ ] Implement actions with migration-safe defaults.
- [ ] Re-run targeted test.

## Task 5: Counterexample Challenge Kernel

**Reference:** Hypothesis, fast-check, testlib.

**Files:**
- Create: `app/lib/learning/counterexample-challenge.ts`
- Test: `tests/unit/counterexample-challenge.test.ts`

- [ ] Write failing tests for `buildCounterexampleChallenge(problem, results)`:
  - Uses first WA result.
  - Produces compact input/expected/actual fields.
  - Returns a prompt asking the user to predict output before reading explanation.
- [ ] Run targeted test and verify RED.
- [ ] Implement pure function; do not invent unknown hidden tests.
- [ ] Re-run targeted test.

## Task 6: Hint Level Prompt Policy

**Reference:** learn-codebase, OATutor.

**Files:**
- Create: `app/api/_lib/hint-policy.ts`
- Modify: `app/api/chat/route.ts`
- Test: `tests/unit/chat-route.test.ts`

- [ ] Add failing chat route tests:
  - `hintLevel: "direction"` injects “do not provide code or pseudocode”.
  - `hintLevel: "pseudocode"` allows pseudocode but not full C++.
  - invalid hint level falls back to `observation`.
- [ ] Run targeted test and verify RED.
- [ ] Implement `normalizeHintLevel` and `buildHintPolicyPrompt`.
- [ ] Integrate into chat route system prompt.
- [ ] Re-run targeted test.

## Task 7: Self Explanation Check

**Reference:** learn-codebase, OATutor active recall.

**Files:**
- Create: `app/lib/learning/self-explanation.ts`
- Test: `tests/unit/self-explanation.test.ts`

- [ ] Write failing tests for `checkExplanationLocally(problem, explanation, knowledgeCard?)`:
  - Empty explanation asks a follow-up.
  - Explanation mentioning known tags/core terms is marked stronger.
  - Missing complexity produces a targeted follow-up.
- [ ] Run targeted test and verify RED.
- [ ] Implement local scoring only; AI endpoint integration is later.
- [ ] Re-run targeted test.

## Task 8: Problem Knowledge Card

**Reference:** USACO Guide, OI Wiki, cp-algorithms.

**Files:**
- Create: `app/lib/learning/knowledge-card.ts`
- Test: `tests/unit/knowledge-card.test.ts`

- [ ] Write failing tests for `buildLocalKnowledgeCard(problem)`:
  - Detects binary search keywords.
  - Detects graph keywords.
  - Emits complexity/caveats/frontier fields with safe fallback.
- [ ] Run targeted test and verify RED.
- [ ] Implement heuristic card builder.
- [ ] Re-run targeted test.

## Task 9: Rematch Scheduler

**Reference:** LeetCodeAnki, FSRS/Anki.

**Files:**
- Create: `app/lib/learning/rematch.ts`
- Test: `tests/unit/rematch.test.ts`

- [ ] Write failing tests for `buildRematchPlan(submissions, now)`:
  - Repeated failed submissions create a rematch candidate.
  - A later AC lowers priority but keeps a review note.
  - Older unresolved failures rank above recent one-off failures.
- [ ] Run targeted test and verify RED.
- [ ] Implement deterministic ranking; no database changes.
- [ ] Re-run targeted test.

## Task 10: Learning Loop Aggregator

**Reference:** Combines the nine local kernels for CodeNow-specific workflow.

**Files:**
- Create: `app/lib/learning/companion-loop.ts`
- Test: `tests/unit/companion-loop.test.ts`

- [ ] Write failing tests for `buildCompanionLearningSnapshot(input)`:
  - Includes review report, radar, desk note, risk reminders, knowledge card, rematch candidate.
  - Does not include muted memories in AI-facing fields.
  - Uses current failed result to prioritize counterexample challenge.
- [ ] Run targeted test and verify RED.
- [ ] Implement aggregator by importing prior task modules.
- [ ] Re-run targeted test.

## Task 11: AI Test Generation Latency Optimization

**Reference:** Hypothesis/fast-check for progressive feedback, Judge0 batch execution patterns for concurrent verification.

**Files:**
- Modify: `app/api/_lib/test-generation-pipeline.ts`
- Modify: `app/api/generate-tests/route.ts` only if response metadata needs surfacing
- Test: `tests/unit/test-generation-pipeline.test.ts`
- Test: `tests/unit/generate-tests-api.test.ts` only if route response changes

- [ ] Write failing tests for the latency behavior:
  - First generation batch size is capped and does not request an oversized initial batch.
  - When a usable partial set exists and the remaining time is low, the pipeline returns partial results with warnings instead of waiting for another doomed call.
  - Reference verification uses bounded concurrency and does not serialize every case.

- [ ] Run targeted tests to verify RED:

Run: `npm run test:unit -- tests/unit/test-generation-pipeline.test.ts`

- [ ] Implement minimal optimization:
  - Keep `GENERATION_BUDGET_MS`, `PER_CALL_TIMEOUT_CAP_MS`, `FIRST_BATCH_CAP`, and verification concurrency exported for tests.
  - Add an early partial-return guard once selected usable tests exist and remaining budget is below the next-call floor.
  - Preserve `report.partial`, `report.qualityOk`, `report.warnings`, and `report.referenceValidated` semantics.

- [ ] Run targeted tests to verify GREEN.

- [ ] Commit.

## Main-Agent Integration After Agents Return

- [ ] Review changed paths from all agents.
- [ ] Reject or rewrite any agent patch that touches题库 JSON、测试点生成产物、D1 migrations, `.data`, submission deletion semantics, or localStorage keys outside its approved scope.
- [ ] Resolve conflicts manually without reverting unrelated dirty work.
- [ ] Add minimal UI integration in `app/problem/[id]/page.tsx` only after pure modules pass:
  - Show a compact “复盘 / 反例 / 小纸条” strip in console area.
  - Add hint level selector to chat drawer request body.
  - Add a memory management entry point if time permits.
- [ ] Run focused tests:
  - `npm run test:unit -- tests/unit/memory-store.test.ts tests/unit/chat-route.test.ts tests/unit/companion-loop.test.ts`
- [ ] Run data-safety regression tests before final:
  - `npm run test:unit -- tests/unit/problem-repository.test.ts tests/unit/problem-persistence.test.ts tests/unit/submissions-api.test.ts tests/unit/local-data-migration.test.tsx tests/unit/bundled-catalog-load.test.ts tests/unit/contest-catalog.test.ts`
- [ ] Run full unit suite if focused tests pass:
  - `npm run test:unit`

## Agent Prompt Template

Each spawned task agent receives:

```text
You are a task agent for CodeNow OJ. Use superpowers:test-driven-development before editing. Work only on the files listed in your task. Do not ask the user; if product judgment is needed, make the conservative choice from the spec. Do not revert unrelated dirty changes. Return status DONE / DONE_WITH_CONCERNS / BLOCKED, changed files, tests run, and any integration hooks needed.
```
