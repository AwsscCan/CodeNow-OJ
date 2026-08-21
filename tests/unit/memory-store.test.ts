// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  distillJudgeMemory,
  distillQuestionMemory,
  MEMORY_LIMIT,
  useMemoryStore,
} from "../../app/stores/memory-store";
import type { Result } from "../../app/stores/problem-store";

const problem = { id: "P1001", title: "A + B Problem" };

function result(status: Result["status"], id = 1): Result {
  return { id, status, actual: "", expected: "", duration: 1 };
}

beforeEach(() => {
  useMemoryStore.setState({ memories: [], memoryScope: { accountId: null, sessionId: "test" } });
});

describe("distillJudgeMemory 判题结果沉淀", () => {
  it("CE 沉淀编译失败记忆", () => {
    const m = distillJudgeMemory(problem, [result("CE")]);
    expect(m?.kind).toBe("mistake");
    expect(m?.text).toContain("P1001");
    expect(m?.text).toMatch(/编译/);
  });

  it("TLE 沉淀超时记忆", () => {
    expect(distillJudgeMemory(problem, [result("AC", 1), result("TLE", 2)])?.text).toMatch(/超时/);
  });

  it("RE 沉淀运行崩溃记忆", () => {
    expect(distillJudgeMemory(problem, [result("RE")])?.text).toMatch(/崩溃|越界/);
  });

  it("WA 沉淀记忆含通过比例与首个挂点", () => {
    const m = distillJudgeMemory(problem, [result("AC", 1), result("WA", 2), result("WA", 3)]);
    expect(m?.text).toContain("1/3");
    expect(m?.text).toMatch(/第 2 个/);
  });

  it("全 AC 或空结果不沉淀", () => {
    expect(distillJudgeMemory(problem, [result("AC")])).toBeNull();
    expect(distillJudgeMemory(problem, [])).toBeNull();
  });
});

describe("distillQuestionMemory 提问习惯沉淀", () => {
  it("识别边界类提问", () => {
    expect(distillQuestionMemory("这道题的边界情况有哪些？")?.kind).toBe("habit");
    expect(distillQuestionMemory("这道题的边界情况有哪些？")?.text).toMatch(/边界/);
  });

  it("识别复杂度/超时类提问", () => {
    expect(distillQuestionMemory("为什么我的代码会超时")?.text).toMatch(/复杂度|超时/);
  });

  it("识别先问思路的习惯", () => {
    expect(distillQuestionMemory("这题应该从什么思路入手？")?.text).toMatch(/思路/);
  });

  it("无可识别模式返回 null", () => {
    expect(distillQuestionMemory("你好呀")).toBeNull();
  });
});

describe("useMemoryStore 记忆池", () => {
  it("remember 去重合并：相同记忆 count 累加并刷新到队尾", () => {
    const s = () => useMemoryStore.getState();
    s().remember("mistake", "在「P1001」WA 过");
    s().remember("habit", "常问边界");
    s().remember("mistake", "在「P1001」WA 过");
    expect(s().memories).toHaveLength(2);
    const last = s().memories[s().memories.length - 1];
    expect(last.text).toBe("在「P1001」WA 过");
    expect(last.count).toBe(2);
  });

  it("容量上限拒绝新记忆而不淘汰历史", () => {
    const s = () => useMemoryStore.getState();
    const accepted = [];
    for (let i = 0; i < MEMORY_LIMIT + 5; i++) accepted.push(s().remember("mistake", `记忆${i}`));
    expect(accepted).toEqual([
      ...Array.from({ length: MEMORY_LIMIT }, () => true),
      ...Array.from({ length: 5 }, () => false),
    ]);
    expect(s().memories).toHaveLength(MEMORY_LIMIT);
    expect(s().memories.some((m) => m.text === "记忆0")).toBe(true);
    expect(s().memories[s().memories.length - 1].text).toBe(`记忆${MEMORY_LIMIT - 1}`);
  });

  it("forgetProblemMistakes：全 AC 后清除该题错误记忆，保留他题与习惯", () => {
    const s = () => useMemoryStore.getState();
    s().remember("mistake", "在「P1001 A + B Problem」WA 过(1/3)，第 2 个点先挂");
    s().remember("mistake", "在「CF0042 滑动窗口」超时过，倾向先写暴力解法");
    s().remember("habit", "常在边界情况上没把握");
    s().forgetProblemMistakes("P1001");
    const memories = s().memories;
    expect(memories.some((m) => m.text.includes("P1001"))).toBe(false);
    expect(memories.some((m) => m.text.includes("CF0042"))).toBe(true);
    expect(memories.some((m) => m.kind === "habit")).toBe(true);
  });

  it("已有记忆可固定与取消固定，不会改变其存储身份", () => {
    const s = () => useMemoryStore.getState();
    s().remember("habit", "可固定记忆");
    const memory = s().memories[0];
    s().togglePinned(memory.id);
    expect(s().memories[0]).toMatchObject({ id: memory.id, pinned: true });
    s().togglePinned(memory.id);
    expect(s().memories[0]).toMatchObject({ id: memory.id, pinned: false });
  });

  it("recentMemories 取最近 N 条，重复次数标注在文本中", () => {
    const s = () => useMemoryStore.getState();
    s().remember("mistake", "旧记忆");
    s().remember("habit", "常问边界");
    s().remember("habit", "常问边界");
    const recent = s().recentMemories(1);
    expect(recent).toHaveLength(1);
    expect(recent[0]).toContain("常问边界");
    expect(recent[0]).toMatch(/2/);
  });
});

