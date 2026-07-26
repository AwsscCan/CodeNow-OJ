import { describe, it, expect } from "vitest";
import {
  classifyResults,
  pickLocalLine,
  MASCOT_LINE_POOL,
  MASCOT_PHASES,
  type MascotPhase,
} from "../../app/stores/mascot-lines";
import type { Result } from "../../app/stores/problem-store";

function result(status: Result["status"], id = 1): Result {
  return { id, status, duration: 1, expected: "", actual: "" };
}

describe("classifyResults", () => {
  it("空结果视为编码中", () => {
    expect(classifyResults([]).phase).toBe("coding");
  });

  it("全部 AC 判为 ac，通过数等于总数", () => {
    const c = classifyResults([result("AC", 1), result("AC", 2)]);
    expect(c.phase).toBe("ac");
    expect(c.passed).toBe(2);
    expect(c.total).toBe(2);
    expect(c.firstFailedIndex).toBe(-1);
  });

  it("出现 CE 优先判为 ce（编译错误压倒一切）", () => {
    const c = classifyResults([result("CE", 1), result("WA", 2)]);
    expect(c.phase).toBe("ce");
  });

  it("有 TLE 判为 tle", () => {
    expect(classifyResults([result("AC", 1), result("TLE", 2)]).phase).toBe("tle");
  });

  it("有 RE 判为 re", () => {
    expect(classifyResults([result("AC", 1), result("RE", 2)]).phase).toBe("re");
  });

  it("仅答案错误判为 wa，并给出第一个未过点下标", () => {
    const c = classifyResults([result("AC", 1), result("AC", 2), result("WA", 3)]);
    expect(c.phase).toBe("wa");
    expect(c.passed).toBe(2);
    expect(c.total).toBe(3);
    expect(c.firstFailedIndex).toBe(2);
  });
});

describe("pickLocalLine", () => {
  it("每个 phase 台词池都非空且结构合法", () => {
    for (const phase of MASCOT_PHASES) {
      const pool = MASCOT_LINE_POOL[phase];
      expect(pool.length).toBeGreaterThan(0);
      for (const line of pool) {
        expect(line.text.trim().length).toBeGreaterThan(0);
        expect(typeof line.sprite).toBe("number");
        expect(line.mood).toBeTruthy();
      }
    }
  });

  it("排除 recent 中已说过的台词", () => {
    const phase: MascotPhase = "ac";
    const pool = MASCOT_LINE_POOL[phase];
    const recent = pool.slice(0, pool.length - 1).map((l) => l.text);
    const picked = pickLocalLine(phase, recent);
    expect(picked.text).toBe(pool[pool.length - 1].text);
  });

  it("recent 覆盖整池时仍能返回池内合法台词（不崩、不 undefined）", () => {
    const phase: MascotPhase = "wa";
    const recent = MASCOT_LINE_POOL[phase].map((l) => l.text);
    const picked = pickLocalLine(phase, recent);
    expect(MASCOT_LINE_POOL[phase].some((l) => l.text === picked.text)).toBe(true);
  });

  it("接受可注入随机源以保证确定性", () => {
    const phase: MascotPhase = "coding";
    const first = pickLocalLine(phase, [], () => 0);
    expect(first.text).toBe(MASCOT_LINE_POOL[phase][0].text);
  });
});
