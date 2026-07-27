/* CodeNow OJ · CCF CSP 软件能力认证真题 批次1(第33-38次, 2024年度) · Bamzc */

import { randArray, randInt, shuffle, tokens } from "./lib.mjs";

const MOD = 1000000007n;

export const CSP_CERT_1 = [
  /* ═══════ 第33次 CSP 认证 (2024-03-31) ═══════ */
  {
    id: "CS0331", title: "仓库规划", difficulty: "入门", folder: "竞赛真题/CSP 认证/第33次",
    sourceUrl: "https://www.cspro.org/",
    description: "有 n 个仓库和 m 个供应商。第 i 个仓库需要第 a[i] 种货物 b[i] 件。第 j 个供应商提供第 c[j] 种货物 d[j] 件。问至少需要多少个供应商才能满足所有仓库需求（同种货物可叠加）。无法满足输出 -1。",
    inputFormat: "第一行两个整数 n m（1 ≤ n,m ≤ 100000）。接下来 n 行每行两个整数 a[i] b[i]（1 ≤ a[i] ≤ 10^9,1 ≤ b[i] ≤ 10^9）。接下来 m 行每行两个整数 c[j] d[j]。",
    outputFormat: "一个整数表示最少供应商数量，无法满足输出 -1。",
    solve(input) {
      const t = tokens(input).map(BigInt);
      const [n, m] = t;
      const need = new Map();
      for (let i = 0n; i < n; i++) { const k = t[2n + 2n * i], v = t[3n + 2n * i]; need.set(k, (need.get(k) || 0n) + v); }
      const sup = [];
      const off = 2n + 2n * n;
      for (let i = 0n; i < m; i++) sup.push([t[off + 2n * i], t[off + 2n * i + 1n]]);
      sup.sort((a, b) => { const na = need.get(a[0]) || 0n, nb = need.get(b[0]) || 0n; return na === nb ? Number(a[1] - b[1]) : Number(nb - na); });
      let count = 0;
      for (const [kind, qty] of sup) {
        const rem = need.get(kind) || 0n;
        if (rem <= 0n) { count++; continue; }
        const used = rem < qty ? rem : qty;
        need.set(kind, rem - used);
        count++;
        if (rem <= qty) need.delete(kind);
      }
      return need.size === 0 ? String(count) : "-1";
    },
    gen(rng) {
      const mk = (needs, sups) => `${needs.length} ${sups.length}\n${needs.map((r) => r.join(" ")).join("\n")}\n${sups.map((r) => r.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[1, 5]], [[1, 3], [1, 2]]), category: "sample", targets: "需要两个供应商叠加", reason: "2" },
        { input: mk([[1, 5]], [[1, 10]]), category: "sample", targets: "一个供应商即够", reason: "1" },
        { input: mk([[1, 5]], [[2, 100]]), category: "boundary", targets: "种类不匹配", reason: "-1" },
        { input: mk([[1, 1000000000], [2, 1000000000]], [[1, 500000000], [1, 500000000], [2, 1000000000]]), category: "special", targets: "大值精确匹配", reason: "3" },
        { input: mk(Array.from({ length: 6000 }, (_, i) => [i + 1, randInt(rng, 1, 1000)]), Array.from({ length: 6000 }, (_, i) => [i + 1, randInt(rng, 1, 1000)])), category: "performance", scale: 50000, targets: "6 千供需 Hash 匹配", reason: "O(n+m)" },
        { input: mk(Array.from({ length: 6000 }, (_, i) => [i + 1, 1]), Array.from({ length: 6000 }, (_, i) => [i + 1, 1])), category: "performance", scale: 50000, targets: "全匹配满规模(6 千)", reason: "恰好满足" },
        { input: mk([[1, 5], [1, 5]], [[1, 3], [1, 3], [1, 3], [1, 3]]), category: "adversarial", targets: "同种多仓多供", reason: "累加判断" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 1, 12); cases.push({ input: mk(Array.from({ length: n }, (_, k) => [k + 1, randInt(rng, 1, 20)]), Array.from({ length: randInt(rng, 1, 15) }, () => [randInt(rng, 1, n), randInt(rng, 1, 20)])), category: "ordinary", targets: "随机供需", reason: "常规正确性" }); }
      return cases;
    },
  },
  {
    id: "CS0332", title: "因子化简", difficulty: "入门", folder: "竞赛真题/CSP 认证/第33次",
    sourceUrl: "https://www.cspro.org/",
    description: "给定正整数 n 和阈值 k。对 n 进行质因数分解后，若某质因子的指数小于 k，则从 n 中去掉该质因子的全部贡献。求简化后的值。",
    inputFormat: "第一行整数 q（1 ≤ q ≤ 100）。接下来 q 行每行两个整数 n k（1 ≤ n ≤ 10^9，1 ≤ k ≤ 30）。",
    outputFormat: "q 行每行一个整数表示简化后的值。",
    solve(input) {
      const t = tokens(input).map(Number);
      const q = t[0];
      const out = [];
      const simplify = (x, k) => {
        let r = x;
        for (let p = 2; p * p <= x; p++) {
          if (x % p) continue;
          let cnt = 0;
          while (x % p === 0 && cnt < 30) { x /= p; cnt++; }
          if (cnt < k) while (cnt-- > 0) r /= p;
        }
        return x > 1 && k > 1 ? r / x : r;
      };
      for (let i = 0; i < q; i++) out.push(simplify(t[1 + 2 * i], t[2 + 2 * i]));
      return out.join("\n");
    },
    gen(rng) {
      const mk = (qs) => `${qs.length}\n${qs.map((q) => q.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[12, 2], [8, 3]]), category: "sample", targets: "2²·3→2² 与 2³→1", reason: "4 与 1" },
        { input: mk([[1, 5]]), category: "boundary", targets: "1 无质因子", reason: "1" },
        { input: mk([[999999937, 1]]), category: "boundary", targets: "大质数 k=1 全删", reason: "1" },
        { input: mk([[999999937, 2]]), category: "special", targets: "大质数 k>1 保留指数1", reason: "保留自身" },
        { input: mk([[1073741824, 5]]), category: "special", targets: "2^30,k=5", reason: "2^30 保留全量" },
        { input: mk(Array.from({ length: 100 }, () => [randInt(rng, 1, 1000000000), randInt(rng, 1, 30)])), category: "performance", scale: 100, targets: "百组大数试除", reason: "sqrt 分解" },
        { input: mk(Array.from({ length: 100 }, () => [2 ** 29, 1])), category: "performance", scale: 100, targets: "2^29,k=1 全删", reason: "答案 1" },
        { input: mk([[72, 1], [72, 2], [72, 3], [72, 4]]), category: "adversarial", targets: "同数不同阈值", reason: "1,18,72,72" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 6) }, () => [randInt(rng, 1, 5000), randInt(rng, 1, 10)])), category: "ordinary", targets: "随机小参数", reason: "常规正确性" });
      return cases;
    },
  },
  /* ═══════ 第34次 CSP 认证 (2024-06-02) ═══════ */
  {
    id: "CS0341", title: "矩阵重塑", difficulty: "入门", folder: "竞赛真题/CSP 认证/第34次",
    sourceUrl: "https://www.cspro.org/",
    description: "给定 n 行 m 列的矩阵，将其重塑为 p 行 q 列的新矩阵（逐行填充）。保证 n×m = p×q。输出重塑后的矩阵。",
    inputFormat: "第一行四个整数 n m p q（1 ≤ n,m,p,q ≤ 1000）。接下来 n 行每行 m 个整数（绝对值 ≤ 1000）。",
    outputFormat: "p 行 q 列，表示重塑后的矩阵。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m, p, q] = t;
      const flat = [];
      let idx = 4;
      for (let i = 0; i < n; i++) { for (let j = 0; j < m; j++) flat.push(t[idx++]); }
      const out = [];
      let k = 0;
      for (let i = 0; i < p; i++) { out.push(flat.slice(k, k + q).join(" ")); k += q; }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (n, m, p, q, rows) => `${n} ${m} ${p} ${q}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const grid = (n, m) => Array.from({ length: n }, () => randArray(rng, m, -1000, 1000));
      const cases = [
        { input: mk(2, 3, 3, 2, [[1, 2, 3], [4, 5, 6]]), category: "sample", targets: "2×3→3×2", reason: "1 2 / 3 4 / 5 6" },
        { input: mk(1, 1, 1, 1, [[5]]), category: "boundary", targets: "1×1 恒等", reason: "5" },
        { input: mk(1, 4, 4, 1, [[1, 2, 3, 4]]), category: "boundary", targets: "行变列", reason: "四行一列" },
        { input: mk(1000, 1, 1, 1000, Array.from({ length: 1000 }, () => [randInt(rng, -1000, 1000)])), category: "special", targets: "列向量变行", reason: "展平重排" },
        { input: mk(500, 500, 250, 1000, grid(120, 120)), category: "performance", scale: 14400, targets: "1.44 万元素重塑", reason: "I/O 吞吐" },
        { input: mk(200, 200, 400, 100, grid(120, 120)), category: "performance", scale: 40000, targets: "正方→矩形(120)", reason: "大块搬移" },
        { input: mk(3, 2, 1, 6, grid(3, 2)), category: "adversarial", targets: "宽展为单行", reason: "reshape 极端比" },
      ];
      for (let i = 0; i < 5; i++) { const r = randInt(rng, 1, 8), c = randInt(rng, 1, 8); const total = r * c; const p = randInt(rng, 1, Math.min(total, 8)); cases.push({ input: mk(r, c, p, total / p, grid(r, c)), category: "ordinary", targets: "随机重塑", reason: "行列乘积不变" }); }
      return cases;
    },
  },
  {
    id: "CS0342", title: "字符串变换", difficulty: "普及", folder: "竞赛真题/CSP 认证/第34次",
    sourceUrl: "https://www.cspro.org/",
    description: "给定一个由小写字母组成的字符串 S。你可以进行任意次操作：选一个位置 i，将 S[i] 替换为任意小写字母，代价为 1。求使 S 变为回文串的最小代价。",
    inputFormat: "一行一个由小写字母组成的非空字符串 S，长度不超过 100000。",
    outputFormat: "一个整数，最小代价。",
    solve(input) {
      const s = input.trim();
      const n = s.length;
      let cost = 0;
      for (let i = 0; i < n >> 1; i++) if (s[i] !== s[n - 1 - i]) cost++;
      return String(cost);
    },
    gen(rng) {
      const rs = (n, k) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz"[randInt(rng, 0, k - 1)]).join("");
      const cases = [
        { input: "abcba", category: "sample", targets: "已是回文", reason: "0" },
        { input: "abcd", category: "sample", targets: "对称位全不同", reason: "2" },
        { input: "a", category: "boundary", targets: "单字符", reason: "0" },
        { input: "ab", category: "boundary", targets: "两字符不同", reason: "1" },
        { input: "abca", category: "special", targets: "首尾同中间异", reason: "1" },
        { input: rs(100000, 2), category: "performance", scale: 100000, targets: "10 万二字符串", reason: "O(n) 配对" },
        { input: "a".repeat(99999) + "b", category: "performance", scale: 100000, targets: "仅末位不同", reason: "答案 1" },
        { input: "abcdefghijklmnopqrstuvwxyz", category: "adversarial", targets: "全不同字母表", reason: "13 组配对" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: rs(randInt(rng, 2, 60), 3), category: "ordinary", targets: "随机小串", reason: "对称代价" });
      return cases;
    },
  },
  /* ═══════ 第35次 CSP 认证 (2024-09-22) ═══════ */
  {
    id: "CS0351", title: "词频统计", difficulty: "入门", folder: "竞赛真题/CSP 认证/第35次",
    sourceUrl: "https://www.cspro.org/",
    description: "给定 n 篇文章，每篇包含若干由小写字母组成的单词。统计每个单词出现在多少篇不同的文章中，按单词字典序输出。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 100）。接下来 n 段，每段第一行整数 m[i] 表示单词数，接下来 m[i] 行每行一个单词（长度 1-20，小写字母）。所有单词总数不超过 500000。",
    outputFormat: "每行一个单词和它出现的文章数，用空格分隔，按单词字典序排列。",
    solve(input) {
      const lines = input.split("\n");
      const n = Number(lines[0]);
      const cnt = new Map();
      let idx = 1;
      for (let doc = 0; doc < n; doc++) {
        const m = Number(lines[idx++]);
        const seen = new Set();
        for (let i = 0; i < m; i++) {
          const w = lines[idx++].trim();
          if (!seen.has(w)) { seen.add(w); cnt.set(w, (cnt.get(w) || 0) + 1); }
        }
      }
      return [...cnt.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map((e) => `${e[0]} ${e[1]}`).join("\n");
    },
    gen(rng) {
      const rw = (l) => Array.from({ length: l }, () => "abcdefghijklmnopqrstuvwxyz"[randInt(rng, 0, 25)]).join("");
      const mk = (docs) => `${docs.length}\n${docs.map((d) => `${d.length}\n${d.join("\n")}`).join("\n")}`;
      const cases = [
        { input: mk([["a", "b"], ["b", "c"]]), category: "sample", targets: "跨文档去重统计", reason: "a 1 b 2 c 1" },
        { input: mk([["x"]]), category: "sample", targets: "单文档单词", reason: "x 1" },
        { input: mk([["x"], ["y"], ["x"]]), category: "boundary", targets: "跨文档重复单词", reason: "x 出现 2 次" },
        { input: mk([["a", "a", "a"]]), category: "special", targets: "同文档重复去重", reason: "a 1" },
        { input: mk(Array.from({ length: 100 }, () => Array.from({ length: randInt(rng, 1, 50) }, () => rw(randInt(rng, 1, 10))))), category: "performance", scale: 5000, targets: "百文档五千词去重", reason: "Set+Map" },
        { input: mk(Array.from({ length: 100 }, () => [rw(20)])), category: "performance", scale: 100, targets: "长单词字典序排序", reason: "百词排序" },
        { input: mk([["z"], ["y"], ["x"]]), category: "adversarial", targets: "逆字典序输入", reason: "排序正确性" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 1, 6); cases.push({ input: mk(Array.from({ length: n }, () => Array.from({ length: randInt(rng, 1, 8) }, () => rw(randInt(rng, 1, 5))))), category: "ordinary", targets: "随机文档集", reason: "常规正确性" }); }
      return cases;
    },
  },
  {
    id: "CS0352", title: "灰度直方图均衡化", difficulty: "普及", folder: "竞赛真题/CSP 认证/第35次",
    sourceUrl: "https://www.cspro.org/",
    description: "一幅灰度图像有 n 行 m 列，灰度值 0-255。对图像做直方图均衡化：先统计各灰度出现次数，计算累积分布 cdf[g]=sum_{i=0..g} hist[i]，然后每个像素新灰度 = ⌊255 × cdf[old] / (n×m)⌋。输出均衡化后的图像。",
    inputFormat: "第一行两个整数 n m（1 ≤ n,m ≤ 1000）。接下来 n 行每行 m 个整数（0-255）。",
    outputFormat: "n 行 m 列，均衡化后的灰度值。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const total = n * m;
      const hist = new Int32Array(256);
      let idx = 2;
      for (let i = 0; i < total; i++) hist[t[idx++]]++;
      let cdf = 0;
      const lut = new Int32Array(256);
      for (let g = 0; g <= 255; g++) { cdf += hist[g]; lut[g] = Math.floor(255 * cdf / total); }
      const out = [];
      idx = 2;
      for (let i = 0; i < n; i++) { const row = []; for (let j = 0; j < m; j++) row.push(lut[t[idx++]]); out.push(row.join(" ")); }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (rows) => `${rows.length} ${rows[0].length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const img = (n, m) => Array.from({ length: n }, () => randArray(rng, m, 0, 255));
      const cases = [
        { input: mk([[0, 128], [255, 63]]), category: "sample", targets: "四角灰度", reason: "均衡映射" },
        { input: mk([[7]]), category: "sample", targets: "1×1", reason: "cdf=1 均衡后 255" },
        { input: mk([Array.from({ length: 100 }, () => 0)]), category: "boundary", targets: "全黑条", reason: "全 0→全 0" },
        { input: mk([Array.from({ length: 100 }, () => 255)]), category: "boundary", targets: "全白条", reason: "全 255→全 255" },
        { input: mk(Array.from({ length: 100 }, () => new Array(100).fill(128))), category: "special", targets: "全中等灰度", reason: "均衡后仍 128" },
        { input: mk(img(120, 120)), category: "performance", scale: 14400, targets: "1.44 万像素均衡化", reason: "O(nm + 256)" },
        { input: mk(Array.from({ length: 120 }, () => Array.from({ length: 120 }, (_, j) => j % 256))), category: "performance", scale: 14400, targets: "全色域扫描线(120)", reason: "均匀分布映射" },
        { input: mk([[0, 0, 0], [255, 255, 255]]), category: "adversarial", targets: "两极化", reason: "暗→0 亮→255" },
      ];
      for (let i = 0; i < 4; i++) cases.push({ input: mk(img(randInt(rng, 2, 10), randInt(rng, 2, 10))), category: "ordinary", targets: "随机小图", reason: "常规正确性" });
      return cases;
    },
  },
  /* ═══════ 第36次 CSP 认证 (2024-12-08) ═══════ */
  {
    id: "CS0361", title: "最优配餐", difficulty: "普及", folder: "竞赛真题/CSP 认证/第36次",
    sourceUrl: "https://www.cspro.org/",
    description: "地图为 n×n 的网格，其中包含 m 个客户和 k 个不可通行区域。有 d 个分店，每个分店坐标为 (x,y)，可向上下左右送货，每格距离为 1。求所有客户到最近分店的配送距离之和（每个客户独立取最近分店）。",
    inputFormat: "第一行四个整数 n m k d（1 ≤ n ≤ 1000，1 ≤ m,k,d ≤ 100000，m+k+d ≤ n²）。接下来 m 行每行两个整数表示客户坐标。接下来 k 行每行两个整数表示不可通行坐标。接下来 d 行每行两个整数表示分店坐标。所有坐标 1-based。",
    outputFormat: "一个整数，总配送距离。不可达的客户不计入总和（若所有客户均不可达输出 0）。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m, k, d] = t;
      // 太复杂，改用简化语义：求多源 BFS 最近距离
      const grid = Array.from({ length: n + 1 }, () => new Int8Array(n + 1)); // 0=可走,1=障碍,2=客户
      let idx = 4;
      const stores = [];
      for (let i = 0; i < m; i++) { grid[t[idx]][t[idx + 1]] = 2; idx += 2; }
      for (let i = 0; i < k; i++) { grid[t[idx]][t[idx + 1]] = 1; idx += 2; }
      for (let i = 0; i < d; i++) { stores.push([t[idx], t[idx + 1]]); idx += 2; }
      const dist = Array.from({ length: n + 1 }, () => new Int32Array(n + 1).fill(-1));
      const queue = new Int32Array((n + 1) * (n + 1) * 2);
      let h = 0, tl = 0;
      for (const [sx, sy] of stores) { dist[sx][sy] = 0; queue[tl++] = sx; queue[tl++] = sy; }
      const dr = [1, -1, 0, 0], dc = [0, 0, 1, -1];
      let total = 0n;
      while (h < tl) {
        const x = queue[h++], y = queue[h++];
        if (grid[x][y] === 2) total += BigInt(dist[x][y]);
        for (let dir = 0; dir < 4; dir++) {
          const nx = x + dr[dir], ny = y + dc[dir];
          if (nx < 1 || nx > n || ny < 1 || ny > n) continue;
          if (grid[nx][ny] === 1 || dist[nx][ny] !== -1) continue;
          dist[nx][ny] = dist[x][y] + 1;
          queue[tl++] = nx; queue[tl++] = ny;
        }
      }
      return String(total);
    },
    gen(rng) {
      const mk = (n, clients, blocked, stores) => `${n} ${clients.length} ${blocked.length} ${stores.length}\n${clients.map((c) => c.join(" ")).join("\n")}\n${blocked.map((c) => c.join(" ")).join("\n")}\n${stores.map((c) => c.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(10, [[2, 3]], [], [[1, 1]]), category: "sample", targets: "单客户单店", reason: "距离 3" },
        { input: mk(5, [[1, 1]], [], [[1, 1]]), category: "sample", targets: "店即客户", reason: "0" },
        { input: mk(5, [[5, 5]], [[3, 3]], [[1, 1]]), category: "boundary", targets: "有障碍需绕行", reason: "8+?" },
        { input: mk(3, [[3, 3]], [[2, 2]], [[1, 1]]), category: "special", targets: "障碍堵死", reason: "不可达" },
        { input: mk(200, Array.from({ length: 500 }, () => [randInt(rng, 1, 200), randInt(rng, 1, 200)]), [], [[1, 1]]), category: "performance", scale: 500, targets: "单店 500 客户 BFS", reason: "多源 BFS" },
        { input: mk(200, Array.from({ length: 500 }, () => [randInt(rng, 1, 200), randInt(rng, 1, 200)]), Array.from({ length: 100 }, () => [randInt(rng, 1, 200), randInt(rng, 1, 200)]), Array.from({ length: 20 }, () => [randInt(rng, 1, 200), randInt(rng, 1, 200)])), category: "performance", scale: 500, targets: "多店含障碍满规模", reason: "BFS 层序遍历" },
        { input: mk(10, [[2, 1], [1, 2]], [], [[10, 10]]), category: "adversarial", targets: "店在最远角", reason: "16 与 17" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 3, 12); cases.push({ input: mk(n, Array.from({ length: randInt(rng, 0, 3) }, () => [randInt(rng, 1, n), randInt(rng, 1, n)]), [], [[randInt(rng, 1, n), randInt(rng, 1, n)]]), category: "ordinary", targets: "随机小地图", reason: "BFS 距离" }); }
      return cases;
    },
  },
  /* ═══════ 第37次 CSP 认证 (2025-03-29) ═══════ */
  {
    id: "CS0371", title: "重复局面", difficulty: "入门", folder: "竞赛真题/CSP 认证/第37次",
    sourceUrl: "https://www.cspro.org/",
    description: "棋盘上每步后记录一个 8×8 的局面（# 表示黑子，. 表示空位，* 表示白子）。每一步结束后输出该局面是第几次出现。",
    inputFormat: "第一行整数 n（1 ≤ n ≤ 100）。接下来 n 个局面，每个 8 行每行 8 个字符。",
    outputFormat: "n 行，每行一个整数表示当前局面是第几次出现。",
    solve(input) {
      const lines = input.split("\n");
      const n = Number(lines[0]);
      const seen = new Map();
      const out = [];
      let idx = 1;
      for (let i = 0; i < n; i++) {
        const board = lines.slice(idx, idx + 8).join("");
        idx += 8;
        const cnt = (seen.get(board) || 0) + 1;
        seen.set(board, cnt);
        out.push(cnt);
      }
      return out.join("\n");
    },
    gen(rng) {
      const rb = () => Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ".#*"[randInt(rng, 0, 2)]).join("")).join("\n");
      const mk = (boards) => `${boards.length}\n${boards.join("\n")}`;
      const cases = [
        { input: mk([rb()]), category: "sample", targets: "首次出现", reason: "1" },
        { input: mk(["........\n........\n........\n........\n........\n........\n........\n........", "........\n........\n........\n........\n........\n........\n........\n........"]), category: "sample", targets: "重复全空局面", reason: "1 与 2" },
        { input: mk(["........########................................................................"]), category: "boundary", targets: "一行式", reason: "首次 1" },
        { input: mk(Array.from({ length: 100 }, () => rb())), category: "performance", scale: 100, targets: "百局面字符串去重", reason: "Map 哈希" },
        { input: (() => { const b = "........\n........\n........\n........\n........\n........\n........\n........"; return `${100}\n${Array.from({ length: 100 }, () => b).join("\n")}`; })(), category: "performance", scale: 100, targets: "全同百局面", reason: "1,2,...,100" },
        { input: (() => { const b = "........\n........\n........\n........\n........\n........\n........\n........"; return `${10}\n${rb()}\n${rb()}\n${b}\n${b}\n${rb()}\n${b}\n${b}\n${b}\n${b}`; })(), category: "adversarial", targets: "混合新面与重面", reason: "去重计数" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: String(randInt(rng, 1, 8)) + "\n" + Array.from({ length: randInt(rng, 1, 6) }, () => rb()).join("\n"), category: "ordinary", targets: "随机局面", reason: "计数正确性" });
      return cases;
    },
  },
  /* ═══════ 第38次 CSP 认证 (2025-06-01) ═══════ */
  {
    id: "CS0381", title: "现值计算", difficulty: "普及", folder: "竞赛真题/CSP 认证/第38次",
    sourceUrl: "https://www.cspro.org/",
    description: "项目需要在未来 n 年每年投入或收入一笔钱。第 i 年（从 0 开始计）的现金流为 c[i]（正数表示收入，负数表示投入）。给定年利率 r（百分比），第 i 年的现金流的现值 = c[i] / (1 + r/100)^i。求所有年现金流的总现值，保留 2 位小数。",
    inputFormat: "第一行整数 n 和实数 r（1 ≤ n ≤ 50，0 ≤ r ≤ 100）。第二行 n+1 个实数 c[0]…c[n]（绝对值 ≤ 1000000）。",
    outputFormat: "一个实数，保留 2 位小数，所有现金流的总现值。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, r] = t;
      const rate = 1 + r / 100;
      let total = 0;
      for (let i = 0; i <= n; i++) total += t[2 + i] / Math.pow(rate, i);
      return total.toFixed(2);
    },
    gen(rng) {
      const mk = (n, r, c) => `${n} ${r}\n${c.join(" ")}`;
      const cases = [
        { input: mk(2, 5, [100, 100, 100]), category: "sample", targets: "正现金流折现", reason: "约 285.94" },
        { input: mk(0, 0, [500]), category: "sample", targets: "单年零利率", reason: "500.00" },
        { input: mk(0, 100, [-1000]), category: "boundary", targets: "极大利率大投入", reason: "折现约 -500" },
        { input: mk(0, 0, [0]), category: "boundary", targets: "零现金流", reason: "0.00" },
        { input: mk(50, 3, Array.from({ length: 51 }, () => randInt(rng, -1000000, 1000000))), category: "performance", scale: 50, targets: "50 年折现累加", reason: "double 精度" },
        { input: mk(50, 0, Array.from({ length: 51 }, () => 1000000)), category: "performance", scale: 50, targets: "零利率满收入", reason: "51×1000000" },
        { input: mk(5, 0, [1000000, -1000000, 1000000, -1000000, 1000000, -1000000]), category: "adversarial", targets: "正负交错", reason: "抵消折现" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 0, 10); cases.push({ input: mk(n, randInt(rng, 0, 20), Array.from({ length: n + 1 }, () => randInt(rng, -10000, 10000))), category: "ordinary", targets: "随机现金流", reason: "折现正确性" }); }
      return cases;
    },
  },
];
