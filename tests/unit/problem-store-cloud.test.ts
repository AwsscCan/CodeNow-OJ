import { beforeEach, describe, expect, it } from "vitest";
import { BLANK_PROBLEM, BLANK_STARTER_CODE, INITIAL_PROBLEM, STARTER_CODE, useProblemStore } from "../../app/stores/problem-store";

describe("problem workspace ownership transitions", () => {
  beforeEach(() => {
    useProblemStore.setState({
      problem: { ...INITIAL_PROBLEM, id: "PRIVATE", title: "Private", samples: [{ id: 1, input: "secret", output: "secret" }] },
      code: "secret source",
      cloudId: "cloud-private",
      version: 8,
      draftVersion: 3,
      syncStatus: "synced",
    });
  });

  it("clears cloud ownership when opening a local problem", () => {
    useProblemStore.getState().loadLocalProblem(INITIAL_PROBLEM);
    const state = useProblemStore.getState();
    expect(state.problem.id).toBe("P1001");
    expect(state.code).toBe(STARTER_CODE);
    expect(state).toMatchObject({ cloudId: null, version: 0, draftVersion: 0, syncStatus: "local-only" });
  });

  it("removes private problem and code data on logout", () => {
    useProblemStore.getState().clearPrivateWorkspace();
    const state = useProblemStore.getState();
    expect(state.problem).toEqual(BLANK_PROBLEM);
    expect(state.code).toBe(BLANK_STARTER_CODE);
    expect(state).toMatchObject({ cloudId: null, version: 0, draftVersion: 0, syncStatus: "local-only", history: [] });
  });
});
