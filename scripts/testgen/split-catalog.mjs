/* CodeNow OJ · 题库拆分：轻量索引 + 按需单题文件(修题库页 50MB 全量加载) · Bamzc */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pub = resolve(import.meta.dirname, "../../public");
const sources = ["acwing-course.json", "classic-problems.json", "contest-problems.json"];
const problemsDir = resolve(pub, "problems");

// 清空旧的单题目录(幂等重建)
if (existsSync(problemsDir)) for (const f of readdirSync(problemsDir)) rmSync(resolve(problemsDir, f));
else mkdirSync(problemsDir, { recursive: true });

const index = [];
for (const file of sources) {
  const path = resolve(pub, file);
  if (!existsSync(path)) continue;
  const catalog = JSON.parse(readFileSync(path, "utf8"));
  for (const p of catalog) {
    // 单题完整文件(含 samples)按需加载
    writeFileSync(resolve(problemsDir, `${p.id}.json`), JSON.stringify(p));
    // 索引仅含题库列表所需元数据 + 测试点计数(不含 samples 内容)
    index.push({
      id: p.id, title: p.title, difficulty: p.difficulty, time: p.time, memory: p.memory,
      description: p.description, inputFormat: p.inputFormat, outputFormat: p.outputFormat,
      folder: p.folder, sourceUrl: p.sourceUrl, extractionStatus: p.extractionStatus,
      sampleCount: Array.isArray(p.samples) ? p.samples.length : 0,
    });
  }
}

const indexPath = resolve(pub, "catalog-index.json");
writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
const indexKb = Math.round(readFileSync(indexPath).byteLength / 1024);
console.log(`索引 ${index.length} 题 → catalog-index.json (${indexKb}KB) · 单题文件 ${index.length} 个 → public/problems/`);
