// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useMascotStore, MASCOT_RECENT_LIMIT } from "../../app/stores/mascot-store";
import type { Result } from "../../app/stores/problem-store";

function result(status: Result["status"], id = 1): Result {
  return { id, status, duration: 1, expected: "", actual: "" };
}

beforeEach(() => {
  useMascotStore.getState().reset();
});

describe("useMascotStore 状态桥", () => {
  it("初始状态合理：idle 且有一句可显示台词", () => {
    const s = useMascotStore.getState();
    expect(s.phase).toBe("idle");
    expect(s.line.text.trim().length).toBeGreaterThan(0);
    expect(s.aiSolveRequestId).toBe(0);
  });

  it("setContext 局部合并上下文", () => {
    useMascotStore.getState().setContext({ problemTitle: "A+B", passed: 0, total: 0 });
    useMascotStore.getState().setContext({ codeExcerpt: "int main(){}" });
    const c = useMascotStore.getState().context;
    expect(c.problemTitle).toBe("A+B");
    expect(c.codeExcerpt).toBe("int main(){}");
  });

  it("reactToJudge 全 AC → phase ac 并刷新通过数与台词", () => {
    useMascotStore.getState().reactToJudge([result("AC", 1), result("AC", 2)]);
    const s = useMascotStore.getState();
    expect(s.phase).toBe("ac");
    expect(s.context.passed).toBe(2);
    expect(s.context.total).toBe(2);
    expect(s.recentLines).toContain(s.line.text);
  });

  it("reactToJudge 有 WA → phase wa 并记录首个未过点", () => {
    useMascotStore.getState().reactToJudge([result("AC", 1), result("WA", 2)]);
    const s = useMascotStore.getState();
    expect(s.phase).toBe("wa");
    expect(s.context.firstFailedIndex).toBe(1);
  });

  it("reactToJudge 有 CE → phase ce", () => {
    useMascotStore.getState().reactToJudge([result("CE", 1)]);
    expect(useMascotStore.getState().phase).toBe("ce");
  });

  it("requestAiSolve 递增触发器（供 problem 页面监听开弹窗）", () => {
    const before = useMascotStore.getState().aiSolveRequestId;
    useMascotStore.getState().requestAiSolve();
    useMascotStore.getState().requestAiSolve();
    expect(useMascotStore.getState().aiSolveRequestId).toBe(before + 2);
  });

  it("setLine 写入台词并去重 recentLines", () => {
    const line = { text: "同一句", mood: "smug" as const, sprite: 2 };
    useMascotStore.getState().setLine(line);
    useMascotStore.getState().setLine(line);
    const recent = useMascotStore.getState().recentLines;
    expect(recent.filter((t) => t === "同一句")).toHaveLength(1);
    expect(useMascotStore.getState().line.text).toBe("同一句");
  });

  it("recentLines 上限受 MASCOT_RECENT_LIMIT 约束，保留最近若干条", () => {
    for (let i = 0; i < MASCOT_RECENT_LIMIT + 8; i++) {
      useMascotStore.getState().setLine({ text: `台词${i}`, mood: "smile", sprite: 0 });
    }
    const recent = useMascotStore.getState().recentLines;
    expect(recent.length).toBe(MASCOT_RECENT_LIMIT);
    expect(recent[recent.length - 1]).toBe(`台词${MASCOT_RECENT_LIMIT + 7}`);
    expect(recent).not.toContain("台词0");
  });

  it("reset 恢复到 idle 初始态，初始台词计入去重窗口(首次点击必换新句)", () => {
    useMascotStore.getState().reactToJudge([result("WA", 1)]);
    useMascotStore.getState().requestAiSolve();
    useMascotStore.getState().reset();
    const s = useMascotStore.getState();
    expect(s.phase).toBe("idle");
    expect(s.aiSolveRequestId).toBe(0);
    expect(s.recentLines).toEqual([s.line.text]);
  });
});
