import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Bundled = {
  id: string; title: string; difficulty: string; time: string; memory: string;
  description: string; inputFormat: string; outputFormat: string;
  samples: Array<{ id: number; input: string; output: string; category?: string; scale?: number; targets?: string; reason?: string }>;
  folder: string; sourceUrl: string; extractionStatus: string;
};

const filePath = resolve(import.meta.dirname, "../../public/classic-problems.json");

function loadCatalog(): Bundled[] {
  return JSON.parse(readFileSync(filePath, "utf8")) as Bundled[];
}

describe("经典题库数据质量契约", () => {
  it("产物存在且至少 26 道题，题号唯一", () => {
    expect(existsSync(filePath), "缺少 public/classic-problems.json，先运行 node scripts/testgen/generate-bundled.mjs").toBe(true);
    const catalog = loadCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(26);
    expect(new Set(catalog.map((p) => p.id)).size).toBe(catalog.length);
  });

  it("每题结构完整：题面/输入输出格式/主题文件夹", () => {
    for (const problem of loadCatalog()) {
      expect(problem.id, problem.id).toMatch(/^CL\d{3}$/);
      expect(problem.title.trim().length).toBeGreaterThan(0);
      expect(problem.description.length, `${problem.id} 题面过短`).toBeGreaterThan(30);
      expect(problem.inputFormat.length).toBeGreaterThan(5);
      expect(problem.outputFormat.length).toBeGreaterThan(3);
      expect(problem.folder.startsWith("经典题库/"), `${problem.id} 文件夹应归入 经典题库/`).toBe(true);
      expect(problem.extractionStatus).toBe("complete");
    }
  });

  it("每题至少 12 个测试点，输入输出非空且覆盖至少 4 种类别", () => {
    for (const problem of loadCatalog()) {
      expect(problem.samples.length, `${problem.id} 测试点不足`).toBeGreaterThanOrEqual(12);
      const categories = new Set(problem.samples.map((s) => s.category));
      expect(categories.size, `${problem.id} 类别覆盖不足: ${[...categories].join(",")}`).toBeGreaterThanOrEqual(4);
      for (const sample of problem.samples) {
        expect(sample.input.trim().length, `${problem.id}#${sample.id} 空输入`).toBeGreaterThan(0);
        expect(sample.output.trim().length, `${problem.id}#${sample.id} 空输出`).toBeGreaterThan(0);
      }
    }
  });

  it("每题含带规模标注的性能测试点，且说明生成目标", () => {
    for (const problem of loadCatalog()) {
      const perf = problem.samples.filter((s) => s.category === "performance");
      expect(perf.length, `${problem.id} 缺性能点`).toBeGreaterThanOrEqual(1);
      for (const p of perf) {
        expect(p.scale ?? 0, `${problem.id} 性能点缺规模`).toBeGreaterThan(1);
        expect((p.targets ?? "").length, `${problem.id} 性能点缺 targets`).toBeGreaterThan(4);
      }
    }
  });

  it("主题文件夹至少 4 个(分类入库)", () => {
    const folders = new Set(loadCatalog().map((p) => p.folder));
    expect(folders.size).toBeGreaterThanOrEqual(4);
  });
});
