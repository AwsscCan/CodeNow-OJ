/* CodeNow OJ · 内置题库数据工厂入口：产出经典题库 JSON · Bamzc */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLASSIC_DEFS_1 } from "./classic-defs-1.mjs";
import { CLASSIC_DEFS_2 } from "./classic-defs-2.mjs";
import { buildProblem } from "./lib.mjs";

const started = Date.now();
const defs = [...CLASSIC_DEFS_1, ...CLASSIC_DEFS_2];
const catalog = defs.map((spec) => {
  const problem = buildProblem(spec);
  const categories = new Set(problem.samples.map((s) => s.category));
  console.log(`${problem.id} ${problem.title} · ${problem.samples.length} 点 · 类别[${[...categories].join(",")}]`);
  return problem;
});

const target = resolve(import.meta.dirname, "../../public/classic-problems.json");
writeFileSync(target, `${JSON.stringify(catalog, null, 1)}\n`);
console.log(`\n共 ${catalog.length} 题 → ${target} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
