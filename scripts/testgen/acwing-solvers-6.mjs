/* CodeNow OJ · AcWing 参考解批次6：收尾多组题 AW899/AW291 · Bamzc */

import { randInt } from "./lib.mjs";

/** 两串编辑距离(Levenshtein) */
function editDistance(a, b) {
  const n = a.length, m = b.length;
  let prev = new Int32Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    const cur = new Int32Array(m + 1);
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[m];
}

export const ACWING_SOLVERS_6 = {
  AW899: { // 编辑距离多询问：统计与询问串编辑距离 ≤ 上限的字符串个数
    skipAnchor: true,
    solve(input) {
      const lines = input.split("\n").filter((l) => l.length > 0);
      const [n, m] = lines[0].split(/\s+/).map(Number);
      const words = lines.slice(1, 1 + n).map((s) => s.trim());
      const out = [];
      for (let i = 0; i < m; i++) {
        const parts = lines[1 + n + i].trim().split(/\s+/);
        const q = parts[0], limit = Number(parts[1]);
        let count = 0;
        for (const w of words) if (editDistance(w, q) <= limit) count++;
        out.push(count);
      }
      return out.join("\n");
    },
    gen(rng) {
      const rs = (len) => Array.from({ length: len }, () => "abcde"[randInt(rng, 0, 4)]).join("");
      const mk = (words, queries) => `${words.length} ${queries.length}\n${words.join("\n")}\n${queries.map((q) => `${q[0]} ${q[1]}`).join("\n")}`;
      const cases = [
        { input: mk(["abc", "acd", "bcd"], [["ab", 1], ["acbd", 2]]), category: "sample", targets: "样例同款", reason: "1 与 3" },
        { input: mk(["a"], [["a", 0]]), category: "boundary", targets: "零操作精确匹配", reason: "1" },
        { input: mk(["a"], [["b", 0]]), category: "boundary", targets: "零操作不匹配", reason: "0" },
        { input: mk(["abcde"], [["abcde", 5]]), category: "special", targets: "上限极大全命中", reason: "1" },
        { input: mk(["aaa", "bbb"], [["aaa", 3]]), category: "special", targets: "距离恰等于上限", reason: "aaa 距 0，bbb 距 3，均 ≤3" },
        { input: mk(Array.from({ length: 1000 }, () => rs(10)), Array.from({ length: 1000 }, () => [rs(10), randInt(rng, 0, 10)])), category: "performance", scale: 1000, targets: "1000×1000×编辑距离满规模", reason: "O(nm·len²) 计算量" },
        { input: mk(Array.from({ length: 1000 }, () => "aaaaaaaaaa"), Array.from({ length: 1000 }, () => ["aaaaaaaaaa", 0])), category: "performance", scale: 1000, targets: "全同串高命中", reason: "距离恒为 0" },
        { input: mk(["abcd", "abce", "xyzw"], [["abcf", 1]]), category: "adversarial", targets: "单字符替换阈值", reason: "abcd/abce 距 1 命中，xyzw 不命中" },
      ];
      for (let i = 0; i < 5; i++) {
        const words = Array.from({ length: randInt(rng, 1, 6) }, () => rs(randInt(rng, 1, 6)));
        const queries = Array.from({ length: randInt(rng, 1, 5) }, () => [rs(randInt(rng, 1, 6)), randInt(rng, 0, 6)]);
        cases.push({ input: mk(words, queries), category: "ordinary", targets: "随机小规模", reason: "常规正确性" });
      }
      return cases;
    },
  },
  AW291: { // 蒙德里安的梦想多测：N×M 骨牌铺法数，0 0 终止
    skipAnchor: true,
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const out = [];
      for (const line of lines) {
        const [N, M] = line.split(/\s+/).map(Number);
        if (N === 0 && M === 0) break;
        out.push(String(countTilings(N, M)));
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (pairs) => `${pairs.map((p) => p.join(" ")).join("\n")}\n0 0`;
      const cases = [
        { input: mk([[1, 2]]), category: "sample", targets: "单骨牌", reason: "1" },
        { input: mk([[2, 3]]), category: "sample", targets: "2×3", reason: "3" },
        { input: mk([[1, 1]]), category: "boundary", targets: "奇数格无法铺", reason: "0" },
        { input: mk([[1, 3]]), category: "boundary", targets: "奇数总格", reason: "0" },
        { input: mk([[2, 4]]), category: "special", targets: "2×4", reason: "5" },
        { input: mk([[11, 11]]), category: "performance", scale: 11, targets: "11×11 奇数格状压", reason: "0(奇数格) 但需满状压计算" },
        { input: mk([[11, 10], [10, 11]]), category: "performance", scale: 11, targets: "上界满规模 2^11 状压", reason: "对称验证" },
        { input: mk([[4, 4], [4, 5], [5, 6]]), category: "adversarial", targets: "多组混合规模", reason: "连续多测状态复用" },
      ];
      for (let i = 0; i < 6; i++) { const n = randInt(rng, 1, 6), m = randInt(rng, 1, 6); cases.push({ input: mk([[n, m]]), category: "ordinary", targets: "随机小棋盘", reason: "状压 DP 正确性" }); }
      return cases;
    },
  },
};

/** 轮廓线/逐列状压 DP 求 N×M 骨牌铺满方案数 */
function countTilings(N, M) {
  if ((N * M) % 2 !== 0) return 0;
  // 按列 DP：状态为当前列各行是否被上一列横放骨牌伸出占据
  const full = 1 << N;
  // 预处理：状态 j 转移到状态 k 是否合法(k 表示本列伸向下一列的位置)
  let dp = new Array(full).fill(0n);
  dp[0] = 1n;
  // 逐列
  for (let col = 0; col < M; col++) {
    const next = new Array(full).fill(0n);
    for (let s = 0; s < full; s++) {
      if (dp[s] === 0n) continue;
      // s: 本列中已被上一列横放占据的行(必须不再放竖放)
      // 枚举本列剩余空位如何用竖放骨牌与横放骨牌头填充
      fill(0, 0, s, dp[s], next, N);
    }
    dp = next;
  }
  return dp[0];
}

/** 递归填当前列第 row 行：nextState 记录横放伸向下一列的行 */
function fill(row, nextState, occupied, ways, next, N) {
  if (row === N) { next[nextState] += ways; return; }
  if (occupied & (1 << row)) { fill(row + 1, nextState, occupied, ways, next, N); return; }
  // 竖放：占据 row 与 row+1(本列内)
  if (row + 1 < N && !(occupied & (1 << (row + 1)))) {
    fill(row + 2, nextState, occupied, ways, next, N);
  }
  // 横放：本列 row 放骨牌头，伸向下一列 row 行
  fill(row + 1, nextState | (1 << row), occupied, ways, next, N);
}
