import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pub = resolve(import.meta.dirname, "../../public");
const indexPath = resolve(pub, "catalog-index.json");

describe("题库索引产物契约(修 50MB 全量加载)", () => {
  it("catalog-index.json 存在且轻量(<1MB, 秒开)", () => {
    expect(existsSync(indexPath), "缺少 catalog-index.json，先运行 node scripts/testgen/split-catalog.mjs").toBe(true);
    expect(statSync(indexPath).size, "索引应保持轻量").toBeLessThan(1024 * 1024);
  });

  it("索引条目只含元数据与 sampleCount，不含 samples 数组", () => {
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as Array<Record<string, unknown>>;
    expect(index.length).toBeGreaterThanOrEqual(140);
    for (const item of index.slice(0, 20)) {
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(typeof item.sampleCount).toBe("number");
      expect("samples" in item, `${item.id} 索引不应含 samples 数组`).toBe(false);
    }
  });

  it("索引覆盖三大题源，且每题有对应的单题文件", () => {
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as Array<{ id: string }>;
    const ids = new Set(index.map((p) => p.id));
    expect([...ids].some((id) => id.startsWith("AW")), "含 AcWing 题").toBe(true);
    expect([...ids].some((id) => id.startsWith("CL")), "含经典题").toBe(true);
    expect([...ids].some((id) => id.startsWith("CS")), "含竞赛题").toBe(true);
    // 抽查单题文件存在且含完整 samples
    for (const id of ["AW791", "CL001", "CS001"]) {
      const p = resolve(pub, "problems", `${id}.json`);
      expect(existsSync(p), `缺少单题文件 ${id}.json`).toBe(true);
      const full = JSON.parse(readFileSync(p, "utf8")) as { samples: unknown[] };
      expect(Array.isArray(full.samples) && full.samples.length >= 12, `${id} 单题应含完整测试点`).toBe(true);
    }
  });
});