describe("useMemoryStore account/session isolation", () => {
  beforeEach(() => {
    localStorage.clear();
    useMemoryStore.persist.setOptions({ name: "codenow-user-memory:unresolved" });
    useMemoryStore.setState({ memories: [], memoryScope: { accountId: null, sessionId: "unresolved" }, memoryStorageKey: "unresolved" });
  });

  it("does not write or hydrate legacy memory while authentication is unresolved", () => {
    const legacy = JSON.stringify({ state: { memories: [{ id: "legacy", kind: "habit", text: "guest memory", count: 1, updatedAt: "2020-01-01" }] }, version: 0 });
    localStorage.setItem("codenow-user-memory", legacy);
    const store = useMemoryStore.getState();

    expect(store.memoryScope).toEqual({ accountId: null, sessionId: "unresolved" });
    expect(store.remember("habit", "must wait for auth")).toBe(false);
    expect(localStorage.getItem("codenow-user-memory")).toBe(legacy);
  });

  it("keeps A and B memories in separate namespaces across an account switch", async () => {
    const store = () => useMemoryStore.getState();

    await store().switchMemoryScope({ accountId: "user-a", sessionId: "a-session-1" });
    expect(store().remember("habit", "only A")).toBe(true);

    await store().switchMemoryScope({ accountId: "user-b", sessionId: "b-session-1" });
    expect(useMemoryStore.getState().memories).toEqual([]);
    expect(store().remember("habit", "only B")).toBe(true);
    expect(localStorage.getItem("codenow-user-memory:account:user-a")).toContain("only A");
    expect(localStorage.getItem("codenow-user-memory:account:user-b")).toContain("only B");

    await store().switchMemoryScope({ accountId: "user-a", sessionId: "a-session-2" });
    expect(useMemoryStore.getState().memories.map((memory) => memory.text)).toEqual(["only A"]);
  });

  it("rejects a write captured before the memory scope changes", async () => {
    const store = () => useMemoryStore.getState();

    await store().switchMemoryScope({ accountId: "user-a", sessionId: "a-session-1" });
    const staleRemember = store().remember;

    await store().switchMemoryScope({ accountId: "user-b", sessionId: "b-session-1" });
    expect(staleRemember("habit", "stale A write")).toBe(false);
    expect(useMemoryStore.getState().memories).toEqual([]);
    expect(localStorage.getItem("codenow-user-memory:account:user-b") ?? "").not.toContain("stale A write");
  });

  it("ignores a stale same-account hydration after the session changes", async () => {
    const store = () => useMemoryStore.getState();

    const originalStorage = useMemoryStore.persist.getOptions().storage;
    let firstRead = true;
    let resolveFirstRead: ((value: unknown) => void) | undefined;
    const accountStorageKey = "codenow-user-memory:account:user-a";
    useMemoryStore.persist.setOptions({ storage: {
      getItem: (name: string) => {
        if (name !== accountStorageKey) return null;
        if (firstRead) {
          firstRead = false;
          return new Promise((resolve) => { resolveFirstRead = resolve; });
        }
        return { state: { memories: [{ id: "fresh", kind: "habit", text: "fresh session", count: 1, updatedAt: "2020-01-01" }], memoryStorageKey: "account:user-a" }, version: 0 };
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    } as never });

    try {
      const staleHydration = store().switchMemoryScope({ accountId: "user-a", sessionId: "a-session-1" });
      await vi.waitFor(() => expect(resolveFirstRead).toBeTypeOf("function"));

      await store().switchMemoryScope({ accountId: "user-a", sessionId: "a-session-2" });
      expect(useMemoryStore.getState().memories.map((memory) => memory.text)).toEqual(["fresh session"]);

      resolveFirstRead?.({ state: { memories: [{ id: "stale", kind: "habit", text: "stale session", count: 1, updatedAt: "2020-01-01" }], memoryStorageKey: "account:user-a" }, version: 0 });
      await staleHydration;
      expect(useMemoryStore.getState().memories.map((memory) => memory.text)).toEqual(["fresh session"]);
    } finally {
      useMemoryStore.persist.setOptions({ storage: originalStorage });
    }
  });

  it("keeps a write made while async hydration is pending", async () => {
    const store = () => useMemoryStore.getState();
    const originalStorage = useMemoryStore.persist.getOptions().storage;
    let resolveRead: ((value: unknown) => void) | undefined;
    const accountStorageKey = "codenow-user-memory:account:user-a";
    useMemoryStore.persist.setOptions({ storage: {
      getItem: (name: string) => {
        if (name !== accountStorageKey) return null;
        return new Promise((resolve) => { resolveRead = resolve; });
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    } as never });

    try {
      const hydration = store().switchMemoryScope({ accountId: "user-a", sessionId: "a-session-1" });
      await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));

      expect(store().remember("habit", "written during hydration")).toBe(true);
      resolveRead?.({ state: {
        memories: [{ id: "persisted", kind: "habit", text: "persisted memory", count: 1, updatedAt: "2020-01-01" }],
        memoryStorageKey: "account:user-a",
      }, version: 0 });
      await hydration;

      expect(store().memories.map((memory) => memory.text)).toEqual(["persisted memory", "written during hydration"]);
    } finally {
      useMemoryStore.persist.setOptions({ storage: originalStorage });
    }
  });

  it("does not overwrite account memory while logout passes through unresolved", async () => {
    const store = () => useMemoryStore.getState();

    await store().switchMemoryScope({ accountId: "user-a", sessionId: "a-session-1" });
    expect(store().remember("habit", "only A")).toBe(true);

    await store().switchMemoryScope({ accountId: null, sessionId: "unresolved" });
    await store().switchMemoryScope({ accountId: null, sessionId: "guest-session" });

    expect(store().memories).toEqual([]);
    expect(localStorage.getItem("codenow-user-memory:account:user-a")).toContain("only A");
  });

  it("recovers legacy-only memory for an anonymous scope without deleting the legacy key", async () => {
    const store = () => useMemoryStore.getState();

    const legacy = JSON.stringify({ state: { memories: [{ id: "legacy", kind: "habit", text: "recover me", count: 1, updatedAt: "2020-01-01" }] }, version: 0 });
    localStorage.setItem("codenow-user-memory", legacy);

    await store().switchMemoryScope({ accountId: null, sessionId: "guest-session" });
    expect(useMemoryStore.getState().memories.map((memory) => memory.text)).toEqual(["recover me"]);
    expect(localStorage.getItem("codenow-user-memory")).toBe(legacy);
    expect(localStorage.getItem("codenow-user-memory:anonymous")).toBeNull();

    expect(store().remember("habit", "new anonymous memory")).toBe(true);
    expect(localStorage.getItem("codenow-user-memory:anonymous")).toContain("recover me");
    expect(localStorage.getItem("codenow-user-memory:anonymous")).toContain("new anonymous memory");
    expect(localStorage.getItem("codenow-user-memory")).toBe(legacy);
  });

  it("keeps legacy entries usable when newer optional fields are absent", async () => {
    const store = () => useMemoryStore.getState();

    localStorage.setItem("codenow-user-memory:anonymous", JSON.stringify({ state: {
      memories: [{ id: "legacy", kind: "habit", text: "legacy memory", count: 1, updatedAt: "2020-01-01" }],
      memoryStorageKey: "anonymous",
    }, version: 0 }));
    await store().switchMemoryScope({ accountId: null, sessionId: "guest-session" });

    expect(store().memories[0]).not.toHaveProperty("pinned");
    expect(store().memories[0]).not.toHaveProperty("capacityManaged");
    store().togglePinned("legacy");
    expect(store().memories[0]).toMatchObject({ id: "legacy", pinned: true });
    expect(store().memories[0]).not.toHaveProperty("capacityManaged");
  });
});
