/* CodeNow OJ · 经典题库扩容(下)：进阶 DP/图论/数论/字符串/模拟 · Bamzc */

import { randArray, randInt, shuffle, tokens } from "./lib.mjs";

const MOD = 1000000007n;

export const CLASSIC_DEFS_3 = [
  {
    id: "CL019", title: "最大公约数与最小公倍数", difficulty: "入门", folder: "经典题库/数论进阶",
    description: "给定两个正整数 a 和 b，求它们的最大公约数（gcd）与最小公倍数（lcm）。可用欧几里得算法。",
    inputFormat: "一行两个整数 a 和 b（1 ≤ a, b ≤ 1000000000）。",
    outputFormat: "一行两个整数：最大公约数与最小公倍数（保证最小公倍数在 64 位范围内）。",
    solve(input) {
      const [a, b] = tokens(input).map(Number);
      const gcd = (x, y) => { while (y) { [x, y] = [y, x % y]; } return x; };
      const g = gcd(a, b);
      return `${g} ${BigInt(a) / BigInt(g) * BigInt(b)}`;
    },
    gen(rng) {
      const cases = [
        { input: "6 4", category: "sample", targets: "基础互约", reason: "gcd 2 lcm 12" },
        { input: "1 1", category: "boundary", targets: "最小值", reason: "1 1" },
        { input: "1000000000 1000000000", category: "boundary", targets: "上界同值", reason: "lcm 需大整数" },
        { input: "1 1000000000", category: "special", targets: "互质极端", reason: "lcm 为乘积" },
        { input: "999999937 999999937", category: "special", targets: "大质数同值", reason: "gcd 即自身" },
        { input: "1000000000 999999999", category: "performance", scale: 2, targets: "相邻大数辗转", reason: "互质 lcm 近 1e18" },
        { input: "832040 514229", category: "adversarial", targets: "斐波那契相邻辗转最深", reason: "欧几里得步数最多" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: `${randInt(rng, 1, 10000)} ${randInt(rng, 1, 10000)}`, category: "ordinary", targets: "随机数对", reason: "常规正确性" });
      return cases;
    },
  },
  {
    id: "CL020", title: "组合数取模", difficulty: "普及", folder: "经典题库/数论进阶",
    description: "给定 n 和 m，求组合数 C(n, m) 对 1000000007 取模的结果。约定当 m < 0 或 m > n 时结果为 0。",
    inputFormat: "一行两个整数 n 和 m（0 ≤ n ≤ 1000000，-1 ≤ m ≤ 1000000）。",
    outputFormat: "一个整数，C(n, m) mod 1000000007。",
    solve(input) {
      const [n, m] = tokens(input).map(Number);
      if (m < 0 || m > n) return "0";
      const powMod = (a, b, p) => { a %= p; let r = 1n; while (b > 0n) { if (b & 1n) r = r * a % p; a = a * a % p; b >>= 1n; } return r; };
      let numer = 1n, denom = 1n;
      const k = Math.min(m, n - m);
      for (let i = 0; i < k; i++) { numer = numer * BigInt(n - i) % MOD; denom = denom * BigInt(i + 1) % MOD; }
      return String(numer * powMod(denom, MOD - 2n, MOD) % MOD);
    },
    brute(input) {
      const [n, m] = tokens(input).map(Number);
      if (m < 0 || m > n) return "0";
      const dp = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0n));
      for (let i = 0; i <= n; i++) { dp[i][0] = 1n; for (let j = 1; j <= i; j++) dp[i][j] = (dp[i - 1][j - 1] + dp[i - 1][j]) % MOD; }
      return String(dp[n][m]);
    },
    gen(rng) {
      const cases = [
        { input: "5 2", category: "sample", targets: "基础组合", reason: "10" },
        { input: "0 0", category: "boundary", targets: "C(0,0)", reason: "1" },
        { input: "10 0", category: "boundary", targets: "取零个", reason: "1" },
        { input: "5 -1", category: "boundary", targets: "m 为负", reason: "0" },
        { input: "3 5", category: "special", targets: "m 超过 n", reason: "0" },
        { input: "1000000 500000", category: "performance", scale: 1000000, targets: "百万级卡阶乘 O(n) 逆元", reason: "费马小定理" },
        { input: "1000000 1", category: "performance", scale: 1000000, targets: "取一个的大 n", reason: "答案 n mod p" },
        { input: "62 31", category: "adversarial", targets: "中等 n 跨取模边界", reason: "C(62,31) 超 1e9+7" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 0, 60); cases.push({ input: `${n} ${randInt(rng, 0, n)}`, category: "ordinary", targets: "随机小组合", reason: "与杨辉三角对拍" }); }
      return cases;
    },
  },
  {
    id: "CL021", title: "树的直径", difficulty: "提高", folder: "经典题库/图论进阶",
    description: "给定一棵 n 个节点的带权无向树，求树的直径（任意两点间最短路径的最大值）。",
    inputFormat: "第一行一个整数 n（1 ≤ n ≤ 100000）。接下来 n-1 行，每行三个整数 u v w，表示 u 与 v 间有一条权值为 w 的边（1 ≤ w ≤ 10000）。",
    outputFormat: "一个整数，树的直径。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const head = new Int32Array(n + 1).fill(-1);
      const nxt = new Int32Array(2 * Math.max(1, n - 1)), to = new Int32Array(2 * Math.max(1, n - 1)), wt = new Int32Array(2 * Math.max(1, n - 1));
      let ec = 0;
      const add = (a, b, w) => { to[ec] = b; wt[ec] = w; nxt[ec] = head[a]; head[a] = ec++; };
      for (let i = 0; i < n - 1; i++) { const u = t[1 + 3 * i], v = t[2 + 3 * i], w = t[3 + 3 * i]; add(u, v, w); add(v, u, w); }
      // 两次 BFS/DFS 求直径(迭代栈防爆)
      const farthest = (src) => {
        const dist = new Float64Array(n + 1).fill(-1);
        dist[src] = 0;
        const stack = [src];
        let best = src, bestD = 0;
        while (stack.length) {
          const u = stack.pop();
          if (dist[u] > bestD) { bestD = dist[u]; best = u; }
          for (let e = head[u]; e !== -1; e = nxt[e]) if (dist[to[e]] < 0) { dist[to[e]] = dist[u] + wt[e]; stack.push(to[e]); }
        }
        return [best, bestD];
      };
      if (n === 1) return "0";
      const [p] = farthest(1);
      const [, d] = farthest(p);
      return String(d);
    },
    gen(rng) {
      const mk = (n, edges) => `${n}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const chain = (n, w) => Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 2, w]);
      const randomTree = (n) => Array.from({ length: n - 1 }, (_, i) => [randInt(rng, 1, i + 1), i + 2, randInt(rng, 1, 10000)]);
      const cases = [
        { input: mk(1, []), category: "sample", targets: "单点树", reason: "直径 0" },
        { input: mk(2, [[1, 2, 5]]), category: "sample", targets: "单边", reason: "直径 5" },
        { input: mk(4, [[1, 2, 1], [2, 3, 1], [2, 4, 1]]), category: "special", targets: "星型偏心", reason: "两叶间为 2" },
        { input: mk(5, chain(5, 3)), category: "special", targets: "链的直径", reason: "4 段共 12" },
        { input: mk(12000, chain(12000, 1)), category: "performance", scale: 100000, targets: "长链卡递归 DFS 爆栈(1.2 万点)", reason: "迭代求直径" },
        { input: mk(12000, randomTree(12000)), category: "performance", scale: 100000, targets: "随机树满规模", reason: "两遍遍历" },
        { input: mk(7, [[1, 2, 10], [1, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 10], [3, 7, 2]]), category: "adversarial", targets: "直径不过根", reason: "端点在子树深处" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 30); cases.push({ input: mk(n, shuffle(rng, randomTree(n))), category: "ordinary", targets: "乱序边随机树", reason: "常规正确性" }); }
      return cases;
    },
  },
  {
    id: "CL022", title: "拓扑排序字典序最小", difficulty: "提高", folder: "经典题库/图论进阶",
    description: "给定 n 个点 m 条边的有向无环图，求字典序最小的拓扑序列。保证图无环。",
    inputFormat: "第一行两个整数 n 和 m（1 ≤ n ≤ 100000，0 ≤ m ≤ 200000）。接下来 m 行，每行两个整数 x y 表示有向边 x→y。",
    outputFormat: "一行 n 个整数，字典序最小的拓扑序列。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const adj = Array.from({ length: n + 1 }, () => []);
      const indeg = new Int32Array(n + 1);
      for (let i = 0; i < m; i++) { const x = t[2 + 2 * i], y = t[3 + 2 * i]; adj[x].push(y); indeg[y]++; }
      // 小根堆保证字典序最小
      const heap = [];
      const push = (v) => { heap.push(v); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p] <= heap[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
      const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let s = i; const l = 2 * i + 1, r = 2 * i + 2; if (l < heap.length && heap[l] < heap[s]) s = l; if (r < heap.length && heap[r] < heap[s]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
      for (let v = 1; v <= n; v++) if (!indeg[v]) push(v);
      const order = [];
      while (heap.length) { const u = pop(); order.push(u); for (const v of adj[u]) if (--indeg[v] === 0) push(v); }
      return order.join(" ");
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const dag = (n, m) => Array.from({ length: m }, () => { const a = randInt(rng, 1, n - 1); return [a, randInt(rng, a + 1, n)]; });
      const cases = [
        { input: mk(3, []), category: "sample", targets: "无边按编号", reason: "1 2 3" },
        { input: mk(3, [[3, 1], [2, 1]]), category: "sample", targets: "字典序优先小编号", reason: "2 3 1" },
        { input: mk(1, []), category: "boundary", targets: "单点", reason: "1" },
        { input: mk(4, [[1, 2], [1, 3], [1, 4]]), category: "special", targets: "同源多后继", reason: "1 2 3 4" },
        { input: mk(5, [[5, 4], [4, 3], [3, 2], [2, 1]]), category: "special", targets: "编号与拓扑逆置", reason: "5 4 3 2 1" },
        { input: mk(12001, Array.from({ length: 12000 }, (_, i) => [i + 1, i + 2])), category: "performance", scale: 100000, targets: "长链满规模", reason: "堆优化拓扑" },
        { input: mk(12000, dag(12000, 24000)), category: "performance", scale: 200000, targets: "随机 DAG 20 万边", reason: "小根堆吞吐" },
        { input: mk(6, [[1, 4], [2, 4], [3, 4], [4, 5], [4, 6]]), category: "adversarial", targets: "汇聚再分叉", reason: "1 2 3 4 5 6" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 20); cases.push({ input: mk(n, dag(n, randInt(rng, 0, 20))), category: "ordinary", targets: "随机小 DAG", reason: "字典序拓扑" }); }
      return cases;
    },
  },
  {
    id: "CL023", title: "最长回文子串", difficulty: "普及", folder: "经典题库/字符串进阶",
    description: "给定一个由小写字母组成的字符串，求其最长回文子串的长度。回文串指正读反读都相同的字符串。",
    inputFormat: "一行一个非空字符串，长度不超过 100000。",
    outputFormat: "一个整数，最长回文子串的长度。",
    solve(input) {
      const s = input.trim();
      // Manacher
      const t = `^#${s.split("").join("#")}#$`;
      const n = t.length;
      const p = new Int32Array(n);
      let center = 0, right = 0, best = 0;
      for (let i = 1; i < n - 1; i++) {
        if (i < right) p[i] = Math.min(right - i, p[2 * center - i]);
        while (t[i + p[i] + 1] === t[i - p[i] - 1]) p[i]++;
        if (i + p[i] > right) { center = i; right = i + p[i]; }
        if (p[i] > best) best = p[i];
      }
      return String(best);
    },
    brute(input) {
      const s = input.trim();
      const n = s.length;
      let best = n ? 1 : 0;
      const expand = (l, r) => { while (l >= 0 && r < n && s[l] === s[r]) { best = Math.max(best, r - l + 1); l--; r++; } };
      for (let i = 0; i < n; i++) { expand(i, i); expand(i, i + 1); }
      return String(best);
    },
    gen(rng) {
      const rs = (n, k) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz"[randInt(rng, 0, k - 1)]).join("");
      const cases = [
        { input: "abcba", category: "sample", targets: "基础奇回文", reason: "整串即回文 5" },
        { input: "a", category: "boundary", targets: "单字符", reason: "1" },
        { input: "ab", category: "boundary", targets: "无长回文", reason: "1" },
        { input: "aaaa", category: "special", targets: "全同字符", reason: "4" },
        { input: "abacaba", category: "special", targets: "奇回文", reason: "7" },
        { input: "a".repeat(40000), category: "performance", scale: 100000, targets: "全同字符卡 O(n²) 扩展", reason: "Manacher 线性" },
        { input: rs(40000, 2), category: "performance", scale: 100000, targets: "二字符高频回文", reason: "大量中心扩展" },
        { input: `${rs(500, 3)}${rs(500, 3).split("").reverse().join("")}`, category: "adversarial", targets: "首尾镜像近回文", reason: "长回文藏中间" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: rs(randInt(rng, 2, 60), 3), category: "ordinary", targets: "小值域随机", reason: "与中心扩展对拍" });
      return cases;
    },
  },
  {
    id: "CL024", title: "字符串最小表示", difficulty: "提高", folder: "经典题库/字符串进阶",
    description: "给定一个字符串，把它看成一个环（可以从任意位置断开展成线性串），求所有旋转中字典序最小的那个，输出它的起始下标（从 0 开始，多个取最小下标）。",
    inputFormat: "一行一个由小写字母组成的非空字符串，长度不超过 100000。",
    outputFormat: "一个整数，字典序最小旋转的起始下标。",
    solve(input) {
      const s = input.trim();
      const n = s.length;
      let i = 0, j = 1, k = 0;
      while (i < n && j < n && k < n) {
        const a = s[(i + k) % n], b = s[(j + k) % n];
        if (a === b) { k++; continue; }
        if (a > b) i += k + 1; else j += k + 1;
        if (i === j) j++;
        k = 0;
      }
      return String(Math.min(i, j));
    },
    brute(input) {
      const s = input.trim();
      const n = s.length;
      let best = 0, bestStr = s;
      for (let i = 1; i < n; i++) {
        const rot = s.slice(i) + s.slice(0, i);
        if (rot < bestStr) { bestStr = rot; best = i; }
      }
      return String(best);
    },
    gen(rng) {
      const rs = (n, k) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz"[randInt(rng, 0, k - 1)]).join("");
      const cases = [
        { input: "bca", category: "sample", targets: "基础旋转", reason: "abc 起于下标 1" },
        { input: "a", category: "boundary", targets: "单字符", reason: "0" },
        { input: "aaaa", category: "boundary", targets: "全同字符取最小下标", reason: "0" },
        { input: "cba", category: "special", targets: "逆序串", reason: "最小旋转起于 2(acb)" },
        { input: "abab", category: "special", targets: "周期串", reason: "起于 0" },
        { input: rs(40000, 2), category: "performance", scale: 100000, targets: "二字符大串卡 O(n²) 逐旋比较", reason: "线性最小表示" },
        { input: "a".repeat(39999) + "b", category: "performance", scale: 100000, targets: "近全同带扰动", reason: "指针大量前进" },
        { input: `ba${"a".repeat(1000)}`, category: "adversarial", targets: "前缀劣后缀优", reason: "最小旋转跳到 a 段" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: rs(randInt(rng, 2, 50), 3), category: "ordinary", targets: "小值域随机", reason: "与逐旋暴力对拍" });
      return cases;
    },
  },
  {
    id: "CL025", title: "矩阵快速幂求斐波那契", difficulty: "提高", folder: "经典题库/数论进阶",
    description: "用矩阵快速幂求斐波那契数列第 n 项对 1000000007 取模的值。F(1)=1, F(2)=1。",
    inputFormat: "一行一个整数 n（1 ≤ n ≤ 10^18）。",
    outputFormat: "一个整数，F(n) mod 1000000007。",
    solve(input) {
      let n = BigInt(tokens(input)[0]);
      const mul = (A, B) => [
        [(A[0][0] * B[0][0] + A[0][1] * B[1][0]) % MOD, (A[0][0] * B[0][1] + A[0][1] * B[1][1]) % MOD],
        [(A[1][0] * B[0][0] + A[1][1] * B[1][0]) % MOD, (A[1][0] * B[0][1] + A[1][1] * B[1][1]) % MOD],
      ];
      let result = [[1n, 0n], [0n, 1n]];
      let base = [[1n, 1n], [1n, 0n]];
      let p = n - 1n;
      while (p > 0n) { if (p & 1n) result = mul(result, base); base = mul(base, base); p >>= 1n; }
      return String(result[0][0]);
    },
    brute(input) {
      const n = Number(tokens(input)[0]);
      if (n <= 2) return "1";
      let a = 1n, b = 1n;
      for (let i = 3; i <= n; i++) { const c = (a + b) % MOD; a = b; b = c; }
      return String(b);
    },
    gen(rng) {
      const cases = [
        { input: "1", category: "sample", targets: "首项", reason: "1" },
        { input: "10", category: "sample", targets: "第十项", reason: "55" },
        { input: "2", category: "boundary", targets: "第二项", reason: "1" },
        { input: "90", category: "special", targets: "超 64 位溢出点", reason: "必须取模" },
        { input: "1000000000000000000", category: "performance", scale: 2, targets: "1e18 卡线性递推 O(n)", reason: "矩阵快速幂 O(log n)" },
        { input: "999999999999999999", category: "performance", scale: 2, targets: "近上界复验", reason: "60 轮矩阵幂" },
        { input: "1000000007", category: "adversarial", targets: "n 等于模数", reason: "循环节验证" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: String(randInt(rng, 1, 500)), category: "ordinary", targets: "小 n", reason: "与线性递推对拍" });
      return cases;
    },
  },
  {
    id: "CL026", title: "螺旋矩阵", difficulty: "入门", folder: "经典题库/模拟进阶",
    description: "生成一个 n×n 的矩阵，从左上角开始按顺时针螺旋填入 1 到 n² 的数字，输出该矩阵。",
    inputFormat: "一行一个整数 n（1 ≤ n ≤ 1000）。",
    outputFormat: "n 行，每行 n 个整数，用空格分隔，表示螺旋矩阵。",
    solve(input) {
      const n = Number(tokens(input)[0]);
      const g = Array.from({ length: n }, () => new Array(n).fill(0));
      let top = 0, bottom = n - 1, left = 0, right = n - 1, num = 1;
      while (top <= bottom && left <= right) {
        for (let j = left; j <= right; j++) g[top][j] = num++;
        top++;
        for (let i = top; i <= bottom; i++) g[i][right] = num++;
        right--;
        if (top <= bottom) { for (let j = right; j >= left; j--) g[bottom][j] = num++; bottom--; }
        if (left <= right) { for (let i = bottom; i >= top; i--) g[i][left] = num++; left++; }
      }
      return g.map((row) => row.join(" ")).join("\n");
    },
    gen(rng) {
      const cases = [
        { input: "1", category: "sample", targets: "单元素", reason: "仅 1" },
        { input: "3", category: "sample", targets: "奇数阶", reason: "中心为 9" },
        { input: "2", category: "boundary", targets: "最小偶数阶", reason: "无中心" },
        { input: "4", category: "special", targets: "偶数阶双层", reason: "两圈螺旋" },
        { input: "5", category: "special", targets: "奇数阶多层", reason: "含中心格" },
        { input: "1000", category: "performance", scale: 1000, targets: "百万格满规模输出", reason: "O(n²) 填充" },
        { input: "999", category: "performance", scale: 999, targets: "近上界奇数阶", reason: "边界收缩正确性" },
        { input: "7", category: "adversarial", targets: "多层奇数阶", reason: "层间过渡" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: String(randInt(rng, 1, 12)), category: "ordinary", targets: "随机小阶", reason: "常规正确性" });
      return cases;
    },
  },
];
