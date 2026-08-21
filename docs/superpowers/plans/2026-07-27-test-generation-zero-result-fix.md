# Test Generation Zero-Result Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI test generation return usable cases when the upstream response can be repaired, and expose the real failure reason instead of incorrectly reporting every zero-result run as duplicate data.

**Architecture:** Keep the existing `/api/generate-tests` route and generation pipeline. Add structured batch diagnostics at the model-response boundary, distinguish upstream request failures from parsed-but-rejected candidates, and perform one output-repair request only when inputs were parsed but outputs are missing.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, DeepSeek/OpenAI-compatible chat-completions API.

## Global Constraints

- Use strict TDD: every production change must be preceded by a focused failing test.
- Never log, persist, or return API keys.
- Preserve existing samples and generated test points.
- Keep the request target range at 1-50 cases.

---

### Task 1: Preserve the real zero-result failure

**Files:**
- Modify: `app/api/_lib/test-generation-pipeline.ts`
- Test: `tests/unit/test-generation-pipeline.test.ts`

**Interfaces:**
- Consumes: OpenAI-compatible HTTP error envelopes and model message content.
- Produces: a thrown error whose message identifies the actual upstream or parsing failure when no case survives.

- [x] **Step 1: Write failing tests**

Add cases where all upstream calls return `400 {"error":{"message":"unsupported parameter"}}` and where content is unparseable. Assert that rejection contains the upstream/parse reason and does not start with `只生成了 0/18`.

- [x] **Step 2: Verify RED**

Run `npx vitest run tests/unit/test-generation-pipeline.test.ts` and confirm the generic `0/N` message causes the new assertions to fail.

- [x] **Step 3: Implement minimal diagnostics**

Track whether each batch failed before content parsing, parsed zero tests, lost tests to missing output, invalid input, or deduplication. When `selected.length === 0`, throw the first actionable batch failure plus a compact rejection summary; reserve the `只生成了 X/N` warning for nonzero partial success.

- [x] **Step 4: Verify GREEN**

Run `npx vitest run tests/unit/test-generation-pipeline.test.ts` and confirm all pipeline tests pass.

### Task 2: Repair parsed cases that only lack outputs

**Files:**
- Modify: `app/api/_lib/test-generation-pipeline.ts`
- Test: `tests/unit/test-generation-pipeline.test.ts`

**Interfaces:**
- Consumes: parsed `GeneratedTest[]` whose inputs are valid but outputs are empty and no validated reference solution exists.
- Produces: one follow-up model request containing case IDs and inputs, then merges exact outputs into those candidates.

- [x] **Step 1: Write failing test**

Stub the first model response with valid unique inputs and empty outputs, then stub a repair response with exact outputs. Assert the pipeline returns the requested tests rather than zero.

- [x] **Step 2: Verify RED**

Run `npx vitest run tests/unit/test-generation-pipeline.test.ts` and confirm current filtering drops every candidate.

- [x] **Step 3: Implement minimal output repair**

When a batch parses valid inputs but lacks outputs, send one bounded JSON-only repair prompt. Accept only responses that preserve the original input fingerprint and provide a non-empty exact output.

- [x] **Step 4: Verify GREEN**

Run the focused pipeline tests and confirm the repaired cases survive normal validation and deduplication.

### Task 3: Route and UI regression coverage

**Files:**
- Test: `tests/unit/generate-tests-api.test.ts`
- Test: `tests/unit/problem-workspace-ui.test.tsx`
- Modify only if required: `app/api/generate-tests/route.ts`, `app/problem/[id]/page.tsx`
- Modify: `PROJECT-HANDOFF.md`

**Interfaces:**
- Consumes: pipeline success or actionable error.
- Produces: API error JSON and a user-visible toast containing the actual reason without secrets.

- [x] **Step 1: Add route and UI failing tests**

Assert an upstream error reaches the route response and the page displays it. Assert successful repaired tests are appended without removing existing samples.

- [x] **Step 2: Verify RED, then implement only required propagation changes**

Run `npx vitest run tests/unit/generate-tests-api.test.ts tests/unit/problem-workspace-ui.test.tsx` before and after the minimal route/UI change.

- [x] **Step 3: Run full verification**

Run `npm test`, scoped ESLint for changed TypeScript files, and `git diff --check`. Update the handoff test count to the verified total.
