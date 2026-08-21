import { describe, expect, it } from "vitest";
import type { GeneratedTest } from "../../app/api/_lib/complexity-tests";
import {
  selectMutationEffectiveTests,
  type CandidateMutationResult,
} from "../../app/api/_lib/test-quality-selection";

function test(input: string, category: string): GeneratedTest {
  return {
    input: `${input}\n`,
    output: `${input}-out\n`,
    category,
    scale: 1,
    targets: `${category} behavior`,
    reason: `case ${input}`,
  };
}

function outcome(candidateIndex: number, mutantId: string, value: CandidateMutationResult["outcome"] = "killed"): CandidateMutationResult {
  return { candidateIndex, mutantId, outcome: value };
}

describe("mutation quality selection", () => {
  it("selects quota-compatible tests with the largest new mutant coverage", () => {
    const candidates = [
      test("A", "boundary"),
      test("B", "boundary"),
      test("C", "ordinary"),
      test("D", "ordinary"),
    ];
    const outcomes = [
      outcome(0, "m1"),
      outcome(1, "m1"), outcome(1, "m2"),
      outcome(2, "m2"),
      outcome(3, "m3"),
    ];

    const result = selectMutationEffectiveTests(candidates, outcomes, 2, {
      boundary: 1,
      ordinary: 1,
    });

    expect(result.report.selectedIndexes).toEqual([1, 3]);
    expect(result.tests.map((item) => item.input)).toEqual(["B\n", "D\n"]);
    expect(result.report).toMatchObject({
      usableMutants: 3,
      killedMutants: 3,
      mutationScore: 1,
      redundantIndexes: [0, 2],
    });
  });

  it("reserves quotas globally so category key order cannot lose reachable mutant coverage", () => {
    const candidates = [
      test("B1", "boundary"),
      test("B2", "boundary"),
      test("S1", "special"),
      test("S2", "special"),
    ];
    const outcomes = [
      outcome(0, "m1"), outcome(0, "m2"),
      outcome(1, "m3"), outcome(1, "m4"),
      outcome(2, "m1"), outcome(2, "m2"), outcome(2, "m3"),
      outcome(3, "m4"),
    ];

    const boundaryFirst = selectMutationEffectiveTests(candidates, outcomes, 2, { boundary: 1, special: 1 });
    const specialFirst = selectMutationEffectiveTests(candidates, outcomes, 2, { special: 1, boundary: 1 });

    expect(boundaryFirst.report.selectedIndexes).toEqual([2, 1]);
    expect(specialFirst.report.selectedIndexes).toEqual([2, 1]);
    expect(boundaryFirst.report).toMatchObject({ killedMutants: 4, mutationScore: 1 });
  });

  it("excludes an invalid mutant from ranking and the score denominator", () => {
    const candidates = [test("A", "ordinary"), test("B", "ordinary")];
    const outcomes = [
      outcome(0, "invalid", "killed"),
      outcome(1, "invalid", "invalid_mutant"),
      outcome(0, "usable", "survived"),
      outcome(1, "usable", "killed"),
    ];

    const result = selectMutationEffectiveTests(candidates, outcomes, 1, {});

    expect(result.report.selectedIndexes).toEqual([1]);
    expect(result.report).toMatchObject({ usableMutants: 1, killedMutants: 1, mutationScore: 1 });
  });

  it("uses original candidate order when marginal mutant coverage ties", () => {
    const candidates = [test("A", "ordinary"), test("B", "ordinary"), test("C", "ordinary")];
    const outcomes = [outcome(0, "m1"), outcome(1, "m1"), outcome(2, "m1")];

    const result = selectMutationEffectiveTests(candidates, outcomes, 2, {});

    expect(result.report.selectedIndexes).toEqual([0, 1]);
  });

  it("falls back to stable input order when no mutation outcomes exist", () => {
    const candidates = [test("A", "ordinary"), test("B", "boundary"), test("C", "special")];

    const result = selectMutationEffectiveTests(candidates, [], 2, {});

    expect(result.report.selectedIndexes).toEqual([0, 1]);
    expect(result.report).toMatchObject({ usableMutants: 0, killedMutants: 0, mutationScore: 0 });
  });

  it("clamps targets and ignores malformed outcome indexes and mutant ids", () => {
    const candidates = [test("A", "ordinary"), test("B", "ordinary")];
    const malformed = [
      outcome(-1, "m1"),
      outcome(8, "m2"),
      outcome(0, ""),
    ];

    expect(selectMutationEffectiveTests(candidates, malformed, -3, {}).report.selectedIndexes).toEqual([]);
    expect(selectMutationEffectiveTests(candidates, malformed, 99, {}).report.selectedIndexes).toEqual([0, 1]);
  });

  it("does not mutate candidates or outcome records", () => {
    const candidates = [test("A", "boundary"), test("B", "ordinary")];
    const outcomes = [outcome(0, "m1"), outcome(1, "m2")];
    const candidateSnapshot = structuredClone(candidates);
    const outcomeSnapshot = structuredClone(outcomes);

    selectMutationEffectiveTests(candidates, outcomes, 1, { boundary: 1 });

    expect(candidates).toEqual(candidateSnapshot);
    expect(outcomes).toEqual(outcomeSnapshot);
  });
});
