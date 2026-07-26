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

  it("整池说完后仍必换：不返回当前正显示的台词(recent 队尾)", () => {
    const phase: MascotPhase = "idle";
    const pool = MASCOT_LINE_POOL[phase];
    // recent 覆盖整池，队尾即当前句；rng 指向队尾下标，旧实现会原句返回
    const recent = pool.map((l) => l.text);
    const current = recent[recent.length - 1];
    const picked = pickLocalLine(phase, recent, () => 0.99);
    expect(picked.text).not.toBe(current);
  });

  it("高频情境池立绘多样性下限：idle/coding/wa 至少覆盖 3 种 sprite", () => {
    for (const phase of ["idle", "coding", "wa"] as const) {
      const sprites = new Set(MASCOT_LINE_POOL[phase].map((l) => l.sprite));
      expect(sprites.size, `${phase} 池立绘种类过少，桌宠会"只剩两个状态"`).toBeGreaterThanOrEqual(3);
    }
  });

  it("换台词优先切换动作：存在不同 sprite 候选时不选同 sprite 的句子", () => {
    const pool = MASCOT_LINE_POOL.idle;
    // 测试前提：idle 池第 2/4 句同 sprite，且池内存在其它 sprite 可换
    expect(pool[3].sprite, "测试前提：idle[1] 与 idle[3] 需同 sprite").toBe(pool[1].sprite);
    const current = pool[1];
    // rng 指向 fresh 尾部(同 sprite 的 idle[3])，未做动作优先时会撞车
    const picked = pickLocalLine("idle", [current.text], () => 0.99);
    expect(picked.sprite).not.toBe(current.sprite);
  });

  it("模拟连续点击换台词：相邻两次永不重复", () => {
    const phase: MascotPhase = "idle";
    // 复刻 store 的 appendRecent 语义：去重后追加，窗口 12 条
    let recent: string[] = [];
    const append = (text: string) => { recent = [...recent.filter((t) => t !== text), text].slice(-12); };
    let previous = "";
    for (let i = 0; i < 16; i++) {
      const line = pickLocalLine(phase, recent, () => 0.1);
      expect(line.text, `第 ${i + 1} 次点击吐了同一句`).not.toBe(previous);
      previous = line.text;
      append(line.text);
    }
  });
});
