// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
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
  useMemoryStore.setState({ memories: [] });
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

  it("容量上限淘汰最旧记忆", () => {
    const s = () => useMemoryStore.getState();
    for (let i = 0; i < MEMORY_LIMIT + 5; i++) s().remember("mistake", `记忆${i}`);
    expect(s().memories).toHaveLength(MEMORY_LIMIT);
    expect(s().memories.some((m) => m.text === "记忆0")).toBe(false);
    expect(s().memories[s().memories.length - 1].text).toBe(`记忆${MEMORY_LIMIT + 4}`);
  });

  it("forgetProblemMistakes：全 AC 雪耻后清除该题错误记忆，保留他题与习惯", () => {
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
