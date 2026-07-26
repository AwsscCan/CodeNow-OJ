/* CodeNow OJ · AcWing needs_review 补全批次2：二维前缀差分/数学/DP/贪心 · Bamzc */

import { randArray, randInt, tokens } from "./lib.mjs";

const MOD = 1000000007n;
function powMod(a, b, p) { a = ((a % p) + p) % p; let r = 1n % p; while (b > 0n) { if (b & 1n) r = r * a % p; a = a * a % p; b >>= 1n; } return r; }
function factorize(x) { const o = []; for (let p = 2; p * p <= x; p++) { if (x % p) continue; let k = 0; while (x % p === 0) { x /= p; k++; } o.push([p, k]); } if (x > 1) o.push([x, 1]); return o; }

export const ACWING_REVIEW_2 = {
  AW796: {
    title: "子矩阵的和", difficulty: "入门", skipAnchor: true,
    description: "给定 n 行 m 列的整数矩阵，有 q 次询问，每次给出子矩阵左上角 (x1,y1) 与右下角 (x2,y2)，求该子矩阵所有元素之和。",
    inputFormat: "第一行三个整数 n m q（1 ≤ n, m ≤ 1000，1 ≤ q ≤ 100000）。接下来 n 行每行 m 个整数（绝对值 ≤ 1000）。接下来 q 行每行四个整数 x1 y1 x2 y2。",
    outputFormat: "q 行，每行一个整数，表示子矩阵和。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m, q] = t;
      const pre = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
      let idx = 3;
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) pre[i][j] = pre[i - 1][j] + pre[i][j - 1] - pre[i - 1][j - 1] + t[idx++];
      const out = [];
      for (let k = 0; k < q; k++) { const x1 = t[idx++], y1 = t[idx++], x2 = t[idx++], y2 = t[idx++]; out.push(pre[x2][y2] - pre[x1 - 1][y2] - pre[x2][y1 - 1] + pre[x1 - 1][y1 - 1]); }
      return out.join("\n");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m, q] = t;
      const g = []; let idx = 3;
      for (let i = 0; i < n; i++) { g.push(t.slice(idx, idx + m)); idx += m; }
      const out = [];
      for (let k = 0; k < q; k++) { const x1 = t[idx++], y1 = t[idx++], x2 = t[idx++], y2 = t[idx++]; let s = 0; for (let i = x1 - 1; i < x2; i++) for (let j = y1 - 1; j < y2; j++) s += g[i][j]; out.push(s); }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (n, m, g, qs) => `${n} ${m} ${qs.length}\n${g.map((r) => r.join(" ")).join("\n")}\n${qs.map((q) => q.join(" ")).join("\n")}`;
      const grid = (n, m) => Array.from({ length: n }, () => randArray(rng, m, -1000, 1000));
      const cases = [
        { input: mk(2, 2, [[1, 2], [3, 4]], [[1, 1, 2, 2], [1, 1, 1, 1]]), category: "sample", targets: "全矩阵与单格", reason: "10 与 1" },
        { input: mk(1, 1, [[5]], [[1, 1, 1, 1]]), category: "boundary", targets: "1×1", reason: "5" },
        { input: mk(1, 3, [[1, 2, 3]], [[1, 1, 1, 3]]), category: "boundary", targets: "单行", reason: "6" },
        { input: mk(120, 120, grid(120, 120), Array.from({ length: 12000 }, () => { const x1 = randInt(rng, 1, 120), y1 = randInt(rng, 1, 120); return [x1, y1, randInt(rng, x1, 120), randInt(rng, y1, 120)]; })), category: "performance", scale: 100000, targets: "120×120 矩阵 1.2 万询问卡逐格累加", reason: "二维前缀和 O(1) 查询" },
        { input: mk(120, 120, Array.from({ length: 120 }, () => new Array(120).fill(1000)), Array.from({ length: 8000 }, () => [1, 1, 120, 120])), category: "performance", scale: 50000, targets: "满值全矩阵重复查询(120)", reason: "4e7 和" },
        { input: mk(3, 3, [[1, -1, 1], [-1, 1, -1], [1, -1, 1]], [[1, 1, 3, 3]]), category: "adversarial", targets: "正负相间", reason: "和为 1" },
      ];
      for (let i = 0; i < 6; i++) { const n = randInt(rng, 1, 8), m = randInt(rng, 1, 8); cases.push({ input: mk(n, m, grid(n, m), Array.from({ length: randInt(rng, 1, 5) }, () => { const x1 = randInt(rng, 1, n), y1 = randInt(rng, 1, m); return [x1, y1, randInt(rng, x1, n), randInt(rng, y1, m)]; })), category: "ordinary", targets: "随机小矩阵", reason: "与逐格对拍" }); }
      return cases;
    },
  },
  AW798: {
    title: "差分矩阵", difficulty: "普及", skipAnchor: true,
    description: "给定 n 行 m 列的整数矩阵，进行 q 次操作，每次给子矩阵 (x1,y1)-(x2,y2) 内所有元素加 c。输出最终矩阵。",
    inputFormat: "第一行四个整数 n m q（1 ≤ n, m ≤ 1000，1 ≤ q ≤ 100000）。接下来 n 行 m 列初始矩阵。接下来 q 行每行五个整数 x1 y1 x2 y2 c。",
    outputFormat: "n 行 m 列，表示最终矩阵。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m, q] = t;
      const d = Array.from({ length: n + 2 }, () => new Float64Array(m + 2));
      let idx = 3;
      const add = (x1, y1, x2, y2, c) => { d[x1][y1] += c; d[x2 + 1][y1] -= c; d[x1][y2 + 1] -= c; d[x2 + 1][y2 + 1] += c; };
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) add(i, j, i, j, t[idx++]);
      for (let k = 0; k < q; k++) { const x1 = t[idx++], y1 = t[idx++], x2 = t[idx++], y2 = t[idx++], c = t[idx++]; add(x1, y1, x2, y2, c); }
      const out = [];
      for (let i = 1; i <= n; i++) { const row = []; for (let j = 1; j <= m; j++) { d[i][j] += d[i - 1][j] + d[i][j - 1] - d[i - 1][j - 1]; row.push(d[i][j]); } out.push(row.join(" ")); }
      return out.join("\n");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m, q] = t;
      const g = []; let idx = 3;
      for (let i = 0; i < n; i++) { g.push(t.slice(idx, idx + m)); idx += m; }
      for (let k = 0; k < q; k++) { const x1 = t[idx++], y1 = t[idx++], x2 = t[idx++], y2 = t[idx++], c = t[idx++]; for (let i = x1 - 1; i < x2; i++) for (let j = y1 - 1; j < y2; j++) g[i][j] += c; }
      return g.map((r) => r.join(" ")).join("\n");
    },
    gen(rng) {
      const mk = (n, m, g, ops) => `${n} ${m} ${ops.length}\n${g.map((r) => r.join(" ")).join("\n")}\n${ops.map((o) => o.join(" ")).join("\n")}`;
      const grid = (n, m) => Array.from({ length: n }, () => randArray(rng, m, -100, 100));
      const cases = [
        { input: mk(2, 2, [[0, 0], [0, 0]], [[1, 1, 2, 2, 5]]), category: "sample", targets: "全矩阵加", reason: "全 5" },
        { input: mk(1, 1, [[3]], [[1, 1, 1, 1, 2]]), category: "boundary", targets: "1×1 加", reason: "5" },
        { input: mk(3, 3, Array.from({ length: 3 }, () => [0, 0, 0]), [[2, 2, 2, 2, 9]]), category: "boundary", targets: "单格加", reason: "仅中心 9" },
        { input: mk(120, 120, grid(120, 120), Array.from({ length: 10000 }, () => { const x1 = randInt(rng, 1, 120), y1 = randInt(rng, 1, 120); return [x1, y1, randInt(rng, x1, 120), randInt(rng, y1, 120), randInt(rng, -100, 100)]; })), category: "performance", scale: 80000, targets: "120×120 矩阵 1 万操作卡逐格更新", reason: "二维差分 O(1) 区间加" },
        { input: mk(120, 120, Array.from({ length: 120 }, () => new Array(120).fill(0)), Array.from({ length: 8000 }, () => [1, 1, 120, 120, 1])), category: "performance", scale: 50000, targets: "全矩阵重复加(120)", reason: "全 5 万" },
        { input: mk(3, 3, Array.from({ length: 3 }, () => [0, 0, 0]), [[1, 1, 2, 2, 1], [2, 2, 3, 3, 1]]), category: "adversarial", targets: "重叠区域叠加", reason: "中心 (2,2) 加两次" },
      ];
      for (let i = 0; i < 6; i++) { const n = randInt(rng, 1, 8), m = randInt(rng, 1, 8); cases.push({ input: mk(n, m, grid(n, m), Array.from({ length: randInt(rng, 1, 5) }, () => { const x1 = randInt(rng, 1, n), y1 = randInt(rng, 1, m); return [x1, y1, randInt(rng, x1, n), randInt(rng, y1, m), randInt(rng, -50, 50)]; })), category: "ordinary", targets: "随机操作", reason: "与逐格对拍" }); }
      return cases;
    },
  },
  AW867: {
    title: "分解质因数", difficulty: "入门", skipAnchor: true,
    description: "给定 n 个正整数，对每个数分解质因数，按底数从小到大输出每个质因数及其指数，每个数输出完毕后空一行。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 100）。接下来 n 行每行一个正整数 a（2 ≤ a ≤ 10^9）。",
    outputFormat: "对每个数按行输出「底数 指数」，各数之间空一行。",
    solve(input) {
      const t = tokens(input).map(Number);
      const out = [];
      for (let i = 0; i < t[0]; i++) { for (const [p, k] of factorize(t[1 + i])) out.push(`${p} ${k}`); out.push(""); }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join("\n")}`;
      const cases = [
        { input: mk([6]), category: "sample", targets: "基础分解", reason: "2 1 / 3 1" },
        { input: mk([2]), category: "boundary", targets: "最小质数", reason: "2 1" },
        { input: mk([999999937]), category: "boundary", targets: "大质数", reason: "单因子" },
        { input: mk([1024]), category: "special", targets: "高次幂", reason: "2 10" },
        { input: mk(Array.from({ length: 100 }, () => 999000000 + randInt(rng, 0, 999999))), category: "performance", scale: 100, targets: "百个大数试除", reason: "sqrt 级分解" },
        { input: mk(Array.from({ length: 100 }, () => randInt(rng, 2, 1000000000))), category: "performance", scale: 100, targets: "满量随机大数", reason: "混合难度" },
        { input: mk([536870912]), category: "adversarial", targets: "2^29", reason: "指数统计" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 5) }, () => randInt(rng, 2, 5000))), category: "ordinary", targets: "小数分解", reason: "常规正确性" });
      return cases;
    },
  },
  P4549: {
    title: "裴蜀定理", difficulty: "普及", skipAnchor: true,
    description: "给定 n 个整数，求这些数的绝对值的最大公约数（即能表示为它们整系数线性组合的最小正整数）。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 20）。第二行 n 个整数（绝对值 ≤ 10^9，不全为 0）。",
    outputFormat: "一个整数，表示最小正整数。",
    solve(input) {
      const t = tokens(input).map(Number);
      const gcd = (a, b) => { while (b) { [a, b] = [b, a % b]; } return a; };
      let g = 0;
      for (let i = 0; i < t[0]; i++) g = gcd(g, Math.abs(t[1 + i]));
      return String(g);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([4, 6]), category: "sample", targets: "基础裴蜀", reason: "gcd 2" },
        { input: mk([7]), category: "boundary", targets: "单数", reason: "自身绝对值" },
        { input: mk([-4, 6]), category: "boundary", targets: "含负数", reason: "取绝对值 gcd 2" },
        { input: mk([3, 5, 7]), category: "special", targets: "互质组", reason: "1" },
        { input: mk(Array.from({ length: 20 }, () => randInt(rng, -1000000000, 1000000000) || 1)), category: "performance", scale: 20, targets: "20 个大数连续 gcd", reason: "满规模" },
        { input: mk([1000000000, -1000000000]), category: "adversarial", targets: "大数相反", reason: "gcd 1e9" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 8) }, () => randInt(rng, -100, 100) || 3)), category: "ordinary", targets: "随机小数", reason: "连续 gcd" });
      return cases;
    },
  },
  AW874: {
    title: "筛法求欧拉函数", difficulty: "普及", skipAnchor: true,
    description: "求 1 到 n 中每个数的欧拉函数之和。",
    inputFormat: "一行整数 n（1 ≤ n ≤ 1000000）。",
    outputFormat: "一个整数，表示 1 到 n 的欧拉函数之和。",
    solve(input) {
      const n = Number(tokens(input)[0]);
      const phi = new Int32Array(n + 1);
      const primes = []; const composite = new Uint8Array(n + 1);
      phi[1] = 1;
      let sum = n >= 1 ? 1n : 0n;
      for (let i = 2; i <= n; i++) {
        if (!composite[i]) { primes.push(i); phi[i] = i - 1; }
        for (const p of primes) { if (p * i > n) break; composite[p * i] = 1; if (i % p === 0) { phi[p * i] = phi[i] * p; break; } phi[p * i] = phi[i] * (p - 1); }
        sum += BigInt(phi[i]);
      }
      return String(sum);
    },
    gen(rng) {
      const cases = [
        { input: "1", category: "sample", targets: "φ(1)=1", reason: "和 1" },
        { input: "6", category: "sample", targets: "小规模", reason: "1+1+2+2+4+2=12" },
        { input: "2", category: "boundary", targets: "最小非平凡", reason: "1+1=2" },
        { input: "1000000", category: "performance", scale: 1000000, targets: "百万线性筛卡逐数分解", reason: "线性筛 φ 前缀和超 int" },
        { input: "999999", category: "performance", scale: 999999, targets: "近上界复验", reason: "差一防护" },
        { input: "100", category: "adversarial", targets: "百内和", reason: "3044" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: String(randInt(rng, 1, 2000)), category: "ordinary", targets: "随机上界", reason: "线性筛正确性" });
      return cases;
    },
  },
  AW885: {
    title: "求组合数 I", difficulty: "普及", skipAnchor: true,
    description: "给定 n 组询问，每组一对 a b，求 C(a,b) 对 1000000007 取模。数据范围较小，可用递推预处理。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 10000）。接下来 n 行每行两个整数 a b（1 ≤ b ≤ a ≤ 2000）。",
    outputFormat: "n 行，每行一个整数，表示 C(a,b) mod 1000000007。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const C = Array.from({ length: 2001 }, () => new Array(2001).fill(0n));
      for (let i = 0; i <= 2000; i++) { C[i][0] = 1n; for (let j = 1; j <= i; j++) C[i][j] = (C[i - 1][j - 1] + C[i - 1][j]) % MOD; }
      const out = [];
      for (let i = 0; i < n; i++) out.push(String(C[t[1 + 2 * i]][t[2 + 2 * i]]));
      return out.join("\n");
    },
    gen(rng) {
      const mk = (qs) => `${qs.length}\n${qs.map((q) => q.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[5, 2]]), category: "sample", targets: "基础组合", reason: "10" },
        { input: mk([[1, 1]]), category: "boundary", targets: "C(1,1)", reason: "1" },
        { input: mk([[2000, 1000]]), category: "boundary", targets: "上界组合", reason: "取模大值" },
        { input: mk([[2000, 0]].map(([a]) => [a, 1])), category: "special", targets: "取一个", reason: "a" },
        { input: mk(Array.from({ length: 10000 }, () => { const a = randInt(rng, 1, 2000); return [a, randInt(rng, 1, a)]; })), category: "performance", scale: 10000, targets: "万组询问 O(N²) 预处理", reason: "杨辉三角打表" },
        { input: mk(Array.from({ length: 10000 }, () => [2000, 1000])), category: "performance", scale: 10000, targets: "重复上界询问", reason: "打表后 O(1)" },
        { input: mk([[10, 5], [10, 3]]), category: "adversarial", targets: "同 a 不同 b", reason: "252 与 120" },
      ];
      for (let i = 0; i < 6; i++) { const a = randInt(rng, 1, 50); cases.push({ input: mk([[a, randInt(rng, 1, a)]]), category: "ordinary", targets: "随机小组合", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW886: {
    title: "求组合数 II", difficulty: "普及", skipAnchor: true,
    description: "给定 n 组询问，每组一对 a b，求 C(a,b) 对 1000000007 取模。a、b 可达 100000，需用阶乘逆元。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 10000）。接下来 n 行每行两个整数 a b（1 ≤ b ≤ a ≤ 100000）。",
    outputFormat: "n 行，每行一个整数。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0], N = 100000;
      const fact = new Array(N + 1).fill(1n), inv = new Array(N + 1).fill(1n);
      for (let i = 1; i <= N; i++) fact[i] = fact[i - 1] * BigInt(i) % MOD;
      inv[N] = powMod(fact[N], MOD - 2n, MOD);
      for (let i = N - 1; i >= 0; i--) inv[i] = inv[i + 1] * BigInt(i + 1) % MOD;
      const out = [];
      for (let i = 0; i < n; i++) { const a = t[1 + 2 * i], b = t[2 + 2 * i]; out.push(String(fact[a] * inv[b] % MOD * inv[a - b] % MOD)); }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (qs) => `${qs.length}\n${qs.map((q) => q.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[5, 2]]), category: "sample", targets: "基础组合", reason: "10" },
        { input: mk([[1, 1]]), category: "boundary", targets: "C(1,1)", reason: "1" },
        { input: mk([[100000, 50000]]), category: "boundary", targets: "上界组合", reason: "阶乘逆元" },
        { input: mk([[100000, 1]]), category: "special", targets: "取一个的大 a", reason: "100000" },
        { input: mk(Array.from({ length: 10000 }, () => { const a = randInt(rng, 1, 100000); return [a, randInt(rng, 1, a)]; })), category: "performance", scale: 10000, targets: "万组卡 O(N) 阶乘逆元预处理", reason: "费马逆元" },
        { input: mk(Array.from({ length: 10000 }, () => [100000, 50000])), category: "performance", scale: 10000, targets: "重复大组合", reason: "预处理后 O(1)" },
        { input: mk([[62, 31]]), category: "adversarial", targets: "跨取模边界", reason: "C(62,31) 超 1e9+7" },
      ];
      for (let i = 0; i < 6; i++) { const a = randInt(rng, 1, 100); cases.push({ input: mk([[a, randInt(rng, 1, a)]]), category: "ordinary", targets: "随机组合", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW887: {
    title: "求组合数 III", difficulty: "提高", skipAnchor: true,
    description: "给定 n 组询问，每组三个整数 a b p，求 C(a,b) mod p（p 为质数），a、b 可达 10^18。使用 Lucas 定理。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 20）。接下来 n 行每行三个整数 a b p（1 ≤ b ≤ a ≤ 10^18，1 ≤ p ≤ 100000 且为质数）。",
    outputFormat: "n 行，每行一个整数。",
    solve(input) {
      const t = tokens(input.replace(/\s+/g, " "));
      const n = Number(t[0]);
      const out = [];
      const C = (a, b, p) => { // 直接算 C(a,b) mod p，a,b < p
        if (b > a) return 0n;
        let up = 1n, down = 1n;
        for (let i = 0n; i < b; i++) { up = up * ((a - i) % p) % p; down = down * ((i + 1n) % p) % p; }
        return up * powMod(down, p - 2n, p) % p;
      };
      const lucas = (a, b, p) => { if (b === 0n) return 1n; return C(a % p, b % p, p) * lucas(a / p, b / p, p) % p; };
      for (let i = 0; i < n; i++) { const a = BigInt(t[1 + 3 * i]), b = BigInt(t[2 + 3 * i]), p = BigInt(t[3 + 3 * i]); out.push(String(lucas(a, b, p))); }
      return out.join("\n");
    },
    gen(rng) {
      const primes = [2, 3, 5, 7, 11, 101, 997, 99991];
      const mk = (qs) => `${qs.length}\n${qs.map((q) => q.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[5, 2, 7]]), category: "sample", targets: "小 Lucas", reason: "10 mod 7 = 3" },
        { input: mk([[1, 1, 2]]), category: "boundary", targets: "C(1,1)", reason: "1" },
        { input: mk([[1000000000000000000, 1, 99991]]), category: "boundary", targets: "1e18 取一个", reason: "a mod p" },
        { input: mk([[10, 5, 3]]), category: "special", targets: "小质数 Lucas 递归", reason: "252 mod 3 = 0" },
        { input: mk(Array.from({ length: 20 }, () => { const p = primes[randInt(rng, 4, 7)]; const a = randInt(rng, 1, 1000000000); return [a, randInt(rng, 1, a), p]; })), category: "performance", scale: 20, targets: "20 组大 a Lucas 递归", reason: "log_p 层递归" },
        { input: mk(Array.from({ length: 20 }, () => [999999999999, 500000000000, 99991])), category: "performance", scale: 20, targets: "1e12 级重复", reason: "深层 Lucas" },
        { input: mk([[6, 3, 5]]), category: "adversarial", targets: "跨质数分块", reason: "20 mod 5 = 0" },
      ];
      for (let i = 0; i < 6; i++) { const p = primes[randInt(rng, 0, 4)]; const a = randInt(rng, 1, 200); cases.push({ input: mk([[a, randInt(rng, 1, a), p]]), category: "ordinary", targets: "随机小 Lucas", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW888: {
    title: "求组合数 IV", difficulty: "提高", skipAnchor: true,
    description: "求 C(a,b) 的精确值（不取模，可能是很大的整数）。",
    inputFormat: "一行两个整数 a b（1 ≤ b ≤ a ≤ 5000）。",
    outputFormat: "一个整数，表示 C(a,b) 的精确值。",
    solve(input) {
      const [a, b] = tokens(input).map(Number);
      const k = Math.min(b, a - b);
      let numer = 1n, denom = 1n;
      for (let i = 0; i < k; i++) { numer *= BigInt(a - i); denom *= BigInt(i + 1); }
      return String(numer / denom);
    },
    gen(rng) {
      const mk = (a, b) => `${a} ${b}`;
      const cases = [
        { input: mk(5, 2), category: "sample", targets: "基础组合", reason: "10" },
        { input: mk(1, 1), category: "boundary", targets: "C(1,1)", reason: "1" },
        { input: mk(5000, 1), category: "boundary", targets: "取一个", reason: "5000" },
        { input: mk(5000, 2500), category: "performance", scale: 5000, targets: "上界高精度组合数", reason: "上千位大整数" },
        { input: mk(4999, 2500), category: "performance", scale: 4999, targets: "近上界复验", reason: "大整数除法" },
        { input: mk(50, 25), category: "adversarial", targets: "中等精确值", reason: "126410606437752" },
      ];
      for (let i = 0; i < 6; i++) { const a = randInt(rng, 1, 60); cases.push({ input: mk(a, randInt(rng, 1, a)), category: "ordinary", targets: "随机组合", reason: "精确值正确性" }); }
      return cases;
    },
  },
  AW2: {
    title: "01 背包问题", difficulty: "普及", skipAnchor: true,
    description: "有 N 件物品和容量为 V 的背包，第 i 件体积 v[i]、价值 w[i]，每件至多选一次，求不超过容量的最大总价值。",
    inputFormat: "第一行两个整数 N V（1 ≤ N, V ≤ 1000）。接下来 N 行每行两个整数 v[i] w[i]（1 ≤ v[i], w[i] ≤ 1000）。",
    outputFormat: "一个整数，最大总价值。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [N, V] = t;
      const dp = new Int32Array(V + 1);
      for (let i = 0; i < N; i++) { const v = t[2 + 2 * i], w = t[3 + 2 * i]; for (let j = V; j >= v; j--) if (dp[j - v] + w > dp[j]) dp[j] = dp[j - v] + w; }
      return String(dp[V]);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [N, V] = t;
      let best = 0;
      for (let mask = 0; mask < (1 << N); mask++) { let vol = 0, val = 0; for (let i = 0; i < N; i++) if (mask & (1 << i)) { vol += t[2 + 2 * i]; val += t[3 + 2 * i]; } if (vol <= V) best = Math.max(best, val); }
      return String(best);
    },
    gen(rng) {
      const mk = (V, items) => `${items.length} ${V}\n${items.map((it) => it.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(5, [[1, 2], [2, 4], [3, 4], [4, 5]]), category: "sample", targets: "经典样例", reason: "8" },
        { input: mk(1, [[1, 7]]), category: "boundary", targets: "单件恰装", reason: "7" },
        { input: mk(1, [[2, 100]]), category: "boundary", targets: "装不下", reason: "0" },
        { input: mk(1000, Array.from({ length: 1000 }, () => [randInt(rng, 1, 1000), randInt(rng, 1, 1000)])), category: "performance", scale: 1000, targets: "满规模卡 O(2^N)", reason: "01 背包 DP" },
        { input: mk(1000, Array.from({ length: 1000 }, () => [1, 1])), category: "performance", scale: 1000, targets: "全单位物品", reason: "取满容量" },
        { input: mk(6, [[3, 10], [3, 10], [4, 12], [2, 1]]), category: "adversarial", targets: "性价比贪心陷阱", reason: "贪心非最优" },
      ];
      for (let i = 0; i < 6; i++) { const N = randInt(rng, 1, 12), V = randInt(rng, 3, 30); cases.push({ input: mk(V, Array.from({ length: N }, () => [randInt(rng, 1, V), randInt(rng, 1, 30)])), category: "ordinary", targets: "随机小背包", reason: "与子集枚举对拍" }); }
      return cases;
    },
  },
  AW285: {
    title: "没有上司的舞会", difficulty: "提高", skipAnchor: true,
    description: "公司有 n 名职员构成一棵树，每人有快乐值。参加舞会时，若某职员参加则其直接下属都不能参加。求参加者快乐值总和的最大值。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 6000）。第二行 n 个整数为各职员快乐值（-128 ≤ 值 ≤ 127）。接下来 n-1 行，每行两个整数 l k 表示 k 是 l 的直接上司。",
    outputFormat: "一个整数，最大快乐值总和。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const happy = t.slice(1, 1 + n);
      const children = Array.from({ length: n + 1 }, () => []);
      const hasParent = new Uint8Array(n + 1);
      let idx = 1 + n;
      for (let i = 0; i < n - 1; i++) { const l = t[idx++], k = t[idx++]; children[k].push(l); hasParent[l] = 1; }
      let root = 1;
      for (let i = 1; i <= n; i++) if (!hasParent[i]) { root = i; break; }
      // 迭代后序 DP: dp[u][0]=不选u, dp[u][1]=选u
      const dp0 = new Int32Array(n + 1), dp1 = new Int32Array(n + 1);
      const order = [], stack = [root], vis = new Uint8Array(n + 1);
      vis[root] = 1;
      while (stack.length) { const u = stack.pop(); order.push(u); for (const c of children[u]) if (!vis[c]) { vis[c] = 1; stack.push(c); } }
      for (let i = order.length - 1; i >= 0; i--) {
        const u = order[i];
        dp1[u] = happy[u - 1];
        for (const c of children[u]) { dp0[u] += Math.max(dp0[c], dp1[c]); dp1[u] += dp0[c]; }
      }
      return String(Math.max(dp0[root], dp1[root]));
    },
    gen(rng) {
      const mk = (happy, edges) => `${happy.length}\n${happy.join(" ")}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const chainTree = (n) => Array.from({ length: n - 1 }, (_, i) => [i + 2, i + 1]); // i+2 的上司是 i+1
      const randomTree = (n) => Array.from({ length: n - 1 }, (_, i) => [i + 2, randInt(rng, 1, i + 1)]);
      const cases = [
        { input: mk([1, 2, 3], [[2, 1], [3, 1]]), category: "sample", targets: "根与两叶", reason: "选两叶 5" },
        { input: mk([5], []), category: "boundary", targets: "单人", reason: "5" },
        { input: mk([-1, -2], [[2, 1]]), category: "boundary", targets: "全负快乐值", reason: "不选任何人为 0? 但至少... 取 max(-1,-2 分支)" },
        { input: mk([10, 1, 1, 1], [[2, 1], [3, 1], [4, 1]]), category: "special", targets: "根值高", reason: "选根 10 > 选三叶 3" },
        { input: mk(randArray(rng, 6000, -128, 127), randomTree(6000)), category: "performance", scale: 6000, targets: "6000 点树形 DP", reason: "满规模" },
        { input: mk(randArray(rng, 6000, -128, 127), chainTree(6000)), category: "performance", scale: 6000, targets: "链树卡递归爆栈", reason: "迭代后序" },
        { input: mk([3, 5, 3, 5, 3], [[2, 1], [3, 2], [4, 3], [5, 4]]), category: "adversarial", targets: "链上隔层选取", reason: "选 1,3,5 或 2,4" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 1, 20); cases.push({ input: mk(randArray(rng, n, -10, 10), randomTree(n)), category: "ordinary", targets: "随机小树", reason: "树形 DP 正确性" }); }
      return cases;
    },
  },
  AW114: {
    title: "国王游戏", difficulty: "提高", skipAnchor: true,
    description: "国王和 n 名大臣排成一列，每人左右手各写一个数。排头的国王固定。每名大臣获得的金币 = 排在他前面所有人（含国王）左手数之积 ÷ 自己右手上的数（向下取整）。安排大臣顺序，使得获得金币最多的大臣所得尽量少，求这个最小的最大值。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 1000）。第二行两个整数为国王的左右手数。接下来 n 行每行两个整数为各大臣的左右手数（数值 1 ≤ 值 ≤ 10000）。",
    outputFormat: "一个整数，表示金币最多的大臣得到的最少金币数（高精度）。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const kingL = t[1], kingR = t[2];
      const mins = [];
      for (let i = 0; i < n; i++) mins.push([t[3 + 2 * i], t[4 + 2 * i]]);
      // 贪心：按 左×右 升序排序
      mins.sort((a, b) => a[0] * a[1] - b[0] * b[1]);
      let prefix = BigInt(kingL);
      let ans = 0n;
      for (const [l, r] of mins) { const coin = prefix / BigInt(r); if (coin > ans) ans = coin; prefix *= BigInt(l); }
      void kingR;
      return String(ans);
    },
    gen(rng) {
      const mk = (king, mins) => `${mins.length}\n${king.join(" ")}\n${mins.map((m) => m.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([1, 1], [[2, 3], [7, 4], [4, 6]]), category: "sample", targets: "经典样例", reason: "贪心排序" },
        { input: mk([1, 1], [[5, 5]]), category: "boundary", targets: "单大臣", reason: "1/5 向下取整 0" },
        { input: mk([2, 1], [[1, 1]]), category: "boundary", targets: "国王左手 2", reason: "2/1=2" },
        { input: mk([10000, 1], Array.from({ length: 1000 }, () => [randInt(rng, 1, 10000), randInt(rng, 1, 10000)])), category: "performance", scale: 1000, targets: "千大臣前缀积高精度", reason: "大整数累乘" },
        { input: mk([9999, 9999], Array.from({ length: 1000 }, () => [9999, 1])), category: "performance", scale: 1000, targets: "全大值前缀积爆炸", reason: "上千位大整数" },
        { input: mk([1, 1], [[2, 3], [3, 2]]), category: "adversarial", targets: "贪心排序键相等", reason: "左右积相同" },
      ];
      for (let i = 0; i < 6; i++) { const n = randInt(rng, 1, 8); cases.push({ input: mk([randInt(rng, 1, 100), randInt(rng, 1, 100)], Array.from({ length: n }, () => [randInt(rng, 1, 100), randInt(rng, 1, 100)])), category: "ordinary", targets: "随机小规模", reason: "贪心正确性" }); }
      return cases;
    },
  },
};
