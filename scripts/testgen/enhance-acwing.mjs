/* CodeNow OJ · AcWing 题库测试点增强：锚点校验 + 污染样例治理 + 工厂数据 · Bamzc */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACWING_SOLVERS_1 } from "./acwing-solvers-1.mjs";
import { ACWING_SOLVERS_2A } from "./acwing-solvers-2a.mjs";
import { ACWING_SOLVERS_2B } from "./acwing-solvers-2b.mjs";
import { ACWING_SOLVERS_3A } from "./acwing-solvers-3a.mjs";
import { ACWING_SOLVERS_3B } from "./acwing-solvers-3b.mjs";
import { ACWING_SOLVERS_4A } from "./acwing-solvers-4a.mjs";
import { ACWING_SOLVERS_4B } from "./acwing-solvers-4b.mjs";
import { ACWING_SOLVERS_5A } from "./acwing-solvers-5a.mjs";
import { ACWING_SOLVERS_5B } from "./acwing-solvers-5b.mjs";
import { buildSamples, verifyAnchor } from "./lib.mjs";

const SOLVERS = { ...ACWING_SOLVERS_1, ...ACWING_SOLVERS_2A, ...ACWING_SOLVERS_2B, ...ACWING_SOLVERS_3A, ...ACWING_SOLVERS_3B, ...ACWING_SOLVERS_4A, ...ACWING_SOLVERS_4B, ...ACWING_SOLVERS_5A, ...ACWING_SOLVERS_5B };

const target = resolve(import.meta.dirname, "../../public/acwing-course.json");
const catalog = JSON.parse(readFileSync(target, "utf8"));

let enhanced = 0;
for (const problem of catalog) {
  const solver = SOLVERS[problem.id];
  if (!solver) continue;
  const spec = { id: problem.id, ...solver };

  // 原题样例是唯一的外部正确性锚点：参考解必须复现其输出前缀，否则拒绝出货。
  // 通过后用参考解输出替换(抓取时被博客正文污染的)原期望输出。
  // 幂等：重跑时只把"原始抓取样例(无 targets)或上次的锚点样例"当作锚点，工厂生成点全部重建。
  // solver 标注 skipAnchor 时表示原题样例本身抓取残缺不可用，弃用并纯工厂出数据
  const anchorCandidates = solver.skipAnchor ? [] : problem.samples.filter((s) => !s.targets || s.targets === "原题样例");
  const anchorSamples = [];
  for (const original of anchorCandidates) {
    if (!original.input?.trim()) continue;
    const cleanOutput = verifyAnchor(spec, original.input, original.output);
    anchorSamples.push({
      id: anchorSamples.length + 1,
      input: original.input.endsWith("\n") ? original.input : `${original.input}\n`,
      output: cleanOutput,
      category: "sample",
      scale: 1,
      targets: "原题样例",
      reason: "来自原题的正确性锚点，期望输出已用参考解清洗重建",
    });
  }

  const generated = buildSamples(spec, 20260727, anchorSamples.length + 1);
  problem.samples = [...anchorSamples, ...generated];
  enhanced++;
  const categories = new Set(problem.samples.map((s) => s.category));
  console.log(`${problem.id} ${problem.title} · ${problem.samples.length} 点 · 类别[${[...categories].join(",")}]`);
}

writeFileSync(target, `${JSON.stringify(catalog, null, 1)}\n`);
console.log(`\n增强 ${enhanced} 题 → ${target}`);
