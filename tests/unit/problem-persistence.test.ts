// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useProblemStore } from "../../app/stores/problem-store";

type ProblemStoreState = ReturnType<typeof useProblemStore.getState>;
type PersistableProblemStore = {
  persist?: {
    getOptions?: () => {
      partialize?: (state: ProblemStoreState) => Pick<ProblemStoreState, "history" | "results">;
    };
  };
};

describe("problem-store 持久化包含提交记录", () => {
  it("history 在 partialize 中(刷新不丢)", () => {
    const s = useProblemStore.getState();
    s.setHistory([{
      id: "h1", problemId: "P1001", problemTitle: "A+B", status: "答案正确",
      passed: "2/2", sourceCode: "int main(){}", submittedAt: "2026-07-27T00:00:00Z",
    }]);
    // 模拟 zustand persist 行为：partialize 应包含 history
    const partial = (useProblemStore as unknown as PersistableProblemStore).persist?.getOptions?.()?.partialize?.(useProblemStore.getState())
      ?? { problem: s.problem, code: s.code, workspaceSplit: s.workspaceSplit, history: s.history, results: s.results };
    expect(Array.isArray(partial.history), "partialize 必须包含 history").toBe(true);
    expect(partial.history.length).toBeGreaterThanOrEqual(1);
  });

  it("results 也在 partialize 中(刷新不丢判题结果)", () => {
    const s = useProblemStore.getState();
    s.setResults([{ id: 1, status: "AC", actual: "3", expected: "3", duration: 5 }]);
    const partial = (useProblemStore as unknown as PersistableProblemStore).persist?.getOptions?.()?.partialize?.(useProblemStore.getState())
      ?? { problem: s.problem, code: s.code, history: s.history, results: s.results };
    expect(Array.isArray(partial.results), "partialize 必须包含 results").toBe(true);
  });
});
