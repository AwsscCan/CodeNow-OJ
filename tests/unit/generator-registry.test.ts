import { describe, expect, it } from "vitest";
import { expandGenerator } from "../../app/api/_lib/generator-registry";

const ctx = { maxN: 300000, maxValue: 1e9, constraints: "standard" };
const secondLine = (out: string) => out.trim().split("\n")[1];

describe("generator falsy-zero coercion", () => {
  it("random_array honors a legitimate hi:0 upper bound", () => {
    const out = expandGenerator({ type: "random_array", params: { n: 8, lo: -10, hi: 0, seed: 1 } }, ctx);
    const vals = secondLine(out).split(" ").map(Number);
    expect(Math.max(...vals)).toBeLessThanOrEqual(0);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(-10);
  });

  it("random_array rejects hi < lo", () => {
    expect(() => expandGenerator({ type: "random_array", params: { n: 5, lo: 0, hi: -5 } }, ctx)).toThrow();
  });

  it("increasing_array honors a legitimate start:0", () => {
    const out = expandGenerator({ type: "increasing_array", params: { n: 3, start: 0, step: 1 } }, ctx);
    expect(secondLine(out)).toBe("0 1 2");
  });

  it("decreasing_array honors a legitimate start:0", () => {
    const out = expandGenerator({ type: "decreasing_array", params: { n: 3, start: 0, step: 1 } }, ctx);
    expect(secondLine(out)).toBe("0 -1 -2");
  });

  it("checkerboard_grid honors a legitimate valB:0", () => {
    const out = expandGenerator({ type: "checkerboard_grid", params: { rows: 1, cols: 2, valA: 5, valB: 0 } }, ctx);
    expect(secondLine(out)).toBe("5 0");
  });
});
