import { describe, expect, it, vi } from "vitest";
import type { GeneratedTest } from "../../app/api/_lib/complexity-tests";
import {
  evaluateMutantFeedback,
  type MutantRunResult,
  type MutantSource,
} from "../../app/api/_lib/mutant-feedback";

function test(input: string, output: string): GeneratedTest {
  return { input, output, category: "ordinary", scale: 1, targets: "arithmetic", reason: "mutation fixture" };
}

function runResult(overrides: Partial<MutantRunResult> = {}): MutantRunResult {
  return { accepted: true, stdout: "", compileError: "", statusId: 3, ...overrides };
}

describe("mutant execution feedback", () => {
  it("skips malformed candidates while preserving later candidate indexes", async () => {
    const malformedCandidate = {
      input: { toString: () => "candidate-sentinel" },
      output: "ignored\n",
      category: "ordinary",
      scale: 1,
      targets: "fixture",
      reason: "fixture",
    } as unknown as GeneratedTest;
    const runner = vi.fn(async (_source: string, input: string) => runResult({ stdout: input ? "0\n" : "" }));

    const result = await evaluateMutantFeedback({
      candidates: [malformedCandidate, test("1\n", "2\n")],
      mutants: [{ id: "m1", sourceCode: "source-1" }],
      languageId: 54,
      run: runner,
    });

    expect(result).toEqual([{ candidateIndex: 1, mutantId: "m1", outcome: "killed" }]);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner).toHaveBeenLastCalledWith("source-1", "1\n", 54);
  });

  it("classifies equal output as survived and wrong or failed execution as killed", async () => {
    const candidates = [test("1\n", "2\n"), test("2\n", "4\n")];
    const mutants: MutantSource[] = [
      { id: "equal", sourceCode: "equal-source" },
      { id: "wrong", sourceCode: "wrong-source" },
      { id: "runtime", sourceCode: "runtime-source" },
    ];
    const runner = vi.fn(async (source: string, input: string) => {
      if (!input) return runResult();
      if (source === "equal-source") return runResult({ stdout: input === "1\n" ? "2  \r\n\r\n" : "4\n" });
      if (source === "wrong-source") return runResult({ stdout: "0\n" });
      return runResult({ accepted: false, statusId: 11 });
    });

    const result = await evaluateMutantFeedback({ candidates, mutants, languageId: 54, run: runner });

    expect(result).toEqual([
      { candidateIndex: 0, mutantId: "equal", outcome: "survived" },
      { candidateIndex: 1, mutantId: "equal", outcome: "survived" },
      { candidateIndex: 0, mutantId: "wrong", outcome: "killed" },
      { candidateIndex: 1, mutantId: "wrong", outcome: "killed" },
      { candidateIndex: 0, mutantId: "runtime", outcome: "killed" },
      { candidateIndex: 1, mutantId: "runtime", outcome: "killed" },
    ]);
  });

  it("marks unsafe and compile-failing sources invalid without scoring their candidates", async () => {
    const candidates = [test("1\n", "2\n")];
    const mutants: MutantSource[] = [
      { id: "unsafe", sourceCode: "int main(){ system(\"bad\"); }" },
      { id: "compile", sourceCode: "compile-source" },
      { id: "usable", sourceCode: "usable-source" },
    ];
    const runner = vi.fn(async (source: string, input: string) => {
      if (source === "compile-source" && !input) return runResult({ accepted: false, compileError: "syntax error", statusId: 6 });
      return runResult({ stdout: input ? "0\n" : "" });
    });

    const result = await evaluateMutantFeedback({ candidates, mutants, languageId: 54, run: runner });

    expect(result).toEqual([
      { candidateIndex: 0, mutantId: "unsafe", outcome: "invalid_mutant" },
      { candidateIndex: 0, mutantId: "compile", outcome: "invalid_mutant" },
      { candidateIndex: 0, mutantId: "usable", outcome: "killed" },
    ]);
    expect(runner.mock.calls.some(([source]) => source.includes("system"))).toBe(false);
  });

  it("deduplicates mutant ids and sources and enforces the eight-mutant pool limit", async () => {
    const candidates = [test("1\n", "2\n")];
    const mutants: MutantSource[] = [
      { id: "m0", sourceCode: "source-0" },
      { id: "m0", sourceCode: "source-duplicate-id" },
      { id: "duplicate-source", sourceCode: "source-0" },
      ...Array.from({ length: 10 }, (_, index) => ({ id: `m${index + 1}`, sourceCode: `source-${index + 1}` })),
    ];
    const runner = vi.fn(async (_source: string, input: string) => runResult({ stdout: input ? "0\n" : "" }));

    const result = await evaluateMutantFeedback({ candidates, mutants, languageId: 54, run: runner });

    expect(result).toHaveLength(8);
    expect(result.map((item) => item.mutantId)).toEqual(["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7"]);
  });

  it("caps candidates at fifty and does not mutate caller inputs", async () => {
    const candidates = Array.from({ length: 55 }, (_, index) => test(`${index}\n`, `${index}\n`));
    const mutants = [{ id: "m1", sourceCode: "source-1" }];
    const candidateSnapshot = structuredClone(candidates);
    const mutantSnapshot = structuredClone(mutants);
    const runner = vi.fn(async (_source: string, input: string) => runResult({ stdout: input }));

    const result = await evaluateMutantFeedback({ candidates, mutants, languageId: 54, run: runner });

    expect(result).toHaveLength(50);
    expect(result.at(-1)?.candidateIndex).toBe(49);
    expect(candidates).toEqual(candidateSnapshot);
    expect(mutants).toEqual(mutantSnapshot);
  });

  it("uses a bounded fallback concurrency when the requested value is not numeric", async () => {
    const runner = vi.fn(async (_source: string, input: string) => runResult({ stdout: input }));

    const result = await evaluateMutantFeedback({
      candidates: [test("1\n", "1\n")],
      mutants: [{ id: "m1", sourceCode: "source-1" }],
      languageId: 54,
      run: runner,
      concurrency: Number.NaN,
    });

    expect(result).toEqual([{ candidateIndex: 0, mutantId: "m1", outcome: "survived" }]);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("keeps result ordering stable when concurrent executions finish out of order", async () => {
    const runner = vi.fn(async (_source: string, input: string) => {
      if (!input) return runResult();
      if (input === "A\n") await new Promise((resolve) => setTimeout(resolve, 10));
      return runResult({ stdout: input === "A\n" ? "A-out\n" : "B-out\n" });
    });

    const result = await evaluateMutantFeedback({
      candidates: [test("A\n", "A-out\n"), test("B\n", "B-out\n")],
      mutants: [
        { id: "m1", sourceCode: "source-1" },
        { id: "m2", sourceCode: "source-2" },
      ],
      languageId: 54,
      run: runner,
      concurrency: 2,
    });

    expect(result).toEqual([
      { candidateIndex: 0, mutantId: "m1", outcome: "survived" },
      { candidateIndex: 1, mutantId: "m1", outcome: "survived" },
      { candidateIndex: 0, mutantId: "m2", outcome: "survived" },
      { candidateIndex: 1, mutantId: "m2", outcome: "survived" },
    ]);
  });

  it("stops scheduling later candidate runs after a runner error", async () => {
    const failure = new Error("Judge0 unavailable");
    let markSecondCandidateStarted: (() => void) | undefined;
    const secondCandidateStarted = new Promise<void>((resolve) => {
      markSecondCandidateStarted = resolve;
    });
    const runner = vi.fn(async (_source: string, input: string) => {
      if (!input) return runResult();
      if (input === "1\n") {
        await secondCandidateStarted;
        throw failure;
      }
      if (input === "2\n") {
        markSecondCandidateStarted?.();
        await Promise.resolve();
      }
      return runResult({ stdout: input });
    });

    await expect(evaluateMutantFeedback({
      candidates: [test("1\n", "1\n"), test("2\n", "2\n"), test("3\n", "3\n")],
      mutants: [{ id: "m1", sourceCode: "source-1" }],
      languageId: 54,
      run: runner,
      concurrency: 2,
    })).rejects.toBe(failure);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runner.mock.calls.filter(([, input]) => input !== "").map(([, input]) => input)).toEqual(["1\n", "2\n"]);
  });

  it("propagates a runner error without waiting for another in-flight candidate run", async () => {
    const failure = new Error("Judge0 unavailable");
    let markSlowRunStarted: (() => void) | undefined;
    let releaseSlowRun: (() => void) | undefined;
    const slowRunStarted = new Promise<void>((resolve) => {
      markSlowRunStarted = resolve;
    });
    const slowRun = new Promise<void>((resolve) => {
      releaseSlowRun = resolve;
    });
    const runner = vi.fn(async (_source: string, input: string) => {
      if (!input) return runResult();
      if (input === "1\n") {
        await slowRunStarted;
        throw failure;
      }
      markSlowRunStarted?.();
      await slowRun;
      return runResult({ stdout: input });
    });
    const pending = evaluateMutantFeedback({
      candidates: [test("1\n", "1\n"), test("2\n", "2\n")],
      mutants: [{ id: "m1", sourceCode: "source-1" }],
      languageId: 54,
      run: runner,
      concurrency: 2,
    });

    try {
      const settled = await Promise.race([
        pending.then(() => "resolved", (error) => error),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 100)),
      ]);
      expect(settled).toBe(failure);
    } finally {
      releaseSlowRun?.();
      await pending.catch(() => undefined);
    }
  });

  it("propagates runner failures so orchestration can preserve its previous selection", async () => {
    const failure = new Error("Judge0 unavailable");

    await expect(evaluateMutantFeedback({
      candidates: [test("1\n", "2\n")],
      mutants: [{ id: "m1", sourceCode: "source-1" }],
      languageId: 54,
      run: async () => { throw failure; },
    })).rejects.toBe(failure);
  });
});
