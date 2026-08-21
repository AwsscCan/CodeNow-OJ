/* CodeNow OJ · 内置题库数据工厂入口：产出经典题库 JSON · Bamzc */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLASSIC_DEFS_1 } from "./classic-defs-1.mjs";
import { CLASSIC_DEFS_2 } from "./classic-defs-2.mjs";
import { CLASSIC_DEFS_3 } from "./classic-defs-3.mjs";
import { CONTEST_DEFS } from "./contest-defs.mjs";
import { buildProblem } from "./lib.mjs";

export const CSP_CERTIFICATION_SESSIONS = [
  [33, "202403"], [34, "202406"], [35, "202409"], [36, "202412"], [37, "202503"],
  [38, "202506"], [39, "202509"], [40, "202512"], [41, "202603"], [42, "202605"],
];

function expectedCspCertificationProblems() {
  return CSP_CERTIFICATION_SESSIONS.flatMap(([session, date]) =>
    ["A", "B", "C", "D", "E"].map((letter, index) => ({
      id: `CS0${session}${index + 1}`,
      sourceId: `CSP${date}${letter}`,
      sourceUrl: `https://oj.shumeng.tech/p/CSP${date}${letter}`,
      folder: `竞赛真题/CSP 认证/第${session}次`,
    })),
  );
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 不能为空`);
}

function assertUniqueProblemIds(problems, label) {
  const seen = new Set();
  const duplicates = [];
  for (const problem of problems) {
    if (seen.has(problem.id)) duplicates.push(problem.id);
    seen.add(problem.id);
  }
  if (duplicates.length > 0) throw new Error(`${label} 包含重复题号: ${[...new Set(duplicates)].join(", ")}`);
}

/** 在落盘前校验权威 CSP 导入源，避免坏数据覆盖已有题库。 */
export function validateCspCertificationSource(source, contestDefinitions = CONTEST_DEFS) {
  if (!Array.isArray(source)) throw new Error("CSP 导入源必须是数组");
  const expected = expectedCspCertificationProblems();
  if (source.length !== expected.length) throw new Error(`CSP 导入源应包含 ${expected.length} 道题，实际 ${source.length} 道`);

  const expectedById = new Map(expected.map((problem) => [problem.id, problem]));
  const seenIds = new Set();
  for (const problem of source) {
    if (!problem || typeof problem !== "object") throw new Error("CSP 导入源包含无效题目");
    const expectedProblem = expectedById.get(problem.id);
    if (!expectedProblem) throw new Error(`CSP 导入源包含未知题号: ${String(problem.id)}`);
    if (seenIds.has(problem.id)) throw new Error(`CSP 导入源包含重复题号: ${problem.id}`);
    seenIds.add(problem.id);
    if (problem.sourceId !== expectedProblem.sourceId) throw new Error(`${problem.id} 来源题号错误`);
    if (problem.sourceUrl !== expectedProblem.sourceUrl) throw new Error(`${problem.id} 来源 URL 错误`);
    if (problem.folder !== expectedProblem.folder) throw new Error(`${problem.id} 目录错误`);
    if (!['入门', '普及', '提高'].includes(problem.difficulty)) throw new Error(`${problem.id} 难度错误`);
    for (const field of ["title", "time", "memory", "description", "inputFormat", "outputFormat"]) {
      assertNonEmptyString(problem[field], `${problem.id} ${field}`);
    }
    if (problem.extractionStatus !== "complete") throw new Error(`${problem.id} 提取状态错误`);
    if (!Array.isArray(problem.samples) || problem.samples.length === 0) throw new Error(`${problem.id} 缺少公开样例`);
    problem.samples.forEach((sample, index) => {
      if (!sample || sample.category !== "sample") throw new Error(`${problem.id} 样例 ${index + 1} 类别错误`);
      assertNonEmptyString(sample.input, `${problem.id} 样例 ${index + 1} 输入`);
      assertNonEmptyString(sample.output, `${problem.id} 样例 ${index + 1} 输出`);
    });
  }

  const missingIds = expected.filter((problem) => !seenIds.has(problem.id)).map((problem) => problem.id);
  if (missingIds.length > 0) throw new Error(`CSP 导入源缺少题号: ${missingIds.join(", ")}`);
  const contestIds = new Set(contestDefinitions.map((problem) => problem.id));
  const collisions = source.filter((problem) => contestIds.has(problem.id)).map((problem) => problem.id);
  if (collisions.length > 0) throw new Error(`CSP 导入源与竞赛定义题号冲突: ${collisions.join(", ")}`);
  return source;
}

function build(defs, outFile, imported = []) {
  const generated = defs.map((spec) => {
    const problem = buildProblem(spec);
    const categories = new Set(problem.samples.map((s) => s.category));
    console.log(`${problem.id} ${problem.title} · ${problem.samples.length} 点 · 类别[${[...categories].join(",")}]`);
    return problem;
  });
  for (const problem of imported) {
    console.log(`${problem.id} ${problem.title} · ${problem.samples.length} 个来源站公开样例 · ${problem.sourceUrl}`);
  }
  const catalog = [...generated, ...imported];
  assertUniqueProblemIds(catalog, outFile);
  const target = resolve(import.meta.dirname, `../../public/${outFile}`);
  writeFileSync(target, `${JSON.stringify(catalog, null, 1)}\n`);
  console.log(`→ ${catalog.length} 题 → ${outFile}\n`);
  return catalog.length;
}

export function generateBundled() {
  const started = Date.now();
  const cspSource = JSON.parse(readFileSync(resolve(import.meta.dirname, "csp-cert-source.json"), "utf8"));
  validateCspCertificationSource(cspSource, CONTEST_DEFS);
  const classicDefinitions = [...CLASSIC_DEFS_1, ...CLASSIC_DEFS_2, ...CLASSIC_DEFS_3];
  assertUniqueProblemIds(classicDefinitions, "经典题定义");
  assertUniqueProblemIds([...CONTEST_DEFS, ...cspSource], "竞赛题定义");

  const classicCount = build(classicDefinitions, "classic-problems.json");
  const contestCount = build(CONTEST_DEFS, "contest-problems.json", cspSource);
  console.log(`共 经典 ${classicCount} + 竞赛 ${contestCount} 题 (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  console.log("提示：运行 node scripts/testgen/split-catalog.mjs 重建轻量索引与单题文件");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generateBundled();
