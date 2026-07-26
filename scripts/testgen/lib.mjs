/* CodeNow OJ · 测试点数据工厂核心库(种子化构造 + 参考解产出 + 暴力解对拍) · Bamzc */

/** 种子化伪随机(mulberry32)：同种子产出恒定，保证数据可复现 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

export const randArray = (rng, n, lo, hi) => Array.from({ length: n }, () => randInt(rng, lo, hi));

export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 数字流分词：适配空白分隔的 stdin */
export const tokens = (input) => input.split(/\s+/).filter(Boolean);

/**
 * 由题目规格组装成 BundledProblem：
 * - gen(rng) 产出输入构造清单(category/scale/targets/reason)
 * - solve(input) 参考解计算期望输出(空输出直接拒绝出货)
 * - brute(input) 可选独立暴力解，对 scale===1 的小规模点对拍，不一致抛错
 */
export function buildProblem(spec, seed = 20260727) {
  const rng = mulberry32(seed);
  const rawCases = spec.gen(rng);
  if (rawCases.length < 12) throw new Error(`${spec.id} 测试点不足 12 个`);
  const samples = rawCases.map((c, idx) => {
    const input = c.input.endsWith("\n") ? c.input : `${c.input}\n`;
    const output = String(spec.solve(input));
    if (!output.trim()) throw new Error(`${spec.id} case#${idx + 1} 参考解输出为空`);
    if (spec.brute && (c.scale ?? 1) <= 1) {
      const expected = String(spec.brute(input));
      if (expected.trim() !== output.trim()) {
        throw new Error(`${spec.id} case#${idx + 1} 对拍不一致：参考解 ${output.trim().slice(0, 60)} vs 暴力解 ${expected.trim().slice(0, 60)}`);
      }
    }
    return {
      id: idx + 1,
      input,
      output: output.endsWith("\n") ? output : `${output}\n`,
      category: c.category,
      scale: c.scale ?? 1,
      targets: c.targets,
      reason: c.reason,
    };
  });
  return {
    id: spec.id, title: spec.title, difficulty: spec.difficulty,
    time: spec.time ?? "1000 ms", memory: spec.memory ?? "128 MB",
    description: spec.description, inputFormat: spec.inputFormat, outputFormat: spec.outputFormat,
    samples, folder: spec.folder, sourceUrl: spec.sourceUrl ?? "", extractionStatus: "complete",
  };
}
