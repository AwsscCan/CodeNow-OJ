// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { BLANK_PROBLEM, BLANK_STARTER_CODE, INITIAL_PROBLEM, useProblemStore } from "../../app/stores/problem-store";

describe("blank workspace and per-problem drafts", () => {
  beforeEach(() => {
    localStorage.clear();
    useProblemStore.setState({ problem: BLANK_PROBLEM, code: BLANK_STARTER_CODE, draftCache: {}, cloudId: null });
  });

  it("starts a blank problem instead of the A+B solution", () => {
    useProblemStore.getState().createBlankWorkspace();
    const state = useProblemStore.getState();
    expect(state.problem).toEqual(BLANK_PROBLEM);
    expect(state.problem.samples).toEqual([]);
    expect(state.code).toBe(BLANK_STARTER_CODE);
    expect(state.code).not.toMatch(/cin\s*>>\s*a|a\s*\+\s*b/);
  });

  it("restores editor code independently for each local problem", () => {
    const first = { ...INITIAL_PROBLEM, id: "LOCAL1", title: "First" };
    const second = { ...INITIAL_PROBLEM, id: "LOCAL2", title: "Second" };
    useProblemStore.getState().loadLocalProblem(first);
    useProblemStore.getState().setCode("first draft");
    useProblemStore.getState().loadLocalProblem(second);
    useProblemStore.getState().setCode("second draft");
    useProblemStore.getState().loadLocalProblem(first);
    expect(useProblemStore.getState().code).toBe("first draft");
    useProblemStore.getState().loadLocalProblem(second);
    expect(useProblemStore.getState().code).toBe("second draft");
  });
});
