import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Bundled = {
  id: string; title: string; folder: string; extractionStatus: string;
  samples: Array<{ input: string; output: string; category?: string; scale?: number; targets?: string }>;
};

const filePath = resolve(import.meta.dirname, "../../public/contest-problems.json");
const catalog = existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) as Bundled[] : [];

describe("竞赛真题题库数据质量契约", () => {
  it("产物存在且题号唯一，归入竞赛真题文件夹", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(7);
    expect(new Set(catalog.map((p) => p.id)).size).toBe(catalog.length);
    for (const p of catalog) {
      expect(p.id, p.id).toMatch(/^CS\d{3,4}$/);
      expect(p.folder.startsWith("竞赛真题/"), `${p.id} 应归入竞赛真题/`).toBe(true);
      expect(p.extractionStatus).toBe("complete");
    }
  });

  it("覆盖 CSP 认证 / CSP-J / NOIP / 蓝桥杯来源子文件夹", () => {
    const folders = new Set(catalog.map((p) => p.folder));
    expect([...folders].some((f) => f.includes("CSP 认证"))).toBe(true);
    expect([...folders].some((f) => f.includes("CSP-J"))).toBe(true);
    expect([...folders].some((f) => f.includes("NOIP"))).toBe(true);
    expect([...folders].some((f) => f.includes("蓝桥杯"))).toBe(true);
  });

  it("每题 ≥12 测试点，输入输出非空，类别覆盖 ≥4 且含性能点", () => {
    for (const p of catalog) {
      expect(p.samples.length, `${p.id} 测试点不足`).toBeGreaterThanOrEqual(12);
      const categories = new Set(p.samples.map((s) => s.category));
      expect(categories.size, `${p.id} 类别不足`).toBeGreaterThanOrEqual(4);
      expect(p.samples.some((s) => s.category === "performance"), `${p.id} 缺性能点`).toBe(true);
      for (const s of p.samples) {
        expect(s.input.trim().length, `${p.id} 空输入`).toBeGreaterThan(0);
        expect(s.output.trim().length, `${p.id} 空输出`).toBeGreaterThan(0);
        expect(s.input.length, `${p.id} 单点超 256KB`).toBeLessThanOrEqual(256 * 1024);
      }
    }
  });
});
