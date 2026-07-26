import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** 已通过数据工厂增强的 AcWing 题号(逐批扩充，本清单只增不减) */
export const ENHANCED_ACWING_IDS = [
  "AW785", "AW786", "AW787", "AW788", "AW789", "AW790",
  "AW799", "AW800", "AW801", "AW802", "AW803",
];

type Bundled = {
  id: string; title: string; extractionStatus: string;
  samples: Array<{ input: string; output: string; category?: string; scale?: number; targets?: string }>;
};

const catalog = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../public/acwing-course.json"), "utf8")) as Bundled[];

describe("AcWing 增强题测试点质量契约", () => {
  const enhanced = catalog.filter((p) => ENHANCED_ACWING_IDS.includes(p.id));

  it("增强清单内的题全部存在", () => {
    expect(enhanced.map((p) => p.id).sort()).toEqual([...ENHANCED_ACWING_IDS].sort());
  });

  it("每题至少 12 个测试点，首个为原题样例锚点，输出无博客正文污染", () => {
    for (const problem of enhanced) {
      expect(problem.samples.length, `${problem.id} 测试点不足`).toBeGreaterThanOrEqual(12);
      expect(problem.samples[0].category, `${problem.id} 首点应为原题样例`).toBe("sample");
      for (const sample of problem.samples) {
        expect(sample.input.trim().length, `${problem.id} 空输入`).toBeGreaterThan(0);
        expect(sample.output.trim().length, `${problem.id} 空输出`).toBeGreaterThan(0);
        expect(sample.output, `${problem.id} 期望输出残留博客正文污染`).not.toMatch(/理解|感悟|题解|规则|知识|说明一下/);
      }
    }
  });

  it("每题类别覆盖 ≥4 种且含带规模与 targets 的性能点", () => {
    for (const problem of enhanced) {
      const categories = new Set(problem.samples.map((s) => s.category));
      expect(categories.size, `${problem.id} 类别不足`).toBeGreaterThanOrEqual(4);
      const perf = problem.samples.filter((s) => s.category === "performance");
      expect(perf.length, `${problem.id} 缺性能点`).toBeGreaterThanOrEqual(1);
      for (const p of perf) {
        expect(p.scale ?? 0, `${problem.id} 性能点缺规模`).toBeGreaterThan(1);
        expect((p.targets ?? "").length, `${problem.id} 性能点缺 targets`).toBeGreaterThan(4);
      }
    }
  });

  it("未增强的题保持原状(不误伤)", () => {
    const untouched = catalog.filter((p) => !ENHANCED_ACWING_IDS.includes(p.id));
    expect(untouched.length).toBe(catalog.length - ENHANCED_ACWING_IDS.length);
    for (const problem of untouched) {
      expect(problem.samples.length, `${problem.id} 不应被本批修改`).toBeLessThanOrEqual(1);
    }
  });
});
