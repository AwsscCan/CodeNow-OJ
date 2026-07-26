/* CodeNow OJ · 内置题库数据工厂入口：产出经典题库 JSON · Bamzc */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLASSIC_DEFS_1 } from "./classic-defs-1.mjs";
import { CLASSIC_DEFS_2 } from "./classic-defs-2.mjs";
import { CLASSIC_DEFS_3 } from "./classic-defs-3.mjs";
import { CONTEST_DEFS } from "./contest-defs.mjs";
import { buildProblem } from "./lib.mjs";

const started = Date.now();

function build(defs, outFile) {
  const catalog = defs.map((spec) => {
    const problem = buildProblem(spec);
    const categories = new Set(problem.samples.map((s) => s.category));
    console.log(`${problem.id} ${problem.title} · ${problem.samples.length} 点 · 类别[${[...categories].join(",")}]`);
    return problem;
  });
  const target = resolve(import.meta.dirname, `../../public/${outFile}`);
  writeFileSync(target, `${JSON.stringify(catalog, null, 1)}\n`);
  console.log(`→ ${catalog.length} 题 → ${outFile}\n`);
  return catalog.length;
}

const classicCount = build([...CLASSIC_DEFS_1, ...CLASSIC_DEFS_2, ...CLASSIC_DEFS_3], "classic-problems.json");
const contestCount = build(CONTEST_DEFS, "contest-problems.json");
console.log(`共 经典 ${classicCount} + 竞赛 ${contestCount} 题 (${((Date.now() - started) / 1000).toFixed(1)}s)`);
