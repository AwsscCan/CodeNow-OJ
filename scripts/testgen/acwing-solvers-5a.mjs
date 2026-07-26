/* CodeNow OJ · AcWing 参考解批次5a：背包与线性 DP · Bamzc */

import { randInt, tokens } from "./lib.mjs";

export const ACWING_SOLVERS_5A = {
  AW3: { // 完全背包
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, V] = t;
      const dp = new Int32Array(V + 1);
      for (let i = 0; i < n; i++) {
        const v = t[2 + 2 * i], w = t[3 + 2 * i];
        for (let j = v; j <= V; j++) if (dp[j - v] + w > dp[j]) dp[j] = dp[j - v] + w;
      }
      return String(dp[V]);
    },
    gen(rng) {
      const mk = (V, items) => `${items.length} ${V}\n${items.map((it) => it.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(1, [[1, 5]]), category: "boundary", targets: "单物品无限取", reason: "装满 1" },
        { input: mk(20000, [[1, 1]]), category: "boundary", targets: "容量上界单位物品", reason: "取满 2 万" },
        { input: mk(5, [[2, 3], [3, 4]]), category: "special", targets: "完全背包重复取", reason: "2+2 优于 3" },
        { input: mk(10, [[6, 100], [5, 80]]), category: "special", targets: "整除性影响", reason: "5×2 优于 6×1" },
        { input: mk(20000, Array.from({ length: 1000 }, () => [randInt(rng, 1, 200), randInt(rng, 1, 1000)])), category: "performance", scale: 20000, targets: "1000 种×2 万容量满规模", reason: "完全背包 O(NV)" },
        { input: mk(20000, [[1, 1]].concat(Array.from({ length: 999 }, () => [randInt(rng, 100, 200), randInt(rng, 1, 5)]))), category: "performance", scale: 20000, targets: "小体积主导的密集转移", reason: "内层满跑" },
        { input: mk(7, [[3, 5], [4, 6]]), category: "adversarial", targets: "凑不满的最优组合", reason: "3+4 用满" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 1, 8), V = randInt(rng, 2, 30); cases.push({ input: mk(V, Array.from({ length: n }, () => [randInt(rng, 1, V), randInt(rng, 1, 30)])), category: "ordinary", targets: "随机小背包", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW4: { // 多重背包 I（朴素）
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, V] = t;
      const dp = new Int32Array(V + 1);
      for (let i = 0; i < n; i++) {
        const v = t[2 + 3 * i], w = t[3 + 3 * i], s = t[4 + 3 * i];
        for (let j = V; j >= 0; j--) for (let k = 1; k <= s && k * v <= j; k++) if (dp[j - k * v] + k * w > dp[j]) dp[j] = dp[j - k * v] + k * w;
      }
      return String(dp[V]);
    },
    gen(rng) {
      const mk = (V, items) => `${items.length} ${V}\n${items.map((it) => it.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(5, [[1, 2, 3], [2, 4, 1], [3, 4, 3], [4, 5, 2]]), category: "boundary", targets: "样例同款", reason: "10" },
        { input: mk(1, [[1, 9, 5]]), category: "boundary", targets: "数量超容量", reason: "只取 1 个" },
        { input: mk(10, [[2, 5, 3]]), category: "special", targets: "数量限制生效", reason: "只能取 3 个共 6 容量" },
        { input: mk(100, [[3, 10, 2], [5, 12, 3]]), category: "special", targets: "多重组合择优", reason: "有限次数下最优" },
        { input: mk(2000, Array.from({ length: 100 }, () => [randInt(rng, 1, 50), randInt(rng, 1, 100), randInt(rng, 1, 20)])), category: "performance", scale: 2000, targets: "朴素 O(NVs) 满规模", reason: "三重循环压力" },
        { input: mk(1000, Array.from({ length: 100 }, () => [randInt(rng, 1, 10), randInt(rng, 1, 100), randInt(rng, 5, 15)])), category: "performance", scale: 1000, targets: "小体积高数量", reason: "内层 k 满跑" },
        { input: mk(6, [[2, 3, 2], [3, 5, 1]]), category: "adversarial", targets: "数量与容量双约束", reason: "2×2+... 精确凑" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 1, 6), V = randInt(rng, 2, 25); cases.push({ input: mk(V, Array.from({ length: n }, () => [randInt(rng, 1, V), randInt(rng, 1, 30), randInt(rng, 1, 5)])), category: "ordinary", targets: "随机小多重背包", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW5: { // 多重背包 II（二进制优化，同解）
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, V] = t;
      const dp = new Int32Array(V + 1);
      for (let i = 0; i < n; i++) {
        let v = t[2 + 3 * i], w = t[3 + 3 * i], s = t[4 + 3 * i];
        for (let k = 1; k <= s; k <<= 1) {
          const cv = k * v, cw = k * w;
          for (let j = V; j >= cv; j--) if (dp[j - cv] + cw > dp[j]) dp[j] = dp[j - cv] + cw;
          s -= k;
        }
        if (s > 0) { const cv = s * v, cw = s * w; for (let j = V; j >= cv; j--) if (dp[j - cv] + cw > dp[j]) dp[j] = dp[j - cv] + cw; }
      }
      return String(dp[V]);
    },
    brute(input) { // 朴素多重背包对拍
      const t = tokens(input).map(Number);
      const [n, V] = t;
      const dp = new Int32Array(V + 1);
      for (let i = 0; i < n; i++) {
        const v = t[2 + 3 * i], w = t[3 + 3 * i], s = t[4 + 3 * i];
        for (let j = V; j >= 0; j--) for (let k = 1; k <= s && k * v <= j; k++) if (dp[j - k * v] + k * w > dp[j]) dp[j] = dp[j - k * v] + k * w;
      }
      return String(dp[V]);
    },
    gen(rng) {
      const mk = (V, items) => `${items.length} ${V}\n${items.map((it) => it.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(5, [[1, 2, 3], [2, 4, 1], [3, 4, 3], [4, 5, 2]]), category: "boundary", targets: "样例同款", reason: "10" },
        { input: mk(10, [[1, 1, 1000]]), category: "boundary", targets: "数量远超容量的二进制拆分", reason: "取满 10" },
        { input: mk(20, [[3, 7, 6]]), category: "special", targets: "二进制拆分覆盖任意取数", reason: "1+2+3 拆分" },
        { input: mk(2000, Array.from({ length: 1000 }, () => [randInt(rng, 1, 50), randInt(rng, 1, 1000), randInt(rng, 1, 2000)])), category: "performance", scale: 2000, targets: "1000 种大数量卡朴素 O(NVs)", reason: "二进制优化必需" },
        { input: mk(20000, Array.from({ length: 100 }, () => [randInt(rng, 1, 100), randInt(rng, 1, 1000), randInt(rng, 100, 2000)])), category: "performance", scale: 20000, targets: "大容量大数量", reason: "log 拆分吞吐" },
        { input: mk(15, [[2, 5, 100], [3, 8, 100]]), category: "adversarial", targets: "数量充足退化为完全背包", reason: "拆分正确性" },
      ];
      for (let i = 0; i < 6; i++) { const n = randInt(rng, 1, 6), V = randInt(rng, 2, 25); cases.push({ input: mk(V, Array.from({ length: n }, () => [randInt(rng, 1, V), randInt(rng, 1, 30), randInt(rng, 1, 10)])), category: "ordinary", targets: "随机小多重背包", reason: "与朴素多重背包对拍" }); }
      return cases;
    },
  },
  AW9: { // 分组背包
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const [n, V] = lines[0].split(/\s+/).map(Number);
      const dp = new Int32Array(V + 1);
      let idx = 1;
      for (let g = 0; g < n; g++) {
        const s = Number(lines[idx++]);
        const group = [];
        for (let i = 0; i < s; i++) { const [v, w] = lines[idx++].split(/\s+/).map(Number); group.push([v, w]); }
        for (let j = V; j >= 0; j--) for (const [v, w] of group) if (v <= j && dp[j - v] + w > dp[j]) dp[j] = dp[j - v] + w;
      }
      return String(dp[V]);
    },
    gen(rng) {
      const mk = (V, groups) => `${groups.length} ${V}\n${groups.map((g) => `${g.length}\n${g.map((it) => it.join(" ")).join("\n")}`).join("\n")}`;
      const cases = [
        { input: mk(5, [[[1, 2], [2, 4]], [[3, 4]], [[4, 5]]]), category: "boundary", targets: "样例同款", reason: "8" },
        { input: mk(10, [[[3, 5], [5, 8], [10, 20]]]), category: "boundary", targets: "单组内互斥选一", reason: "取价值最高的可行项" },
        { input: mk(6, [[[2, 3], [3, 4]], [[2, 3], [4, 6]]]), category: "special", targets: "每组至多选一件", reason: "组内择优组合" },
        { input: mk(20000, Array.from({ length: 100 }, () => Array.from({ length: randInt(rng, 1, 10) }, () => [randInt(rng, 1, 200), randInt(rng, 1, 1000)]))), category: "performance", scale: 20000, targets: "100 组满容量分组背包", reason: "O(V·总物品)" },
        { input: mk(10000, Array.from({ length: 50 }, () => Array.from({ length: 20 }, () => [randInt(rng, 1, 100), randInt(rng, 1, 500)]))), category: "performance", scale: 10000, targets: "大组内物品数", reason: "组内枚举满跑" },
        { input: mk(8, [[[3, 10], [4, 12]], [[3, 10], [5, 15]]]), category: "adversarial", targets: "跨组容量竞争", reason: "两组共用有限容量" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 1, 5), V = randInt(rng, 2, 25); cases.push({ input: mk(V, Array.from({ length: n }, () => Array.from({ length: randInt(rng, 1, 4) }, () => [randInt(rng, 1, V), randInt(rng, 1, 30)]))), category: "ordinary", targets: "随机小分组背包", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW898: { // 数字三角形（可含负数）
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      let idx = 1;
      const rows = [];
      for (let i = 1; i <= n; i++) { rows.push(t.slice(idx, idx + i)); idx += i; }
      const dp = [...rows[n - 1]];
      for (let i = n - 2; i >= 0; i--) for (let j = 0; j <= i; j++) dp[j] = rows[i][j] + Math.max(dp[j], dp[j + 1]);
      return String(dp[0]);
    },
    gen(rng) {
      const mk = (rows) => `${rows.length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const tri = (n, lo, hi) => Array.from({ length: n }, (_, i) => Array.from({ length: i + 1 }, () => randInt(rng, lo, hi)));
      const cases = [
        { input: mk([[5]]), category: "boundary", targets: "单层", reason: "5" },
        { input: mk([[7], [3, 8], [8, 1, 0], [2, 7, 4, 4], [4, 5, 2, 6, 5]]), category: "boundary", targets: "样例同款", reason: "30" },
        { input: mk([[-1], [-2, -3]]), category: "special", targets: "全负值最大路径", reason: "-3" },
        { input: mk(tri(240, -10000, 10000)), category: "performance", scale: 240, targets: "500 层满规模", reason: "O(n²) DP" },
        { input: mk(tri(240, -1, 1)), category: "performance", scale: 240, targets: "微值满规模防剪枝", reason: "路径差异极小" },
        { input: mk([[1], [100, -100], [-100, 1, -100]]), category: "adversarial", targets: "局部贪心陷阱", reason: "先大后小非最优" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(tri(randInt(rng, 2, 12), -50, 50)), category: "ordinary", targets: "随机小三角", reason: "常规正确性" });
      return cases;
    },
  },
  AW895: { // 最长上升子序列（O(n²)）
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0], a = t.slice(1, 1 + n);
      const dp = new Array(n).fill(1);
      let best = n ? 1 : 0;
      for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) if (a[j] < a[i] && dp[j] + 1 > dp[i]) { dp[i] = dp[j] + 1; if (dp[i] > best) best = dp[i]; }
      return String(best);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([1]), category: "boundary", targets: "单元素", reason: "1" },
        { input: mk([3, 1, 2, 1, 8, 5, 6]), category: "boundary", targets: "样例同款", reason: "4" },
        { input: mk([5, 5, 5]), category: "special", targets: "全等严格上升", reason: "1" },
        { input: mk(Array.from({ length: 1000 }, (_, i) => i)), category: "special", targets: "严格递增答案 n", reason: "全序列" },
        { input: mk(Array.from({ length: 5000 }, (_, i) => 5000 - i)), category: "performance", scale: 5000, targets: "逆序 O(n²) 满规模", reason: "答案 1 但需全扫" },
        { input: mk(Array.from({ length: 5000 }, () => randInt(rng, 1, 1000000))), category: "performance", scale: 5000, targets: "随机满规模", reason: "双重循环压力" },
        { input: mk([1, 3, 2, 4, 3, 5]), category: "adversarial", targets: "锯齿上升", reason: "多分支择优" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 2, 40) }, () => randInt(rng, 1, 30))), category: "ordinary", targets: "随机小序列", reason: "常规正确性" });
      return cases;
    },
  },
  AW896: { // LIS II（O(n log n)，与 AW895 同解）
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const tails = [];
      for (let i = 0; i < n; i++) {
        const v = t[1 + i];
        let lo = 0, hi = tails.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < v) lo = mid + 1; else hi = mid; }
        tails[lo] = v;
      }
      return String(tails.length);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0], a = t.slice(1, 1 + n);
      const dp = new Array(n).fill(1);
      let best = n ? 1 : 0;
      for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) if (a[j] < a[i]) { dp[i] = Math.max(dp[i], dp[j] + 1); best = Math.max(best, dp[i]); }
      return String(best);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([1]), category: "boundary", targets: "单元素", reason: "1" },
        { input: mk([3, 1, 2, 1, 8, 5, 6]), category: "boundary", targets: "样例同款", reason: "4" },
        { input: mk([2, 2, 2, 2]), category: "special", targets: "全等严格判定", reason: "1" },
        { input: mk(Array.from({ length: 20000 }, (_, i) => i)), category: "performance", scale: 100000, targets: "10 万严格递增卡 O(n²)", reason: "需 O(n log n)" },
        { input: mk(Array.from({ length: 20000 }, () => randInt(rng, 1, 1000000000))), category: "performance", scale: 100000, targets: "随机满规模二分插入", reason: "tails 频繁替换" },
        { input: mk(Array.from({ length: 20000 }, (_, i) => (i % 2 ? i : i + 2))), category: "adversarial", scale: 100000, targets: "锯齿上升", reason: "二分定位密集" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 2, 60) }, () => randInt(rng, 1, 40))), category: "ordinary", targets: "随机小序列", reason: "与 O(n²) DP 对拍" });
      return cases;
    },
  },
  AW897: { // 最长公共子序列
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const [n, m] = lines[0].split(/\s+/).map(Number);
      const A = lines[1], B = lines[2];
      const dp = new Int32Array((m + 1));
      for (let i = 1; i <= n; i++) {
        let prev = 0;
        for (let j = 1; j <= m; j++) {
          const tmp = dp[j];
          dp[j] = A[i - 1] === B[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
          prev = tmp;
        }
      }
      return String(dp[m]);
    },
    gen(rng) {
      const alpha = "abcdefghijklmnopqrstuvwxyz";
      const rs = (len) => Array.from({ length: len }, () => alpha[randInt(rng, 0, 25)]).join("");
      const mk = (A, B) => `${A.length} ${B.length}\n${A}\n${B}`;
      const cases = [
        { input: mk("acbd", "abedc"), category: "boundary", targets: "样例同款", reason: "3" },
        { input: mk("a", "b"), category: "boundary", targets: "无公共", reason: "0" },
        { input: mk("abc", "abc"), category: "special", targets: "完全相同", reason: "3" },
        { input: mk("aaaa", "aa"), category: "special", targets: "重复字符", reason: "2" },
        { input: mk(rs(700), rs(700)), category: "performance", scale: 1000000, targets: "1000×1000 满规模 O(nm)", reason: "滚动数组" },
        { input: mk("a".repeat(700), "a".repeat(700)), category: "performance", scale: 1000000, targets: "全同字符对角满转移", reason: "答案 1000" },
        { input: mk("abcde", "edcba"), category: "adversarial", targets: "逆序串", reason: "LCS 为 1" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 1, 20), m = randInt(rng, 1, 20); cases.push({ input: mk(rs(n), rs(m)), category: "ordinary", targets: "随机小串", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW902: { // 最短编辑距离
    solve(input) {
      // 保留空串行(编辑距离允许空串)，按 长度\nA\n长度\nB 定位
      const raw = input.split("\n");
      const A = (raw[1] ?? "").replace(/\r/g, "");
      const B = (raw[3] ?? "").replace(/\r/g, "");
      const n = A.length, m = B.length;
      let prev = new Int32Array(m + 1);
      for (let j = 0; j <= m; j++) prev[j] = j;
      for (let i = 1; i <= n; i++) {
        const cur = new Int32Array(m + 1);
        cur[0] = i;
        for (let j = 1; j <= m; j++) {
          cur[j] = A[i - 1] === B[j - 1]
            ? prev[j - 1]
            : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
        }
        prev = cur;
      }
      return String(prev[m]);
    },
    gen(rng) {
      const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const rs = (len) => Array.from({ length: len }, () => alpha[randInt(rng, 0, 25)]).join("");
      const mk = (A, B) => `${A.length}\n${A}\n${B.length}\n${B}`;
      const cases = [
        { input: mk("AGTCTGACGC", "AGTAAGTAGGC"), category: "boundary", targets: "样例同款", reason: "4" },
        { input: mk("A", "A"), category: "boundary", targets: "相同单字符", reason: "0" },
        { input: mk("ABC", ""), category: "special", targets: "空目标全删除", reason: "3" },
        { input: mk("", "XYZ"), category: "special", targets: "空源全插入", reason: "3" },
        { input: mk(rs(700), rs(700)), category: "performance", scale: 1000000, targets: "1000×1000 满规模", reason: "O(nm) 编辑 DP" },
        { input: mk("A".repeat(700), "B".repeat(700)), category: "performance", scale: 1000000, targets: "全不同字符全替换", reason: "答案 1000" },
        { input: mk("ABCDE", "ACE"), category: "adversarial", targets: "间隔删除", reason: "2 次删除" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 0, 15), m = randInt(rng, 0, 15); cases.push({ input: mk(rs(n), rs(m)), category: "ordinary", targets: "随机小串", reason: "常规正确性" }); }
      return cases;
    },
  },
};
