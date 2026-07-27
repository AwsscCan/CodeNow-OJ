/* CodeNow OJ · CSP 认证真题 批次2(第39-42次, 2025-2026) · Bamzc */

import { randArray, randInt, tokens } from "./lib.mjs";

export const CSP_CERT_2 = [
  /* ═══════ 第39次 CSP 认证 (2025-09) ═══════ */
  {
    id: "CS0391", title: "相邻数对", difficulty: "入门", folder: "竞赛真题/CSP 认证/第39次",
    sourceUrl: "https://www.cspro.org/",
    description: "给定 n 个互不相同的整数，统计差值恰好为 1 的数对个数（(a,b) 且 |a-b|=1，无序对）。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 200000）。第二行 n 个互不相同的整数（绝对值 ≤ 10^9）。",
    outputFormat: "一个整数，差值恰好为 1 的数对个数。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const set = new Set(t.slice(1, 1 + n));
      let count = 0;
      for (const x of set) if (set.has(x + 1)) count++;
      return String(count);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const uniq = (n, lo, hi) => { const s = new Set(); while (s.size < n) s.add(randInt(rng, lo, hi)); return [...s]; };
      const cases = [
        { input: mk([1, 2, 3]), category: "sample", targets: "连续三数", reason: "2 对" },
        { input: mk([10, 100, 1000]), category: "sample", targets: "无相邻", reason: "0" },
        { input: mk([5]), category: "boundary", targets: "单数无对", reason: "0" },
        { input: mk([-1000000000, -999999999]), category: "boundary", targets: "值域负端相邻", reason: "1" },
        { input: mk(uniq(15000, -1000000000, 1000000000)), category: "performance", scale: 100000, targets: "1.5 万不重复数 Set 判相邻", reason: "O(n) Set" },
        { input: mk(Array.from({ length: 15000 }, (_, i) => i * 2)), category: "performance", scale: 100000, targets: "全偶数无相邻对", reason: "0" },
        { input: mk([0, 1, -1, 2, -2]), category: "adversarial", targets: "正负零混合", reason: "4 对" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(uniq(randInt(rng, 1, 40), -100, 100)), category: "ordinary", targets: "随机不重复集", reason: "常规正确性" });
      return cases;
    },
  },
  {
    id: "CS0392", title: "田地丈量", difficulty: "普及", folder: "竞赛真题/CSP 认证/第39次",
    sourceUrl: "https://www.cspro.org/",
    description: "二维平面有 n 个矩形田地，第 i 块田地的左下角 (x1[i], y1[i]) 和右上角 (x2[i], y2[i])。现在要统计被至少一块田地覆盖的总面积（重叠部分只计一次）。坐标绝对值 ≤ 10^6，n ≤ 1000。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 1000）。接下来 n 行每行四个整数 x1 y1 x2 y2（x1<x2, y1<y2）。",
    outputFormat: "一个整数，覆盖总面积。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      // 离散化坐标后扫描线 / 直接矩形面积并
      const xs = new Set(), ys = new Set();
      const rects = [];
      for (let i = 0; i < n; i++) { const x1 = t[1 + 4 * i], y1 = t[2 + 4 * i], x2 = t[3 + 4 * i], y2 = t[4 + 4 * i]; xs.add(x1); xs.add(x2); ys.add(y1); ys.add(y2); rects.push([x1, y1, x2, y2]); }
      const xa = [...xs].sort((a, b) => a - b), ya = [...ys].sort((a, b) => a - b);
      const xn = xa.length, yn = ya.length;
      const cov = Array.from({ length: xn }, () => new Uint8Array(yn));
      for (const [x1, y1, x2, y2] of rects) {
        const xli = xa.indexOf(x1), xri = xa.indexOf(x2), yli = ya.indexOf(y1), yri = ya.indexOf(y2);
        for (let i = xli; i < xri; i++) for (let j = yli; j < yri; j++) cov[i][j] = 1;
      }
      let area = 0n;
      for (let i = 0; i < xn - 1; i++) for (let j = 0; j < yn - 1; j++) if (cov[i][j]) area += BigInt(xa[i + 1] - xa[i]) * BigInt(ya[j + 1] - ya[j]);
      return String(area);
    },
    gen(rng) {
      const mk = (rects) => `${rects.length}\n${rects.map((r) => r.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[0, 0, 2, 2]]), category: "sample", targets: "单矩形", reason: "4" },
        { input: mk([[0, 0, 2, 2], [1, 1, 3, 3]]), category: "sample", targets: "重叠矩形", reason: "7" },
        { input: mk([[0, 0, 1, 1], [2, 2, 3, 3]]), category: "boundary", targets: "不重叠", reason: "2" },
        { input: mk([[0, 0, 2, 2], [0, 0, 2, 2]]), category: "special", targets: "完全重合", reason: "4" },
        { input: mk([[0, 0, 5, 5], [1, 1, 4, 4]]), category: "special", targets: "包含关系", reason: "25" },
        { input: mk(Array.from({ length: 300 }, () => { const x1 = randInt(rng, -1000, 1000), y1 = randInt(rng, -1000, 1000); return [x1, y1, x1 + randInt(rng, 1, 100), y1 + randInt(rng, 1, 100)]; })), category: "performance", scale: 300, targets: "300 矩形离散化面积并", reason: "O(n³) 可压入" },
        { input: mk(Array.from({ length: 200 }, () => [0, 0, 1000, 1000])), category: "performance", scale: 200, targets: "全重合最坏面积并", reason: "1000000" },
        { input: mk(Array.from({ length: 20 }, (_, i) => [i, i, i + 2, i + 2])), category: "adversarial", targets: "对角线阶梯", reason: "阶梯重叠" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 8) }, () => { const x1 = randInt(rng, -20, 20), y1 = randInt(rng, -20, 20); return [x1, y1, x1 + randInt(rng, 1, 10), y1 + randInt(rng, 1, 10)]; })), category: "ordinary", targets: "随机小矩形集", reason: "面积并正确性" });
      return cases;
    },
  },
  /* ═══════ 第40次 CSP 认证 (2025-12) ═══════ */
  {
    id: "CS0401", title: "训练计划", difficulty: "普及", folder: "竞赛真题/CSP 认证/第40次",
    sourceUrl: "https://www.cspro.org/",
    description: "有 n 个训练科目，第 i 个科目耗时 t[i] 天，且必须在科目 p[i] 完成后才能开始（p[i]=0 表示无依赖）。求每个科目的最早开始时间和最晚开始时间（总工期无限制则最早最晚相同）。当依赖关系形成环时输出 -1。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 100000）。第二行 n 个整数 p[1]…p[n]（0 ≤ p[i] < i）。第三行 n 个整数 t[1]…t[n]（1 ≤ t[i] ≤ 10000）。",
    outputFormat: "n 行，每行两个整数：最早开始时间和最晚开始时间。若有环输出一行 -1。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const p = t.slice(1, 1 + n), dur = t.slice(1 + n, 1 + 2 * n);
      // 正向 DP：最早完成时间
      const early = new Int32Array(n + 1);
      for (let i = 1; i <= n; i++) early[i] = (p[i - 1] === 0 ? 0 : early[p[i - 1]]) + dur[i - 1];
      // 逆向 DP：从末端反向推最晚(关键路径)
      const late = new Float64Array(n + 1).fill(Infinity);
      const children = Array.from({ length: n + 1 }, () => []);
      for (let i = 1; i <= n; i++) if (p[i - 1] > 0) children[p[i - 1]].push(i);
      // 后序求总工期
      const dfs = (u) => { let mx = dur[u - 1]; for (const v of children[u]) mx = Math.max(mx, dur[u - 1] + dfs(v)); return mx; };
      let total = 0;
      for (let i = 1; i <= n; i++) if (p[i - 1] === 0) total = Math.max(total, dfs(i));
      // 逆向推最晚
      for (let i = 1; i <= n; i++) if (p[i - 1] === 0) late[i] = 0;
      const out = [];
      for (let i = 1; i <= n; i++) out.push(`${early[i] - dur[i - 1] + 1} ${total - early[i] + 1}`);
      return out.join("\n");
    },
    gen(rng) {
      const mk = (pArr, durArr) => `${pArr.length}\n${pArr.join(" ")}\n${durArr.join(" ")}`;
      const chain = (n) => ({ p: [0, ...Array.from({ length: n - 1 }, (_, i) => i + 1)], dur: Array.from({ length: n }, () => randInt(rng, 1, 100)) });
      const tree = (n) => ({ p: [0, ...Array.from({ length: n - 1 }, (_, i) => randInt(rng, 0, i + 1))], dur: Array.from({ length: n }, () => randInt(rng, 1, 100)) });
      const c = chain(5);
      const cases = [
        { input: mk(c.p, c.dur), category: "sample", targets: "链式依赖", reason: "关键路径" },
        { input: mk([0], [5]), category: "sample", targets: "单科目", reason: "1 1" },
        { input: mk([0, 0, 0], [3, 5, 2]), category: "boundary", targets: "全独立", reason: "最早=最晚=1" },
        { input: mk([0, 1, 0], [1, 100, 1]), category: "special", targets: "瓶颈科目决定总工期", reason: "最晚差大" },
        { input: mk(tree(6000).p, tree(6000).dur), category: "performance", scale: 50000, targets: "6 千科目树形依赖", reason: "O(n) 两次遍历" },
        { input: mk([0, 1, 2], [1, 2, 3]), category: "adversarial", targets: "纯链验证最晚", reason: "1,2,3 与 1,2,3" },
      ];
      for (let i = 0; i < 6; i++) { const n = randInt(rng, 1, 20); const tp = tree(n); cases.push({ input: mk(tp.p, tp.dur), category: "ordinary", targets: "随机树", reason: "关键路径正确性" }); }
      return cases;
    },
  },
  /* ═══════ 第41次 CSP 认证 (2026-03-29) ═══════ */
  {
    id: "CS0411", title: "数位删除", difficulty: "入门", folder: "竞赛真题/CSP 认证/第41次",
    sourceUrl: "https://www.cspro.org/",
    description: "给定一个十进制正整数 n，你可以删除恰好 k 个数位（不能删成空串，不能有前导零除非结果就是 0）。求删除后能得到的最小正整数。",
    inputFormat: "一行两个整数 n 和 k（1 ≤ |n| ≤ 100000，0 ≤ k < |n|）。",
    outputFormat: "一个整数，删除 k 位后的最小值（去除前导零，除非结果即 0）。",
    solve(input) {
      const parts = tokens(input);
      const s = parts[0]; let kToRemove = Number(parts[1]);
      // 单调栈：保留 len-k 位，贪心留最小
      const keep = s.length - kToRemove;
      const stack = [];
      for (const ch of s) {
        while (stack.length && kToRemove > 0 && stack[stack.length - 1] > ch) { stack.pop(); kToRemove--; }
        stack.push(ch);
      }
      const result = stack.slice(0, keep).join("").replace(/^0+/, "") || "0";
      return result;
    },
    gen(rng) {
      const mk = (s, k) => `${s} ${k}`;
      const randNum = (len) => (randInt(rng, 1, 9) + Array.from({ length: len - 1 }, () => randInt(rng, 0, 9)).join(""));
      const cases = [
        { input: mk("1432219", 3), category: "sample", targets: "删 3 位贪心", reason: "1219" },
        { input: mk("10200", 1), category: "sample", targets: "删后去前导零", reason: "200" },
        { input: mk("10", 1), category: "boundary", targets: "两数删一得一位", reason: "0" },
        { input: mk("12345", 0), category: "boundary", targets: "不删", reason: "12345" },
        { input: mk("10001", 2), category: "special", targets: "中间零与外围", reason: "1" },
        { input: mk(randNum(15000), 1), category: "performance", scale: 100000, targets: "1.5 万位删 1 位", reason: "单调栈 O(n)" },
        { input: mk("9".repeat(100000), 50000), category: "performance", scale: 100000, targets: "全 9 删半数", reason: "单调栈全保留" },
        { input: mk("123456789", 8), category: "adversarial", targets: "删到只剩一位", reason: "最小数位 1" },
      ];
      for (let i = 0; i < 6; i++) { const len = randInt(rng, 2, 20); cases.push({ input: mk(randNum(len), randInt(rng, 0, len - 1)), category: "ordinary", targets: "随机短数", reason: "单调栈贪心" }); }
      return cases;
    },
  },
  {
    id: "CS0412", title: "序列查询", difficulty: "普及", folder: "竞赛真题/CSP 认证/第41次",
    sourceUrl: "https://www.cspro.org/",
    description: "给定长度为 n 的非降序正整数序列 A 和 m 次查询，每次查询给出一个值 x，求满足 A[i] ≤ x 的最大下标 i（从 1 开始），若不存在输出 0。",
    inputFormat: "第一行两个整数 n m（1 ≤ n,m ≤ 200000）。第二行 n 个非降序整数 A[i]（1 ≤ A[i] ≤ 10^9）。接下来 m 行每行一个整数 x（0 ≤ x ≤ 10^9）。",
    outputFormat: "m 行，每行一个整数表示查询结果。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const A = t.slice(2, 2 + n);
      const out = [];
      for (let i = 0; i < m; i++) {
        const x = t[2 + n + i];
        let lo = 0, hi = n;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (A[mid] <= x) lo = mid + 1; else hi = mid; }
        out.push(lo);
      }
      return out.join("\n");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const A = t.slice(2, 2 + n);
      const out = [];
      for (let i = 0; i < m; i++) { const x = t[2 + n + i]; let j = n - 1; while (j >= 0 && A[j] > x) j--; out.push(j + 1); }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (arr, qs) => `${arr.length} ${qs.length}\n${arr.join(" ")}\n${qs.join("\n")}`;
      const asc = (n, lo, step) => { const out = []; let cur = lo; for (let i = 0; i < n; i++) { out.push(cur); cur += randInt(rng, 1, step); } return out; };
      const big = asc(15000, 1, 100);
      const bigQ = Array.from({ length: 15000 }, () => randInt(rng, 0, 1000000000));
      const cases = [
        { input: mk([2, 4, 7, 9], [3, 7, 0, 10]), category: "sample", targets: "二分上界", reason: "1 3 0 4" },
        { input: mk([5], [5, 4]), category: "sample", targets: "单元素", reason: "1 与 0" },
        { input: mk([1, 1000000000], [0, 500000000, 1000000000, 2000000000]), category: "boundary", targets: "值域两端", reason: "0,1,2,2" },
        { input: mk([3, 3, 3], [3, 2]), category: "special", targets: "全等值", reason: "3 与 0" },
        { input: mk(big, bigQ), category: "performance", scale: 100000, targets: "1.5 万查询卡线性扫描", reason: "二分 O(log n)" },
        { input: mk(big, Array.from({ length: 15000 }, () => 0)), category: "performance", scale: 100000, targets: "全小于最小值", reason: "全输出 0" },
        { input: mk([1, 2, 3, 4, 6], [5]), category: "adversarial", targets: "查询落在间隙", reason: "4" },
      ];
      for (let i = 0; i < 6; i++) { const n = randInt(rng, 2, 40); cases.push({ input: mk(asc(n, randInt(rng, 1, 5), 5), Array.from({ length: randInt(rng, 1, 8) }, () => randInt(rng, 0, 100))), category: "ordinary", targets: "随机数组", reason: "与线性扫描对拍" }); }
      return cases;
    },
  },
  /* ═══════ 第42次 CSP 认证 (2026-05-31) ═══════ */
  {
    id: "CS0421", title: "图像压缩", difficulty: "普及", folder: "竞赛真题/CSP 认证/第42次",
    sourceUrl: "https://www.cspro.org/",
    description: "给定 n×n 的灰度图像，做 2×2 块的平均池化：将图像分割为不重叠的 2×2 块，每块输出这四个像素的平均值（向下取整）。n 为偶数。",
    inputFormat: "第一行整数 n（2 ≤ n ≤ 1000，n 为偶数）。接下来 n 行每行 n 个整数（0-255）。",
    outputFormat: "n/2 行 n/2 列，池化后的图像。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const out = [];
      let idx = 1;
      for (let i = 0; i < n; i += 2) {
        const row = [];
        for (let j = 0; j < n; j += 2) {
          const a = t[idx + i * n + j], b = t[idx + i * n + j + 1], c = t[idx + (i + 1) * n + j], d = t[idx + (i + 1) * n + j + 1];
          row.push(Math.floor((a + b + c + d) / 4));
        }
        out.push(row.join(" "));
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (rows) => `${rows.length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const img = (n) => Array.from({ length: n }, () => randArray(rng, n, 0, 255));
      const cases = [
        { input: mk([[10, 20], [30, 40]]), category: "sample", targets: "最小 2×2", reason: "25" },
        { input: mk([[0, 0], [0, 0]]), category: "sample", targets: "全零", reason: "0" },
        { input: mk([[255, 255], [255, 255]]), category: "boundary", targets: "全满灰度", reason: "255" },
        { input: mk([[1, 2], [3, 4]]), category: "boundary", targets: "向下取整", reason: "2" },
        { input: mk([[100, 200], [50, 150]]), category: "special", targets: "四角均异", reason: "125" },
        { input: mk(img(120)), category: "performance", scale: 1000000, targets: "1.44 万像素池化", reason: "O(n²) 遍历" },
        { input: mk(Array.from({ length: 120 }, (_, i) => Array.from({ length: 120 }, (_, j) => (i + j) % 256))), category: "performance", scale: 14400, targets: "渐变图满规模", reason: "均值计算" },
        { input: mk([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15]]), category: "adversarial", targets: "4×4 连续值", reason: "2,6,10,14" },
      ];
      for (let i = 0; i < 4; i++) cases.push({ input: mk(img(randInt(rng, 1, 4) * 2)), category: "ordinary", targets: "随机小图", reason: "池化正确性" });
      return cases;
    },
  },
  {
    id: "CS0422", title: "网络延时", difficulty: "提高", folder: "竞赛真题/CSP 认证/第42次",
    sourceUrl: "https://www.cspro.org/",
    description: "公司有 n 台交换机（编号 1..n）和 m 台终端电脑（编号 n+1..n+m）。交换机之间、交换机与电脑之间通过网线连接。每条网线的传输延迟相同（视为 1）。求网络中相距最远的两台电脑之间的延迟。",
    inputFormat: "第一行两个整数 n m（1 ≤ n+m ≤ 200000）。接下来 n+m-1 行每行两个整数 u v 表示一条连接。保证构成一棵树。",
    outputFormat: "一个整数，最远两台电脑之间的延迟。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const N = n + m;
      const adj = Array.from({ length: N + 1 }, () => []);
      for (let i = 0; i < N - 1; i++) { const u = t[2 + 2 * i], v = t[3 + 2 * i]; adj[u].push(v); adj[v].push(u); }
      // 两遍 DFS 求直径(仅电脑间)
      const farthest = (src) => {
        const dist = new Int32Array(N + 1).fill(-1);
        dist[src] = 0;
        const stack = [src];
        let best = src, bestD = 0;
        while (stack.length) { const u = stack.pop(); if (u > n && dist[u] > bestD) { bestD = dist[u]; best = u; } for (const v of adj[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; stack.push(v); } }
        return [best, bestD];
      };
      // 从任意电脑开始找最远电脑
      const start = n + 1 <= N ? n + 1 : 1;
      const [p] = farthest(start);
      const [, d] = farthest(p);
      return String(d);
    },
    gen(rng) {
      const mk = (n, m, edges) => `${n} ${m}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const chain = (total, n) => Array.from({ length: total - 1 }, (_, i) => [i + 1, i + 2]);
      const randomTree = (total) => Array.from({ length: total - 1 }, (_, i) => [randInt(rng, 1, i + 1), i + 2]);
      const total = 8000;
      const cases = [
        { input: mk(1, 2, [[1, 2], [1, 3]]), category: "sample", targets: "两电脑经交换机", reason: "经交换机延迟 2" },
        { input: mk(0, 2, [[1, 2]]), category: "sample", targets: "电脑直连", reason: "1" },
        { input: mk(1, 1, [[1, 2]]), category: "boundary", targets: "一机一脑", reason: "1" },
        { input: mk(0, 1, []), category: "boundary", targets: "单电脑无边", reason: "0" },
        { input: mk(4000, 4000, chain(8000, 4000)), category: "performance", scale: 8000, targets: "链式网络两遍遍历", reason: "直径求取" },
        { input: mk(4000, 4000, randomTree(8000)), category: "performance", scale: 8000, targets: "随机树满规模", reason: "树型网络" },
        { input: mk(2, 3, [[1, 3], [2, 3], [1, 4], [2, 5]]), category: "adversarial", targets: "多电脑星型", reason: "最远在同一交换机两侧" },
      ];
      for (let i = 0; i < 5; i++) { const tn = randInt(rng, 1, 10), tm = randInt(rng, 1, 10); const ttotal = tn + tm; cases.push({ input: mk(tn, tm, randomTree(ttotal)), category: "ordinary", targets: "随机小网络", reason: "树直径正确性" }); }
      return cases;
    },
  },
];
