import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** 已通过数据工厂增强的 AcWing 题号(逐批扩充，本清单只增不减) */
export const ENHANCED_ACWING_IDS = [
  "AW785", "AW786", "AW787", "AW788", "AW789", "AW790",
  "AW799", "AW800", "AW801", "AW802", "AW803",
  "AW826", "AW827", "AW828", "AW3302", "AW829", "AW830", "AW831",
  "AW835", "AW143", "AW836", "AW837", "AW240", "AW838", "AW839", "AW841",
  "AW842", "AW843", "AW844", "AW845", "AW846", "AW847", "AW848",
  "AW849", "AW853", "AW851", "AW852", "AW854", "AW858", "AW859", "AW860", "AW861",
  "AW866", "AW868", "AW869", "AW870", "AW871", "AW872", "AW873", "AW875", "AW876",
  "AW877", "AW878", "AW204", "AW883", "AW884", "AW889", "AW890", "AW891", "AW892", "AW893", "AW894",
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
        // 无解类测试点(如 n 皇后 n=2/3)期望输出合法为空
        if (!/无解/.test(sample.targets ?? "")) {
          expect(sample.output.trim().length, `${problem.id} 空输出`).toBeGreaterThan(0);
        }
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

  it("体积契约：单点输入 ≤256KB(判题链路约束)，题库文件总体积受控", () => {
    for (const problem of catalog) {
      for (const sample of problem.samples) {
        expect(sample.input.length, `${problem.id} 单点输入超 256KB`).toBeLessThanOrEqual(256 * 1024);
      }
    }
    const acwingBytes = statSync(resolve(import.meta.dirname, "../../public/acwing-course.json")).size;
    const classicBytes = statSync(resolve(import.meta.dirname, "../../public/classic-problems.json")).size;
    expect(acwingBytes, "acwing-course.json 体积失控(87 题全量预算 40MB)").toBeLessThanOrEqual(40 * 1024 * 1024);
    expect(classicBytes, "classic-problems.json 体积失控").toBeLessThanOrEqual(20 * 1024 * 1024);
  });

  it("未增强的题保持原状(不误伤)", () => {
    const untouched = catalog.filter((p) => !ENHANCED_ACWING_IDS.includes(p.id));
    expect(untouched.length).toBe(catalog.length - ENHANCED_ACWING_IDS.length);
    for (const problem of untouched) {
      expect(problem.samples.length, `${problem.id} 不应被本批修改`).toBeLessThanOrEqual(1);
    }
  });
});
