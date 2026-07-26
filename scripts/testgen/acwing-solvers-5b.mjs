/* CodeNow OJ · AcWing 参考解批次5b：区间/计数/状压/树形 DP + 贪心 · Bamzc */

import { randInt, tokens } from "./lib.mjs";

const MOD = 1000000007n;

export const ACWING_SOLVERS_5B = {
  AW282: { // 石子合并（区间 DP，相邻合并）
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const a = t.slice(1, 1 + n);
      const pre = new Array(n + 1).fill(0);
      for (let i = 1; i <= n; i++) pre[i] = pre[i - 1] + a[i - 1];
      const dp = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let len = 2; len <= n; len++) {
        for (let i = 0; i + len - 1 < n; i++) {
          const j = i + len - 1;
          dp[i][j] = Infinity;
          const cost = pre[j + 1] - pre[i];
          for (let k = i; k < j; k++) dp[i][j] = Math.min(dp[i][j], dp[i][k] + dp[k + 1][j] + cost);
        }
      }
      return String(dp[0][n - 1]);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([5]), category: "boundary", targets: "单堆无合并", reason: "0" },
        { input: mk([1, 3, 5, 2]), category: "boundary", targets: "样例同款", reason: "22" },
        { input: mk([1, 1]), category: "special", targets: "两堆一次合并", reason: "2" },
        { input: mk(Array.from({ length: 300 }, () => randInt(rng, 1, 1000))), category: "performance", scale: 300, targets: "300 堆 O(n³) 区间 DP", reason: "满规模枚举断点" },
        { input: mk(Array.from({ length: 300 }, () => 1000)), category: "performance", scale: 300, targets: "全等重量满规模", reason: "断点无差异全扫" },
        { input: mk([100, 1, 1, 1, 100]), category: "adversarial", targets: "大小交错合并顺序", reason: "区间分割影响代价" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 2, 40) }, () => randInt(rng, 1, 1000))), category: "ordinary", targets: "随机小堆", reason: "常规正确性" });
      return cases;
    },
  },
  AW900: { // 整数划分（计数 DP，完全背包式）mod 1e9+7
    solve(input) {
      const n = Number(tokens(input)[0]);
      const dp = new Array(n + 1).fill(0n);
      dp[0] = 1n;
      for (let i = 1; i <= n; i++) for (let j = i; j <= n; j++) dp[j] = (dp[j] + dp[j - i]) % MOD;
      return String(dp[n]);
    },
    gen(rng) {
      const cases = [
        { input: "1", category: "boundary", targets: "最小规模", reason: "1" },
        { input: "5", category: "boundary", targets: "样例同款", reason: "7" },
        { input: "2", category: "special", targets: "两种划分", reason: "2" },
        { input: "1000", category: "special", scale: 1000, targets: "答案需取模的规模", reason: "超 1e9+7" },
        { input: "1000", category: "performance", scale: 1000, targets: "上界 O(n²) 计数 DP", reason: "完全背包式转移" },
        { input: "999", category: "performance", scale: 999, targets: "近上界复验", reason: "差一防护" },
        { input: "50", category: "adversarial", targets: "中等规模精确值", reason: "204226 未取模" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: String(randInt(rng, 1, 60)), category: "ordinary", targets: "小规模", reason: "常规正确性" });
      return cases;
    },
  },
  AW338: { // 计数问题（多组，0 0 终止）：a~b 各数字 0-9 出现次数
    skipAnchor: true,
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const countDigit = (n, d) => { // 0~n 中数字 d 出现次数
        if (n < 0) return 0;
        let count = 0;
        for (let pos = 1; pos <= n; pos *= 10) {
          const high = Math.floor(n / (pos * 10));
          const cur = Math.floor(n / pos) % 10;
          const low = n % pos;
          if (d === 0) count += (high - 1) * pos + (cur > 0 ? pos : low + 1);
          else {
            count += high * pos;
            if (cur > d) count += pos;
            else if (cur === d) count += low + 1;
          }
        }
        return count;
      };
      const out = [];
      for (const line of lines) {
        let [a, b] = line.split(/\s+/).map(Number);
        if (a === 0 && b === 0) break;
        if (a > b) [a, b] = [b, a];
        const res = [];
        for (let d = 0; d <= 9; d++) res.push(countDigit(b, d) - countDigit(a - 1, d));
        out.push(res.join(" "));
      }
      return out.join("\n");
    },
    brute(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const out = [];
      for (const line of lines) {
        let [a, b] = line.split(/\s+/).map(Number);
        if (a === 0 && b === 0) break;
        if (a > b) [a, b] = [b, a];
        const res = new Array(10).fill(0);
        for (let x = a; x <= b; x++) for (const ch of String(x)) res[Number(ch)]++;
        out.push(res.join(" "));
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (pairs) => `${pairs.map((p) => p.join(" ")).join("\n")}\n0 0`;
      const cases = [
        { input: mk([[1, 1]]), category: "boundary", targets: "单数字", reason: "1 出现一次" },
        { input: mk([[1, 10]]), category: "boundary", targets: "样例首行", reason: "1~10 统计" },
        { input: mk([[10, 1]]), category: "special", targets: "a>b 需交换", reason: "顺序无关" },
        { input: mk([[100, 100]]), category: "special", targets: "含双零单数", reason: "0 出现两次" },
        { input: mk(Array.from({ length: 10000 }, () => { const a = randInt(rng, 1, 100000000); return [a, randInt(rng, a, 100000000)]; })), category: "performance", scale: 10000, targets: "万组大区间卡逐数统计", reason: "需数位 DP/公式" },
        { input: mk(Array.from({ length: 100 }, () => [1, 100000000])), category: "performance", scale: 10000, targets: "重复超大区间", reason: "1e8 上界公式" },
        { input: mk([[1, 999999999]]), category: "adversarial", targets: "九位全域", reason: "各数字均匀分布验证" },
      ];
      for (let i = 0; i < 5; i++) { const a = randInt(rng, 1, 500); cases.push({ input: mk([[a, randInt(rng, a, 1000)]]), category: "ordinary", targets: "随机小区间", reason: "与逐数统计对拍" }); }
      return cases;
    },
  },
  AW91: { // 最短 Hamilton 路径（状压 DP）
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const g = [];
      for (let i = 0; i < n; i++) g.push(t.slice(1 + i * n, 1 + (i + 1) * n));
      const dp = Array.from({ length: 1 << n }, () => new Array(n).fill(Infinity));
      dp[1][0] = 0;
      for (let mask = 1; mask < (1 << n); mask++) {
        if (!(mask & 1)) continue;
        for (let j = 0; j < n; j++) {
          if (!(mask & (1 << j)) || dp[mask][j] === Infinity) continue;
          for (let k = 0; k < n; k++) {
            if (mask & (1 << k)) continue;
            const nm = mask | (1 << k);
            if (dp[mask][j] + g[j][k] < dp[nm][k]) dp[nm][k] = dp[mask][j] + g[j][k];
          }
        }
      }
      return String(dp[(1 << n) - 1][n - 1]);
    },
    gen(rng) {
      const mk = (g) => `${g.length}\n${g.map((r) => r.join(" ")).join("\n")}`;
      const metric = (n) => {
        // 由随机坐标生成满足三角不等式的对称距离矩阵
        const pts = Array.from({ length: n }, () => [randInt(rng, 0, 100), randInt(rng, 0, 100)]);
        return pts.map((p) => pts.map((q) => Math.round(Math.hypot(p[0] - q[0], p[1] - q[1]))));
      };
      const cases = [
        { input: mk([[0]]), category: "boundary", targets: "单点", reason: "0" },
        { input: mk([[0, 3], [3, 0]]), category: "boundary", targets: "两点直连", reason: "3" },
        { input: mk([[0, 2, 4, 5, 1], [2, 0, 6, 5, 3], [4, 6, 0, 8, 3], [5, 5, 8, 0, 5], [1, 3, 3, 5, 0]]), category: "special", targets: "样例同款", reason: "18" },
        { input: mk(metric(18)), category: "performance", scale: 18, targets: "18 点状压 O(2^n·n²) 满规模", reason: "近上界指数 DP" },
        { input: mk(metric(17)), category: "performance", scale: 17, targets: "17 点复验", reason: "位掩码转移" },
        { input: mk(metric(10)), category: "adversarial", targets: "中等规模度量图", reason: "多路径竞争" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(metric(randInt(rng, 3, 8))), category: "ordinary", targets: "随机度量图", reason: "常规正确性" });
      return cases;
    },
  },
  AW1049: { // 大盗阿福（线性 DP，多组）
    skipAnchor: true,
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const T = Number(lines[0]);
      let idx = 1;
      const out = [];
      for (let tc = 0; tc < T; tc++) {
        const n = Number(lines[idx++]);
        const a = lines[idx++].split(/\s+/).map(Number);
        let notRob = 0, rob = 0;
        for (let i = 0; i < n; i++) {
          const newRob = notRob + a[i];
          const newNot = Math.max(notRob, rob);
          rob = newRob; notRob = newNot;
        }
        out.push(Math.max(rob, notRob));
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (arrs) => `${arrs.length}\n${arrs.map((a) => `${a.length}\n${a.join(" ")}`).join("\n")}`;
      const cases = [
        { input: mk([[5]]), category: "boundary", targets: "单店铺", reason: "取它" },
        { input: mk([[1, 8, 2], [10, 7, 6, 14]]), category: "boundary", targets: "样例同款", reason: "8 与 24" },
        { input: mk([[5, 5]]), category: "special", targets: "相邻不可兼得", reason: "取一个" },
        { input: mk([[3, 2, 3, 2, 3]]), category: "special", targets: "隔位取最优", reason: "间隔选择" },
        { input: mk([Array.from({ length: 40000 }, () => randInt(rng, 1, 1000))]), category: "performance", scale: 100000, targets: "4 万店铺线性 DP", reason: "滚动状态" },
        { input: mk(Array.from({ length: 400 }, () => Array.from({ length: 100 }, () => randInt(rng, 1, 1000)))), category: "performance", scale: 100000, targets: "千组数据总量满负荷", reason: "多组累计" },
        { input: mk([[1000, 1, 1, 1000]]), category: "adversarial", targets: "两端大值", reason: "跳过中间取两端 2000" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk([Array.from({ length: randInt(rng, 1, 15) }, () => randInt(rng, 1, 100))]), category: "ordinary", targets: "随机小序列", reason: "常规正确性" });
      return cases;
    },
  },
  AW901: { // 滑雪（记忆化搜索）
    solve(input) {
      const t = tokens(input).map(Number);
      const [R, C] = t;
      const h = [];
      for (let i = 0; i < R; i++) h.push(t.slice(2 + i * C, 2 + (i + 1) * C));
      const memo = Array.from({ length: R }, () => new Int32Array(C).fill(-1));
      const dr = [1, -1, 0, 0], dc = [0, 0, 1, -1];
      const dfs = (r, c) => {
        if (memo[r][c] !== -1) return memo[r][c];
        let best = 1;
        for (let d = 0; d < 4; d++) {
          const nr = r + dr[d], nc = c + dc[d];
          if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
          if (h[nr][nc] < h[r][c]) best = Math.max(best, 1 + dfs(nr, nc));
        }
        memo[r][c] = best;
        return best;
      };
      let ans = 0;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) ans = Math.max(ans, dfs(r, c));
      return String(ans);
    },
    gen(rng) {
      const mk = (grid) => `${grid.length} ${grid[0].length}\n${grid.map((r) => r.join(" ")).join("\n")}`;
      const rgrid = (R, C, hi) => Array.from({ length: R }, () => Array.from({ length: C }, () => randInt(rng, 1, hi)));
      const cases = [
        { input: mk([[5]]), category: "boundary", targets: "单格", reason: "1" },
        { input: mk([[1, 2, 3, 4, 5], [16, 17, 18, 19, 6], [15, 24, 25, 20, 7], [14, 23, 22, 21, 8], [13, 12, 11, 10, 9]]), category: "boundary", targets: "样例螺旋", reason: "25" },
        { input: mk([[1, 1], [1, 1]]), category: "special", targets: "全等无法滑动", reason: "答案 1" },
        { input: mk(Array.from({ length: 20 }, (_, i) => Array.from({ length: 20 }, (_, j) => i * 20 + j + 1))), category: "special", targets: "严格递增可全程滑", reason: "长链记忆化" },
        { input: mk(rgrid(150, 150, 1000000)), category: "performance", scale: 22500, targets: "150×150 记忆化搜索满规模", reason: "2.25 万格 DAG 最长路" },
        { input: mk(Array.from({ length: 150 }, (_, i) => Array.from({ length: 150 }, (_, j) => i * 150 + j + 1))), category: "performance", scale: 22500, targets: "全递增卡无记忆化重搜", reason: "最长链 2.25 万" },
        { input: mk([[3, 3, 3], [3, 1, 3], [3, 3, 3]]), category: "adversarial", targets: "中心低谷四周高", reason: "多方向汇入" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(rgrid(randInt(rng, 2, 8), randInt(rng, 2, 8), 50)), category: "ordinary", targets: "随机小矩阵", reason: "常规正确性" });
      return cases;
    },
  },
  AW905: { // 区间选点（贪心，按右端排序）
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const segs = [];
      for (let i = 0; i < n; i++) segs.push([t[1 + 2 * i], t[2 + 2 * i]]);
      segs.sort((a, b) => a[1] - b[1]);
      let count = 0, last = -Infinity;
      for (const [l, r] of segs) if (l > last) { count++; last = r; }
      return String(count);
    },
    gen(rng) {
      const mk = (segs) => `${segs.length}\n${segs.map((s) => s.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[1, 1]]), category: "boundary", targets: "单点区间", reason: "1" },
        { input: mk([[-1, 1], [2, 4], [3, 5]]), category: "boundary", targets: "样例同款", reason: "2" },
        { input: mk([[1, 10], [2, 3], [4, 5]]), category: "special", targets: "大区间含小区间", reason: "按右端可共点" },
        { input: mk([[1, 2], [3, 4], [5, 6]]), category: "special", targets: "全不相交", reason: "各需一点" },
        { input: mk(Array.from({ length: 10000 }, () => { const l = randInt(rng, -1000000000, 1000000000); return [l, l + randInt(rng, 0, 1000)]; })), category: "performance", scale: 100000, targets: "10 万区间排序贪心", reason: "满规模" },
        { input: mk(Array.from({ length: 10000 }, (_, i) => [i * 2, i * 2 + 1])), category: "performance", scale: 100000, targets: "全不相交满规模", reason: "答案 n" },
        { input: mk([[1, 5], [1, 2], [4, 5]]), category: "adversarial", targets: "右端排序陷阱", reason: "按右端选点覆盖最多" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 20) }, () => { const l = randInt(rng, -30, 30); return [l, l + randInt(rng, 0, 15)]; })), category: "ordinary", targets: "随机小区间", reason: "常规正确性" });
      return cases;
    },
  },
  AW908: { // 最大不相交区间（同 AW905 贪心）
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const segs = [];
      for (let i = 0; i < n; i++) segs.push([t[1 + 2 * i], t[2 + 2 * i]]);
      segs.sort((a, b) => a[1] - b[1]);
      let count = 0, last = -Infinity;
      for (const [l, r] of segs) if (l > last) { count++; last = r; }
      return String(count);
    },
    gen(rng) {
      const mk = (segs) => `${segs.length}\n${segs.map((s) => s.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[1, 2]]), category: "boundary", targets: "单区间", reason: "1" },
        { input: mk([[-1, 1], [2, 4], [3, 5]]), category: "boundary", targets: "样例同款", reason: "2" },
        { input: mk([[1, 5], [2, 3], [4, 6]]), category: "special", targets: "重叠择优", reason: "选 2-3 与 4-6" },
        { input: mk(Array.from({ length: 10000 }, () => { const l = randInt(rng, -1000000000, 1000000000); return [l, l + randInt(rng, 0, 1000)]; })), category: "performance", scale: 100000, targets: "10 万区间满规模", reason: "排序贪心" },
        { input: mk(Array.from({ length: 10000 }, () => [1, 1000000000])), category: "performance", scale: 100000, targets: "全重叠只能选一", reason: "答案 1" },
        { input: mk([[1, 3], [2, 5], [4, 7], [6, 9]]), category: "adversarial", targets: "链式重叠", reason: "隔一选取" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 20) }, () => { const l = randInt(rng, -30, 30); return [l, l + randInt(rng, 0, 15)]; })), category: "ordinary", targets: "随机小区间", reason: "常规正确性" });
      return cases;
    },
  },
  AW906: { // 区间分组（贪心 + 小根堆）
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const segs = [];
      for (let i = 0; i < n; i++) segs.push([t[1 + 2 * i], t[2 + 2 * i]]);
      segs.sort((a, b) => a[0] - b[0]);
      const ends = []; // 小根堆(各组最右端)
      const push = (v) => { ends.push(v); let i = ends.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (ends[p] <= ends[i]) break; [ends[p], ends[i]] = [ends[i], ends[p]]; i = p; } };
      const pop = () => { const top = ends[0]; const last = ends.pop(); if (ends.length) { ends[0] = last; let i = 0; for (;;) { let s = i; const l = 2 * i + 1, r = 2 * i + 2; if (l < ends.length && ends[l] < ends[s]) s = l; if (r < ends.length && ends[r] < ends[s]) s = r; if (s === i) break; [ends[s], ends[i]] = [ends[i], ends[s]]; i = s; } } return top; };
      for (const [l, r] of segs) {
        if (ends.length && ends[0] < l) pop();
        push(r);
      }
      return String(ends.length);
    },
    gen(rng) {
      const mk = (segs) => `${segs.length}\n${segs.map((s) => s.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[1, 2]]), category: "boundary", targets: "单区间一组", reason: "1" },
        { input: mk([[-1, 1], [2, 4], [3, 5]]), category: "boundary", targets: "样例同款", reason: "2" },
        { input: mk([[1, 10], [2, 3], [4, 5]]), category: "special", targets: "大区间强制新组", reason: "2 组" },
        { input: mk([[1, 2], [3, 4], [5, 6]]), category: "special", targets: "全不相交一组", reason: "串行共用 1 组" },
        { input: mk(Array.from({ length: 10000 }, () => { const l = randInt(rng, -1000000000, 1000000000); return [l, l + randInt(rng, 0, 100000)]; })), category: "performance", scale: 100000, targets: "10 万区间堆贪心", reason: "满规模分组" },
        { input: mk(Array.from({ length: 10000 }, () => [1, 1000000000])), category: "performance", scale: 100000, targets: "全重叠需 n 组", reason: "堆持续增长" },
        { input: mk([[1, 3], [2, 4], [3, 5], [4, 6]]), category: "adversarial", targets: "阶梯重叠", reason: "最大重叠数即组数" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 20) }, () => { const l = randInt(rng, -30, 30); return [l, l + randInt(rng, 0, 15)]; })), category: "ordinary", targets: "随机小区间", reason: "常规正确性" });
      return cases;
    },
  },
  AW907: { // 区间覆盖（贪心）无解 -1
    solve(input) {
      const t = tokens(input).map(Number);
      const s = t[0], target = t[1], n = t[2];
      const segs = [];
      for (let i = 0; i < n; i++) segs.push([t[3 + 2 * i], t[4 + 2 * i]]);
      segs.sort((a, b) => a[0] - b[0]);
      let count = 0, cur = s, i = 0;
      while (cur < target) {
        let best = -Infinity;
        while (i < n && segs[i][0] <= cur) { best = Math.max(best, segs[i][1]); i++; }
        if (best < cur || best === -Infinity && i >= n && segs.every((x) => x[0] > cur)) return "-1";
        if (best <= cur) return "-1";
        cur = best;
        count++;
      }
      return String(count);
    },
    gen(rng) {
      const mk = (s, tg, segs) => `${s} ${tg}\n${segs.length}\n${segs.map((x) => x.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(1, 1, [[1, 1]]), category: "boundary", targets: "起点即终点", reason: "1 段覆盖" },
        { input: mk(1, 5, [[-1, 3], [2, 4], [3, 5]]), category: "boundary", targets: "样例同款", reason: "2" },
        { input: mk(1, 10, [[1, 3], [5, 8]]), category: "special", targets: "覆盖有缺口", reason: "-1" },
        { input: mk(1, 10, [[1, 5], [4, 10]]), category: "special", targets: "两段接力", reason: "2" },
        { input: mk(0, 1000000000, Array.from({ length: 8000 }, () => { const l = randInt(rng, 0, 999999999); return [l, l + randInt(rng, 1, 100000)]; }).concat([[0, 500000000], [499999999, 1000000000]])), category: "performance", scale: 100000, targets: "8 千区间覆盖大目标", reason: "排序贪心跳段" },
        { input: mk(0, 16000, Array.from({ length: 8000 }, (_, i) => [i, i + 2])), category: "performance", scale: 8000, targets: "密集小段接力", reason: "最优跳跃选择" },
        { input: mk(1, 6, [[1, 3], [2, 5], [4, 6]]), category: "adversarial", targets: "贪心选最远右端", reason: "首步应选 2-5" },
      ];
      for (let i = 0; i < 6; i++) { const tg = randInt(rng, 5, 40); cases.push({ input: mk(1, tg, Array.from({ length: randInt(rng, 1, 15) }, () => { const l = randInt(rng, -5, tg); return [l, l + randInt(rng, 1, 10)]; })), category: "ordinary", targets: "随机覆盖", reason: "含无解与可解" }); }
      return cases;
    },
  },
  AW148: { // 合并果子（贪心 + 小根堆）
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const h = t.slice(1, 1 + n);
      const up = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (h[p] <= h[i]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
      const down = (i) => { for (;;) { let m = i; const l = 2 * i + 1, r = 2 * i + 2; if (l < h.length && h[l] < h[m]) m = l; if (r < h.length && h[r] < h[m]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } };
      for (let i = Math.floor(h.length / 2) - 1; i >= 0; i--) down(i);
      const pop = () => { const top = h[0]; const last = h.pop(); if (h.length) { h[0] = last; down(0); } return top; };
      const push = (v) => { h.push(v); up(h.length - 1); };
      let total = 0;
      while (h.length > 1) { const a = pop(), b = pop(); total += a + b; push(a + b); }
      return String(total);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      let arr = t.slice(1, 1 + n);
      let total = 0;
      while (arr.length > 1) { arr.sort((a, b) => a - b); const m = arr[0] + arr[1]; total += m; arr = [m, ...arr.slice(2)]; }
      return String(total);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([9]), category: "boundary", targets: "单堆无合并", reason: "0" },
        { input: mk([1, 2, 9]), category: "boundary", targets: "样例同款", reason: "15" },
        { input: mk([1, 1]), category: "special", targets: "两堆一次", reason: "2" },
        { input: mk(Array.from({ length: 20000 }, () => randInt(rng, 1, 20000))), category: "performance", scale: 100000, targets: "10 万堆卡每轮重排 O(n² log n)", reason: "优先队列必需" },
        { input: mk(Array.from({ length: 20000 }, () => 1)), category: "performance", scale: 100000, targets: "全等重量大规模", reason: "堆内大量相等键" },
        { input: mk([20000, 1, 20000, 1]), category: "adversarial", targets: "大小交错", reason: "贪心明显优于顺序合并" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 2, 40) }, () => randInt(rng, 1, 200))), category: "ordinary", targets: "随机小堆", reason: "与每轮重排暴力对拍" });
      return cases;
    },
  },
  AW913: { // 排队打水（贪心，升序）等待时间和
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const a = t.slice(1, 1 + n).sort((x, y) => x - y);
      let total = 0n, prefix = 0n;
      for (let i = 0; i < n - 1; i++) { prefix += BigInt(a[i]); total += prefix; }
      return String(total);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([5]), category: "boundary", targets: "单人零等待", reason: "0" },
        { input: mk([3, 6, 1, 4, 2, 5, 7]), category: "boundary", targets: "样例同款", reason: "56" },
        { input: mk([2, 2, 2]), category: "special", targets: "全等时间", reason: "顺序无关" },
        { input: mk(Array.from({ length: 20000 }, () => randInt(rng, 1, 1000000000))), category: "performance", scale: 100000, targets: "10 万人排序求和卡 int 溢出", reason: "总和超 32 位需 long long" },
        { input: mk(Array.from({ length: 20000 }, (_, i) => 20000 - i)), category: "performance", scale: 100000, targets: "逆序输入满规模", reason: "排序必需" },
        { input: mk([100, 1, 100, 1]), category: "adversarial", targets: "大小交错", reason: "小的必须先打水" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 30) }, () => randInt(rng, 1, 100))), category: "ordinary", targets: "随机小队列", reason: "常规正确性" });
      return cases;
    },
  },
  AW104: { // 货仓选址（贪心，中位数）
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const a = t.slice(1, 1 + n).sort((x, y) => x - y);
      const mid = a[Math.floor(n / 2)];
      let total = 0n;
      for (const x of a) total += BigInt(Math.abs(x - mid));
      return String(total);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([5]), category: "boundary", targets: "单点零距离", reason: "0" },
        { input: mk([6, 2, 9, 1]), category: "boundary", targets: "样例同款", reason: "12" },
        { input: mk([1, 1000000000]), category: "special", targets: "两点值域跨度", reason: "距离和为跨度" },
        { input: mk([5, 5, 5, 5]), category: "special", targets: "全等选址", reason: "0" },
        { input: mk(Array.from({ length: 20000 }, () => randInt(rng, -1000000000, 1000000000))), category: "performance", scale: 100000, targets: "10 万点中位数选址卡溢出", reason: "距离和超 32 位" },
        { input: mk(Array.from({ length: 20000 }, (_, i) => i)), category: "performance", scale: 100000, targets: "均匀分布满规模", reason: "排序取中位" },
        { input: mk([1, 2, 3, 1000]), category: "adversarial", targets: "离群点不动中位数", reason: "中位数抗离群" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 30) }, () => randInt(rng, -100, 100))), category: "ordinary", targets: "随机小点集", reason: "常规正确性" });
      return cases;
    },
  },
  AW125: { // 耍杂技的牛（贪心，按 w+s 排序）最大风险最小
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const cows = [];
      for (let i = 0; i < n; i++) cows.push([t[1 + 2 * i], t[2 + 2 * i]]);
      cows.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
      let sumW = 0, ans = -Infinity;
      for (const [w, s] of cows) { ans = Math.max(ans, sumW - s); sumW += w; }
      return String(ans);
    },
    brute(input) { // 小规模全排列验证
      const t = tokens(input).map(Number);
      const n = t[0];
      const cows = [];
      for (let i = 0; i < n; i++) cows.push([t[1 + 2 * i], t[2 + 2 * i]]);
      let best = Infinity;
      const perm = (arr, chosen) => {
        if (!arr.length) {
          let sumW = 0, risk = -Infinity;
          for (const [w, s] of chosen) { risk = Math.max(risk, sumW - s); sumW += w; }
          best = Math.min(best, risk);
          return;
        }
        for (let i = 0; i < arr.length; i++) perm([...arr.slice(0, i), ...arr.slice(i + 1)], [...chosen, arr[i]]);
      };
      perm(cows, []);
      return String(best);
    },
    gen(rng) {
      const mk = (cows) => `${cows.length}\n${cows.map((c) => c.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[5, 5]]), category: "boundary", targets: "单牛", reason: "-5(自身无上方)" },
        { input: mk([[10, 3], [2, 5], [3, 3]]), category: "boundary", targets: "样例同款", reason: "2" },
        { input: mk([[1, 1], [1, 1]]), category: "special", targets: "全等牛", reason: "顺序无关" },
        { input: mk(Array.from({ length: 20000 }, () => [randInt(rng, 1, 10000), randInt(rng, 1, 10000)])), category: "performance", scale: 20000, targets: "2 万牛排序贪心卡溢出", reason: "累计重量超 int" },
        { input: mk(Array.from({ length: 20000 }, (_, i) => [i + 1, 20000 - i])), category: "performance", scale: 20000, targets: "w+s 相近的排序稳定性", reason: "贪心键接近" },
        { input: mk([[1, 10], [10, 1]]), category: "adversarial", targets: "轻而弱 vs 重而强", reason: "按 w+s 排序决定上下位" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 6) }, () => [randInt(rng, 1, 20), randInt(rng, 1, 20)])), category: "ordinary", targets: "随机小牛群", reason: "与全排列暴力对拍" });
      return cases;
    },
  },
};
