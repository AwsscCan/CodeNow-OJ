/* CodeNow OJ · AcWing 参考解批次4b：高斯消元/卡特兰/容斥/博弈论 · Bamzc */

import { randInt, tokens } from "./lib.mjs";

const MOD = 1000000007n;

function powMod(a, b, p) {
  a = ((a % p) + p) % p;
  let r = 1n % p;
  while (b > 0n) { if (b & 1n) r = (r * a) % p; a = (a * a) % p; b >>= 1n; }
  return r;
}

export const ACWING_SOLVERS_4B = {
  AW883: { // 高斯消元解线性方程组：唯一解两位小数 / Infinite group solutions / No solution
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const n = Number(lines[0].trim());
      const a = [];
      for (let i = 1; i <= n; i++) a.push(lines[i].trim().split(/\s+/).map(Number));
      const eps = 1e-8;
      let row = 0;
      for (let col = 0; col < n; col++) {
        let pivot = row;
        for (let i = row; i < n; i++) if (Math.abs(a[i][col]) > Math.abs(a[pivot][col])) pivot = i;
        if (pivot >= n || Math.abs(a[pivot][col]) < eps) continue;
        [a[row], a[pivot]] = [a[pivot], a[row]];
        for (let j = n; j >= col; j--) a[row][j] /= a[row][col];
        for (let i = 0; i < n; i++) if (i !== row && Math.abs(a[i][col]) > eps) {
          for (let j = n; j >= col; j--) a[i][j] -= a[i][col] * a[row][j];
        }
        row++;
      }
      if (row < n) {
        for (let i = row; i < n; i++) if (Math.abs(a[i][n]) > eps) return "No solution";
        return "Infinite group solutions";
      }
      const out = [];
      for (let i = 0; i < n; i++) {
        const v = a[i][n];
        const fixed = (Math.abs(v) < 5e-3 ? 0 : v).toFixed(2);
        out.push(fixed === "-0.00" ? "0.00" : fixed);
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (rows) => `${rows.length}\n${rows.map((r) => r.map((v) => v.toFixed(2)).join(" ")).join("\n")}`;
      // 由已知整数解回带构造，保证唯一解且数值稳定
      const known = (n) => {
        const xs = Array.from({ length: n }, () => randInt(rng, -8, 8));
        const rows = [];
        for (let i = 0; i < n; i++) {
          const coef = Array.from({ length: n }, () => randInt(rng, -5, 5));
          coef[i] += n + 3; // 对角占优保稳定
          const rhs = coef.reduce((s, c, j) => s + c * xs[j], 0);
          rows.push([...coef, rhs]);
        }
        return rows;
      };
      const cases = [
        { input: mk([[2, 4]]), category: "boundary", targets: "一元方程", reason: "x=2.00" },
        { input: mk([[0, 0]]), category: "boundary", targets: "0=0 无穷解", reason: "Infinite group solutions" },
        { input: mk([[0, 3]]), category: "boundary", targets: "0=3 无解", reason: "No solution" },
        { input: mk([[1, 1, 3], [2, 2, 6]]), category: "special", targets: "行成比例无穷解", reason: "秩亏可容" },
        { input: mk([[1, 1, 3], [2, 2, 7]]), category: "special", targets: "行矛盾无解", reason: "0=1 检测" },
        { input: mk([[0, 1, 1, 2], [1, 0, 1, 3], [1, 1, 0, 4]]), category: "special", targets: "首列零主元需换行", reason: "列主元选择" },
        { input: mk(known(100)), category: "performance", scale: 100, targets: "100 元方程组 O(n³) 满规模", reason: "对角占优唯一解" },
        { input: mk(known(95)), category: "performance", scale: 95, targets: "近满规模复验", reason: "消元数值稳定" },
        { input: mk([[1, 1, 1], [1, 1.0001, 1]]), category: "adversarial", targets: "近奇异矩阵", reason: "eps 阈值敏感性" },
      ];
      for (let i = 0; i < 4; i++) cases.push({ input: mk(known(randInt(rng, 2, 6))), category: "ordinary", targets: "已知解回带小方程组", reason: "解可回代验证" });
      return cases;
    },
  },
  AW884: { // 异或线性方程组：唯一解 / Multiple sets of solutions / No solution
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const n = Number(lines[0].trim());
      const a = [];
      for (let i = 1; i <= n; i++) a.push(lines[i].trim().split(/\s+/).map(Number));
      let row = 0;
      for (let col = 0; col < n; col++) {
        let pivot = -1;
        for (let i = row; i < n; i++) if (a[i][col]) { pivot = i; break; }
        if (pivot === -1) continue;
        [a[row], a[pivot]] = [a[pivot], a[row]];
        for (let i = 0; i < n; i++) if (i !== row && a[i][col]) {
          for (let j = col; j <= n; j++) a[i][j] ^= a[row][j];
        }
        row++;
      }
      if (row < n) {
        for (let i = row; i < n; i++) if (a[i][n]) return "No solution";
        return "Multiple sets of solutions";
      }
      return a.map((r) => r[n]).join("\n");
    },
    gen(rng) {
      const mk = (rows) => `${rows.length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const known = (n) => {
        const xs = Array.from({ length: n }, () => randInt(rng, 0, 1));
        const rows = [];
        for (let i = 0; i < n; i++) {
          const coef = Array.from({ length: n }, () => randInt(rng, 0, 1));
          coef[i] = 1; // 保证满秩概率(对角强置 1)
          const rhs = coef.reduce((s, c, j) => s ^ (c & xs[j]), 0);
          rows.push([...coef, rhs]);
        }
        return rows;
      };
      const cases = [
        { input: mk([[1, 1]]), category: "boundary", targets: "一元 x=1", reason: "最小方程" },
        { input: mk([[0, 0]]), category: "boundary", targets: "0=0 多解", reason: "Multiple sets of solutions" },
        { input: mk([[0, 1]]), category: "boundary", targets: "0=1 无解", reason: "No solution" },
        { input: mk([[1, 1, 0, 1], [0, 1, 1, 0], [1, 0, 0, 1]]), category: "special", targets: "样例同款", reason: "1 0 0" },
        { input: mk([[1, 1, 1], [1, 1, 1]]), category: "special", targets: "重复方程多解", reason: "秩亏一致" },
        { input: mk([[1, 1, 1], [1, 1, 0]]), category: "special", targets: "重复方程矛盾", reason: "无解检测" },
        { input: mk(known(100)), category: "performance", scale: 100, targets: "100 元异或消元满规模", reason: "位消元 O(n³)" },
        { input: mk(known(90)), category: "performance", scale: 90, targets: "近满规模复验", reason: "换行选主元路径" },
        { input: mk([[0, 1, 0, 1], [1, 0, 0, 0], [0, 0, 1, 1]]), category: "adversarial", targets: "零主元跳列", reason: "列扫描顺序" },
      ];
      for (let i = 0; i < 4; i++) cases.push({ input: mk(known(randInt(rng, 2, 8))), category: "ordinary", targets: "已知解回带", reason: "异或回代验证" });
      return cases;
    },
  },
  AW889: { // 满足条件的01序列：卡特兰数 C(2n,n)/(n+1) mod 1e9+7
    solve(input) {
      const n = BigInt(tokens(input)[0]);
      // C(2n, n) * inv(n+1)
      let numer = 1n, denom = 1n;
      for (let i = 1n; i <= n; i++) {
        numer = (numer * ((n + i) % MOD)) % MOD;
        denom = (denom * i) % MOD;
      }
      const catalan = (numer * powMod(denom, MOD - 2n, MOD)) % MOD * powMod(n + 1n, MOD - 2n, MOD) % MOD;
      return String(catalan);
    },
    brute(input) {
      const n = Number(tokens(input)[0]);
      // 小规模 DP：dp[i][j] 前 i 位放 j 个 1(前缀 0 数 ≥ 1 数)
      const dp = Array.from({ length: 2 * n + 1 }, () => new Array(n + 1).fill(0n));
      dp[0][0] = 1n;
      for (let i = 0; i < 2 * n; i++) for (let j = 0; j <= Math.min(i, n); j++) {
        if (dp[i][j] === 0n) continue;
        const zeros = i - j;
        if (zeros + 1 >= j && zeros + 1 <= n) dp[i + 1][j] = (dp[i + 1][j] + dp[i][j]) % MOD; // 放 0
        if (j + 1 <= zeros && j + 1 <= n) dp[i + 1][j + 1] = (dp[i + 1][j + 1] + dp[i][j]) % MOD; // 放 1
      }
      // 注：0 视为进栈(计数多者)，j 统计 1 的个数，约束 1 的个数 ≤ 0 的个数
      return String(dp[2 * n][n]);
    },
    gen(rng) {
      const cases = [
        { input: "1", category: "boundary", targets: "最小规模", reason: "卡特兰 1" },
        { input: "2", category: "boundary", targets: "两对括号", reason: "2" },
        { input: "3", category: "special", targets: "样例同款", reason: "5" },
        { input: "10", category: "special", targets: "两位数规模", reason: "16796" },
        { input: "100000", category: "performance", scale: 100000, targets: "10 万规模卡阶乘逐算与 O(n²) DP", reason: "线性预处理+逆元" },
        { input: "99991", category: "performance", scale: 99991, targets: "质数规模满负荷", reason: "组合数模运算" },
        { input: "35", category: "adversarial", targets: "答案跨越取模边界", reason: "首次超过 1e9+7 的取模正确性" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: String(randInt(rng, 1, 12)), category: "ordinary", targets: "小规模", reason: "与路径 DP 对拍" });
      return cases;
    },
  },
  AW890: { // 能被整除的数：容斥原理
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const primes = t.slice(2, 2 + m);
      let total = 0;
      for (let mask = 1; mask < (1 << m); mask++) {
        let product = 1, bits = 0, overflow = false;
        for (let i = 0; i < m; i++) if (mask & (1 << i)) {
          bits++;
          product *= primes[i];
          if (product > n) { overflow = true; break; }
        }
        if (overflow) continue;
        const count = Math.floor(n / product);
        total += (bits % 2 ? 1 : -1) * count;
      }
      return String(total);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const primes = t.slice(2, 2 + m);
      let count = 0;
      for (let x = 1; x <= n; x++) if (primes.some((p) => x % p === 0)) count++;
      return String(count);
    },
    gen(rng) {
      const primePool = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53];
      const pick = (k) => { const pool = [...primePool]; const out = []; for (let i = 0; i < k; i++) out.push(pool.splice(randInt(rng, 0, pool.length - 1), 1)[0]); return out; };
      const mk = (n, ps) => `${n} ${ps.length}\n${ps.join(" ")}`;
      const cases = [
        { input: mk(1, [2]), category: "boundary", targets: "区间无倍数", reason: "0" },
        { input: mk(2, [2]), category: "boundary", targets: "恰含一个倍数", reason: "1" },
        { input: mk(10, [2, 3]), category: "special", targets: "样例同款", reason: "7" },
        { input: mk(100, [2, 3, 5]), category: "special", targets: "三集合容斥", reason: "74" },
        { input: mk(1000000000, pick(16)), category: "performance", scale: 65536, targets: "16 质数 2^16 子集枚举", reason: "满规模容斥" },
        { input: mk(2000000000, [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53]), category: "performance", scale: 65536, targets: "乘积溢出剪枝", reason: "int 溢出防护(乘积超 n 提前断)" },
        { input: mk(30, [2, 3, 5]), category: "adversarial", targets: "n 恰为全积", reason: "深层交集非零" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(randInt(rng, 1, 3000), pick(randInt(rng, 1, 3))), category: "ordinary", targets: "小区间少质数", reason: "与逐数枚举对拍" });
      return cases;
    },
  },
  AW891: { // Nim 游戏：异或和非零先手胜
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      let x = 0;
      for (let i = 0; i < n; i++) x ^= t[1 + i];
      return x ? "Yes" : "No";
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const zeroXor = (n) => { const arr = Array.from({ length: n - 1 }, () => randInt(rng, 0, 1000000000)); arr.push(arr.reduce((a, b) => a ^ b, 0)); return arr; };
      const cases = [
        { input: mk([0]), category: "boundary", targets: "单空堆", reason: "No" },
        { input: mk([7]), category: "boundary", targets: "单堆必胜", reason: "Yes" },
        { input: mk([5, 5]), category: "special", targets: "对称双堆", reason: "异或 0 必败" },
        { input: mk([0, 0, 0, 0]), category: "special", targets: "全空堆", reason: "No" },
        { input: mk(Array.from({ length: 20000 }, () => randInt(rng, 0, 1000000000))), category: "performance", scale: 100000, targets: "2 万堆线性异或", reason: "满规模" },
        { input: mk(zeroXor(20000)), category: "performance", scale: 100000, targets: "构造异或和为零的大数据", reason: "必败态大规模" },
        { input: mk([2, 3]), category: "adversarial", targets: "样例同款", reason: "Yes" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 12) }, () => randInt(rng, 0, 50))), category: "ordinary", targets: "随机小局面", reason: "定理直接验证" });
      return cases;
    },
  },
  AW892: { // 台阶-Nim：奇数级台阶异或
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      let x = 0;
      for (let i = 1; i <= n; i += 2) x ^= t[i];
      return x ? "Yes" : "No";
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([3]), category: "boundary", targets: "单级台阶", reason: "奇数级 Yes" },
        { input: mk([0, 9]), category: "boundary", targets: "石子全在偶数级", reason: "No" },
        { input: mk([2, 1, 3]), category: "special", targets: "样例同款", reason: "2^3=1 Yes" },
        { input: mk([4, 100, 4]), category: "special", targets: "偶数级大数干扰", reason: "4^4=0 No" },
        { input: mk(Array.from({ length: 20000 }, () => randInt(rng, 0, 1000000000))), category: "performance", scale: 100000, targets: "2 万级台阶", reason: "奇偶分离满规模" },
        { input: mk(Array.from({ length: 19999 }, (_, i) => (i % 2 === 0 ? 7 : 1000000000))), category: "performance", scale: 99999, targets: "奇数级同值偶数级大值", reason: "偶数级必须被忽略" },
        { input: mk([1, 1, 1, 1, 1]), category: "adversarial", targets: "全 1 交错", reason: "1^1^1=1 Yes" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 10) }, () => randInt(rng, 0, 30))), category: "ordinary", targets: "随机台阶", reason: "结论直接验证" });
      return cases;
    },
  },
  AW893: { // 集合-Nim：SG 函数
    solve(input) {
      const t = tokens(input).map(Number);
      const k = t[0];
      const s = t.slice(1, 1 + k);
      const n = t[1 + k];
      const piles = t.slice(2 + k, 2 + k + n);
      const maxH = Math.max(...piles, 0);
      const sg = new Int32Array(maxH + 1).fill(-1);
      for (let x = 0; x <= maxH; x++) {
        const next = new Set();
        for (const step of s) if (x >= step) next.add(sg[x - step]);
        let mex = 0;
        while (next.has(mex)) mex++;
        sg[x] = mex;
      }
      let x = 0;
      for (const h of piles) x ^= sg[h];
      return x ? "Yes" : "No";
    },
    gen(rng) {
      const mk = (s, piles) => `${s.length}\n${s.join(" ")}\n${piles.length}\n${piles.join(" ")}`;
      const cases = [
        { input: mk([1], [1]), category: "boundary", targets: "单步单堆", reason: "拿完即胜 Yes" },
        { input: mk([2], [1]), category: "boundary", targets: "无法行动", reason: "堆小于最小步 No" },
        { input: mk([2, 5], [2, 4, 7]), category: "special", targets: "样例同款", reason: "Yes" },
        { input: mk([1, 2, 3], [6, 6]), category: "special", targets: "对称堆 SG 相消", reason: "同 SG 异或 0" },
        { input: mk(Array.from({ length: 10 }, (_, i) => i + 1), Array.from({ length: 10 }, () => randInt(rng, 0, 10000))), category: "performance", scale: 10000, targets: "SG 表 1 万态×10 步", reason: "mex 计算满负荷" },
        { input: mk([1, 4, 7, 8, 9, 11, 13, 17, 19, 23], Array.from({ length: 10 }, () => 10000)), category: "performance", scale: 10000, targets: "大步集满高度", reason: "SG 周期未知需全算" },
        { input: mk([3], [1, 2]), category: "adversarial", targets: "全堆不可动", reason: "No" },
      ];
      for (let i = 0; i < 5; i++) {
        const s = Array.from(new Set(Array.from({ length: randInt(rng, 1, 4) }, () => randInt(rng, 1, 6))));
        cases.push({ input: mk(s, Array.from({ length: randInt(rng, 1, 5) }, () => randInt(rng, 0, 30))), category: "ordinary", targets: "随机步集小局面", reason: "SG 定理验证" });
      }
      return cases;
    },
  },
  AW894: { // 拆分-Nim：SG(x)=mex{SG(i)^SG(j)} 0≤j≤i<x
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const piles = t.slice(1, 1 + n);
      const maxH = Math.max(...piles, 0);
      const sg = new Int32Array(maxH + 1);
      for (let x = 1; x <= maxH; x++) {
        const next = new Set();
        for (let i = 0; i < x; i++) for (let j = 0; j <= i; j++) next.add(sg[i] ^ sg[j]);
        let mex = 0;
        while (next.has(mex)) mex++;
        sg[x] = mex;
      }
      let x = 0;
      for (const h of piles) x ^= sg[h];
      return x ? "Yes" : "No";
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([0]), category: "boundary", targets: "空堆先手无法动", reason: "No" },
        { input: mk([1]), category: "boundary", targets: "单石拆为两空堆", reason: "Yes" },
        { input: mk([2, 3]), category: "special", targets: "样例同款", reason: "Yes" },
        { input: mk([2, 2]), category: "special", targets: "对称双堆", reason: "SG 相消 No" },
        { input: mk(Array.from({ length: 100 }, () => randInt(rng, 0, 100))), category: "performance", scale: 100, targets: "百堆满高度 SG 表 O(h²) 预算", reason: "拆分枚举密集" },
        { input: mk(Array.from({ length: 100 }, () => 100)), category: "performance", scale: 100, targets: "全顶格高度", reason: "最深 SG 计算" },
        { input: mk([1, 1]), category: "adversarial", targets: "双单石", reason: "SG(1)=1 异或 0 No" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 6) }, () => randInt(rng, 0, 20))), category: "ordinary", targets: "随机小局面", reason: "SG 定理验证" });
      return cases;
    },
  },
};
