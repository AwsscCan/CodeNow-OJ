/* CodeNow OJ · 经典题库定义(下)：数据结构/动态规划/搜索图论/数学字符串 · Bamzc */

import { randArray, randInt, shuffle, tokens } from "./lib.mjs";

export const CLASSIC_DEFS_2 = [
  {
    id: "CL010", title: "滑动窗口最大值", difficulty: "普及", folder: "经典题库/数据结构",
    description: "给定长度为 n 的整数序列和窗口大小 k。窗口从序列最左端滑到最右端，每次右移一格。输出每个窗口内的最大值。",
    inputFormat: "第一行两个整数 n 和 k（1 ≤ k ≤ n ≤ 200000）。第二行 n 个整数（绝对值不超过 1000000000）。",
    outputFormat: "一行 n-k+1 个整数，用空格分隔：每个窗口的最大值。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, k] = t;
      const a = t.slice(2, 2 + n);
      const dq = new Int32Array(n);
      let head = 0, tail = 0;
      const out = [];
      for (let i = 0; i < n; i++) {
        while (tail > head && a[dq[tail - 1]] <= a[i]) tail--;
        dq[tail++] = i;
        if (dq[head] <= i - k) head++;
        if (i >= k - 1) out.push(a[dq[head]]);
      }
      return out.join(" ");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, k] = t;
      const a = t.slice(2, 2 + n);
      const out = [];
      for (let i = 0; i + k <= n; i++) out.push(Math.max(...a.slice(i, i + k)));
      return out.join(" ");
    },
    gen(rng) {
      const mk = (arr, k) => `${arr.length} ${k}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([1, 3, -1, -3, 5, 3, 6, 7], 3), category: "sample", targets: "经典样例", reason: "3 3 5 5 6 7" },
        { input: mk([9, 8], 2), category: "sample", targets: "单窗口", reason: "n=k" },
        { input: mk([4], 1), category: "boundary", targets: "单元素窗口", reason: "k=1 输出原序列" },
        { input: mk([-1000000000, 1000000000], 1), category: "boundary", targets: "值域两端", reason: "极值不溢出" },
        { input: mk(Array.from({ length: 500 }, (_, i) => 500 - i), 100), category: "special", targets: "严格递减队头频繁过期", reason: "窗口最大值持续换手" },
        { input: mk(Array.from({ length: 500 }, (_, i) => i), 100), category: "special", targets: "严格递增队尾持续弹出", reason: "单调队列只留一个元素" },
        { input: mk(randArray(rng, 200000, -1000000000, 1000000000), 100000), category: "performance", scale: 200000, targets: "卡 O(n·k) 逐窗扫描", reason: "20 万规模大窗口" },
        { input: mk(Array.from({ length: 200000 }, () => 5), 137), category: "performance", scale: 200000, targets: "全等值弹出策略(<= 必须弹)", reason: "同值大量比较" },
        { input: mk([5, 5, 4, 4, 5, 5, 3, 5], 3), category: "adversarial", targets: "同值与回升交错", reason: "队内同值下标处理" },
      ];
      for (let i = 0; i < 4; i++) {
        const n = randInt(rng, 3, 40);
        cases.push({ input: mk(randArray(rng, n, -50, 50), randInt(rng, 1, n)), category: "ordinary", targets: "随机窗口", reason: "与逐窗扫描对拍" });
      }
      return cases;
    },
  },
  {
    id: "CL011", title: "最长上升子序列", difficulty: "普及", folder: "经典题库/动态规划",
    description: "给定长度为 n 的整数序列，求最长严格上升子序列的长度。子序列不要求连续。",
    inputFormat: "第一行一个整数 n（1 ≤ n ≤ 100000）。第二行 n 个整数（绝对值不超过 1000000000）。",
    outputFormat: "一个整数：最长严格上升子序列的长度。",
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
      const n = t[0];
      const a = t.slice(1, 1 + n);
      const dp = new Array(n).fill(1);
      let best = n ? 1 : 0;
      for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) if (a[j] < a[i]) { dp[i] = Math.max(dp[i], dp[j] + 1); best = Math.max(best, dp[i]); }
      return String(best);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([1, 7, 2, 8, 3, 4]), category: "sample", targets: "经典样例", reason: "答案 4(1,2,3,4)" },
        { input: mk([9]), category: "sample", targets: "单元素", reason: "答案 1" },
        { input: mk([5, 5, 5, 5]), category: "boundary", targets: "全相等严格上升判定", reason: "答案 1，卡非严格实现" },
        { input: mk([-1000000000, 1000000000]), category: "boundary", targets: "值域两端", reason: "答案 2" },
        { input: mk(Array.from({ length: 2000 }, (_, i) => 2000 - i)), category: "special", targets: "严格递减", reason: "答案 1" },
        { input: mk(Array.from({ length: 2000 }, (_, i) => i)), category: "special", targets: "严格递增", reason: "答案 n" },
        { input: mk(randArray(rng, 100000, -1000000000, 1000000000)), category: "performance", scale: 100000, targets: "卡 O(n²) 朴素 DP", reason: "10 万规模需 O(n log n)" },
        { input: mk(Array.from({ length: 100000 }, (_, i) => (i % 2 ? i : i + 2))), category: "performance", scale: 100000, targets: "锯齿上升序列高频替换 tails", reason: "二分插入路径全量触发" },
        { input: mk([3, 1, 2, 1, 2, 3, 1, 2, 3, 4]), category: "adversarial", targets: "多段重启的上升段", reason: "贪心接段错误" },
      ];
      for (let i = 0; i < 4; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 2, 60), -20, 20)), category: "ordinary", targets: "随机短序列", reason: "与 O(n²) DP 对拍" });
      return cases;
    },
  },
  {
    id: "CL012", title: "0/1 背包", difficulty: "普及", folder: "经典题库/动态规划",
    description: "有 n 件物品和容量为 V 的背包。第 i 件物品体积 v[i]、价值 w[i]，每件至多选一次。求不超过容量的最大总价值。",
    inputFormat: "第一行两个整数 n 和 V（1 ≤ n ≤ 1000，1 ≤ V ≤ 1000）。接下来 n 行，每行两个整数 v[i] w[i]（1 ≤ v[i] ≤ V，1 ≤ w[i] ≤ 1000）。",
    outputFormat: "一个整数：最大总价值。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, V] = t;
      const dp = new Int32Array(V + 1);
      for (let i = 0; i < n; i++) {
        const v = t[2 + 2 * i], w = t[3 + 2 * i];
        for (let j = V; j >= v; j--) if (dp[j - v] + w > dp[j]) dp[j] = dp[j - v] + w;
      }
      return String(dp[V]);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, V] = t;
      let best = 0;
      for (let mask = 0; mask < (1 << n); mask++) {
        let vol = 0, val = 0;
        for (let i = 0; i < n; i++) if (mask & (1 << i)) { vol += t[2 + 2 * i]; val += t[3 + 2 * i]; }
        if (vol <= V) best = Math.max(best, val);
      }
      return String(best);
    },
    gen(rng) {
      const mk = (V, items) => `${items.length} ${V}\n${items.map(([v, w]) => `${v} ${w}`).join("\n")}`;
      const bigItems = Array.from({ length: 1000 }, () => [randInt(rng, 1, 1000), randInt(rng, 1, 1000)]);
      const cases = [
        { input: mk(5, [[1, 2], [2, 4], [3, 4], [4, 5]]), category: "sample", targets: "经典样例", reason: "答案 8(选 2+3)" },
        { input: mk(1, [[1, 7]]), category: "sample", targets: "单物品恰装满", reason: "答案 7" },
        { input: mk(1, [[1, 1]]), category: "boundary", targets: "最小规模", reason: "n=V=1" },
        { input: mk(1000, [[1000, 1000]]), category: "boundary", targets: "单件占满最大容量", reason: "上界" },
        { input: mk(10, [[11, 100]].map(([v, w]) => [Math.min(v, 10), w])), category: "boundary", targets: "体积等于容量", reason: "边界收纳" },
        { input: mk(100, Array.from({ length: 12 }, () => [randInt(rng, 30, 60), randInt(rng, 1, 1000)])), category: "special", targets: "大体积互斥选择", reason: "只装得下少数几件" },
        { input: mk(1000, bigItems), category: "performance", scale: 1000, targets: "卡 O(2^n) 枚举与记忆化爆栈", reason: "1000 件满规模 DP" },
        { input: mk(999, Array.from({ length: 1000 }, () => [randInt(rng, 1, 3), randInt(rng, 1, 5)])), category: "performance", scale: 1000, targets: "小体积海量物品", reason: "内层循环满跑" },
        { input: mk(6, [[3, 10], [3, 10], [4, 12], [2, 1]]), category: "adversarial", targets: "价值贪心陷阱", reason: "按性价比贪心非最优" },
      ];
      for (let i = 0; i < 4; i++) {
        const n = randInt(rng, 2, 12), V = randInt(rng, 3, 30);
        cases.push({ input: mk(V, Array.from({ length: n }, () => [randInt(rng, 1, V), randInt(rng, 1, 30)])), category: "ordinary", targets: "随机小背包", reason: "与子集枚举对拍" });
      }
      return cases;
    },
  },
  {
    id: "CL013", title: "数字三角形", difficulty: "入门", folder: "经典题库/动态规划",
    description: "给定 n 行的数字三角形，从顶端出发，每步走到下一行相邻两个位置之一，走到底行。求路径数字之和的最大值。",
    inputFormat: "第一行一个整数 n（1 ≤ n ≤ 1000）。接下来 n 行，第 i 行 i 个整数（绝对值不超过 10000）。",
    outputFormat: "一个整数：路径和的最大值。",
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
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      let idx = 1;
      const rows = [];
      for (let i = 1; i <= n; i++) { rows.push(t.slice(idx, idx + i)); idx += i; }
      let best = -Infinity;
      const walk = (r, c, sum) => {
        const cur = sum + rows[r][c];
        if (r === n - 1) { best = Math.max(best, cur); return; }
        walk(r + 1, c, cur); walk(r + 1, c + 1, cur);
      };
      walk(0, 0, 0);
      return String(best);
    },
    gen(rng) {
      const mk = (rows) => `${rows.length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const tri = (n, lo, hi) => Array.from({ length: n }, (_, i) => randArray(rng, i + 1, lo, hi));
      const cases = [
        { input: mk([[7], [3, 8], [8, 1, 0], [2, 7, 4, 4]]), category: "sample", targets: "经典四行", reason: "答案 26" },
        { input: mk([[5]]), category: "sample", targets: "单行", reason: "n=1" },
        { input: mk([[-10000], [-10000, -10000]]), category: "boundary", targets: "全负值", reason: "最大和仍为负" },
        { input: mk([[10000], [10000, 10000]]), category: "boundary", targets: "全最大值", reason: "上界求和" },
        { input: mk([[1], [100, -100], [-100, 1, -100]]), category: "special", targets: "局部贪心陷阱", reason: "先大后小非最优路径" },
        { input: mk(tri(1000, -10000, 10000)), category: "performance", scale: 1000, targets: "卡 O(2^n) 递归路径枚举", reason: "1000 行满规模" },
        { input: mk(tri(1000, -1, 1)), category: "performance", scale: 1000, targets: "微小值满规模", reason: "路径差异极小防剪枝作弊" },
        { input: mk([[0], [-1, -1], [5, -9, 5], [-9, 5, 5, -9]]), category: "adversarial", targets: "左右对称多路径", reason: "多条并列最优" },
      ];
      for (let i = 0; i < 4; i++) cases.push({ input: mk(tri(randInt(rng, 2, 12), -20, 20)), category: "ordinary", targets: "随机小三角形", reason: "与全路径递归对拍" });
      return cases;
    },
  },
  {
    id: "CL014", title: "迷宫最短路", difficulty: "普及", folder: "经典题库/搜索与图论",
    description: "给定 R 行 C 列的网格迷宫，'.' 表示可走，'#' 表示墙。从左上角 (1,1) 走到右下角 (R,C)，每步可向上下左右移动一格。求最少步数；无法到达输出 -1。保证起终点为 '.'。",
    inputFormat: "第一行两个整数 R 和 C（1 ≤ R, C ≤ 500）。接下来 R 行，每行 C 个字符。",
    outputFormat: "一个整数：最少步数，无法到达输出 -1。",
    solve(input) {
      const lines = input.split("\n").filter((l) => l.length > 0);
      const [R, C] = lines[0].split(/\s+/).map(Number);
      const grid = lines.slice(1, 1 + R);
      const dist = new Int32Array(R * C).fill(-1);
      const queue = new Int32Array(R * C);
      let head = 0, tail = 0;
      dist[0] = 0; queue[tail++] = 0;
      const dr = [1, -1, 0, 0], dc = [0, 0, 1, -1];
      while (head < tail) {
        const cur = queue[head++];
        const r = Math.floor(cur / C), c = cur % C;
        for (let d = 0; d < 4; d++) {
          const nr = r + dr[d], nc = c + dc[d];
          if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
          const ni = nr * C + nc;
          if (dist[ni] !== -1 || grid[nr][nc] === "#") continue;
          dist[ni] = dist[cur] + 1;
          queue[tail++] = ni;
        }
      }
      return String(dist[R * C - 1]);
    },
    gen(rng) {
      const mk = (rows) => `${rows.length} ${rows[0].length}\n${rows.join("\n")}`;
      const open = (R, C) => Array.from({ length: R }, () => ".".repeat(C));
      const randomMaze = (R, C, wallRate) => {
        const rows = [];
        for (let r = 0; r < R; r++) {
          let line = "";
          for (let c = 0; c < C; c++) line += ((r === 0 && c === 0) || (r === R - 1 && c === C - 1)) ? "." : (rng() < wallRate ? "#" : ".");
          rows.push(line);
        }
        return rows;
      };
      const snake = (R, C) => {
        // 蛇形通道：唯一路径且极长，卡 DFS 找最短路
        const rows = Array.from({ length: R }, () => Array.from({ length: C }, () => "#"));
        for (let r = 0; r < R; r++) {
          if (r % 2 === 0) for (let c = 0; c < C; c++) rows[r][c] = ".";
          else rows[r][r % 4 === 1 ? C - 1 : 0] = ".";
        }
        return rows.map((r) => r.join(""));
      };
      const walled = (R, C) => {
        const rows = open(R, C).map((line) => line.split(""));
        const mid = Math.floor(C / 2);
        for (let r = 0; r < R; r++) rows[r][mid] = "#";
        return rows.map((r) => r.join(""));
      };
      const cases = [
        { input: mk([".#", ".."]), category: "sample", targets: "基础绕行", reason: "答案 2" },
        { input: mk(["..", "##"].slice(0, 1).concat(["#."])), category: "sample", targets: "紧凑可达", reason: "2x2 答案 2" },
        { input: mk(["."]), category: "boundary", targets: "1x1 起点即终点", reason: "答案 0" },
        { input: mk([".".repeat(500)]), category: "boundary", targets: "单行长廊", reason: "答案 C-1" },
        { input: mk(Array.from({ length: 500 }, () => ".")), category: "boundary", targets: "单列长廊", reason: "答案 R-1" },
        { input: mk(walled(9, 9)), category: "special", targets: "隔墙不可达", reason: "输出 -1" },
        { input: mk(snake(499, 500)), category: "performance", scale: 249500, targets: "蛇形唯一长路卡 DFS 与朴素 Dijkstra", reason: "约 12 万步的唯一路径" },
        { input: mk(open(500, 500)), category: "performance", scale: 250000, targets: "全开放 25 万格 BFS 吞吐", reason: "最大规模空图" },
        { input: mk(randomMaze(500, 500, 0.55)), category: "adversarial", scale: 250000, targets: "高墙率大概率不可达", reason: "大规模 -1 分支" },
      ];
      for (let i = 0; i < 3; i++) cases.push({ input: mk(randomMaze(randInt(rng, 2, 8), randInt(rng, 2, 8), 0.25)), category: "ordinary", targets: "随机小迷宫", reason: "可达与不可达混合" });
      return cases;
    },
  },
  {
    id: "CL015", title: "连通块计数", difficulty: "普及", folder: "经典题库/搜索与图论",
    description: "给定 n 个点 m 条无向边的图（可能有重边、自环），求连通块个数。",
    inputFormat: "第一行两个整数 n 和 m（1 ≤ n ≤ 100000，0 ≤ m ≤ 200000）。接下来 m 行，每行两个整数 u v 表示一条无向边。",
    outputFormat: "一个整数：连通块个数。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const parent = new Int32Array(n + 1);
      for (let i = 1; i <= n; i++) parent[i] = i;
      const find = (x) => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; } return r; };
      let comps = n;
      for (let i = 0; i < m; i++) {
        const ru = find(t[2 + 2 * i]), rv = find(t[3 + 2 * i]);
        if (ru !== rv) { parent[ru] = rv; comps--; }
      }
      return String(comps);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const adj = Array.from({ length: n + 1 }, () => []);
      for (let i = 0; i < m; i++) { adj[t[2 + 2 * i]].push(t[3 + 2 * i]); adj[t[3 + 2 * i]].push(t[2 + 2 * i]); }
      const seen = new Array(n + 1).fill(false);
      let comps = 0;
      for (let s = 1; s <= n; s++) {
        if (seen[s]) continue;
        comps++;
        const stack = [s]; seen[s] = true;
        while (stack.length) { const u = stack.pop(); for (const v of adj[u]) if (!seen[v]) { seen[v] = true; stack.push(v); } }
      }
      return String(comps);
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map(([u, v]) => `${u} ${v}`).join("\n")}`;
      const chainEdges = (n) => Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 2]);
      const bigEdges = Array.from({ length: 200000 }, () => [randInt(rng, 1, 100000), randInt(rng, 1, 100000)]);
      const cases = [
        { input: mk(5, [[1, 2], [3, 4]]), category: "sample", targets: "基础分块", reason: "3 个连通块" },
        { input: mk(3, []), category: "sample", targets: "无边图", reason: "每点自成一块" },
        { input: mk(1, []), category: "boundary", targets: "单点", reason: "答案 1" },
        { input: mk(2, [[1, 1], [2, 2]]), category: "boundary", targets: "纯自环", reason: "自环不连通两点" },
        { input: mk(4, [[1, 2], [1, 2], [2, 1]]), category: "special", targets: "重边", reason: "重复合并不重复计数" },
        { input: mk(100000, chainEdges(100000)), category: "performance", scale: 100000, targets: "10 万点长链卡无路径压缩并查集", reason: "退化树高" },
        { input: mk(100000, bigEdges), category: "performance", scale: 200000, targets: "20 万随机边吞吐", reason: "满规模合并" },
        { input: mk(6, [[1, 2], [2, 3], [3, 1], [4, 5], [5, 6], [6, 4]]), category: "adversarial", targets: "两个环", reason: "环内合并计数" },
      ];
      for (let i = 0; i < 4; i++) {
        const n = randInt(rng, 2, 30), m = randInt(rng, 0, 40);
        cases.push({ input: mk(n, Array.from({ length: m }, () => [randInt(rng, 1, n), randInt(rng, 1, n)])), category: "ordinary", targets: "随机小图", reason: "与 DFS 对拍" });
      }
      return cases;
    },
  },
  {
    id: "CL016", title: "单源最短路", difficulty: "提高", folder: "经典题库/搜索与图论",
    description: "给定 n 个点 m 条有向边的图，边权为正整数。求从 1 号点到 n 号点的最短距离；无法到达输出 -1。",
    inputFormat: "第一行两个整数 n 和 m（1 ≤ n ≤ 100000，0 ≤ m ≤ 200000）。接下来 m 行，每行三个整数 u v w，表示 u 到 v 的边权 w（1 ≤ w ≤ 10000）。",
    outputFormat: "一个整数：1 到 n 的最短距离；不可达输出 -1。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const head = new Int32Array(n + 1).fill(-1);
      const nxt = new Int32Array(m), to = new Int32Array(m), wt = new Int32Array(m);
      for (let i = 0; i < m; i++) {
        const u = t[2 + 3 * i]; to[i] = t[3 + 3 * i]; wt[i] = t[4 + 3 * i];
        nxt[i] = head[u]; head[u] = i;
      }
      const dist = new Float64Array(n + 1).fill(Infinity);
      dist[1] = 0;
      // 手写二叉堆 [dist, node]
      const hd = [0], hn = [1];
      const swap = (i, j) => { [hd[i], hd[j]] = [hd[j], hd[i]]; [hn[i], hn[j]] = [hn[j], hn[i]]; };
      const push = (d, v) => { hd.push(d); hn.push(v); let i = hd.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hd[p] <= hd[i]) break; swap(p, i); i = p; } };
      const pop = () => {
        const d = hd[0], v = hn[0];
        const ld = hd.pop(), lv = hn.pop();
        if (hd.length) { hd[0] = ld; hn[0] = lv; let i = 0; for (;;) { let s = i; const l = 2 * i + 1, r = 2 * i + 2; if (l < hd.length && hd[l] < hd[s]) s = l; if (r < hd.length && hd[r] < hd[s]) s = r; if (s === i) break; swap(s, i); i = s; } }
        return [d, v];
      };
      while (hd.length) {
        const [d, u] = pop();
        if (d > dist[u]) continue;
        if (u === n) break;
        for (let e = head[u]; e !== -1; e = nxt[e]) {
          const nd = d + wt[e];
          if (nd < dist[to[e]]) { dist[to[e]] = nd; push(nd, to[e]); }
        }
      }
      return String(dist[n] === Infinity ? -1 : dist[n]);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const dist = new Array(n + 1).fill(Infinity);
      dist[1] = 0;
      for (let round = 0; round < n; round++) {
        let changed = false;
        for (let i = 0; i < m; i++) {
          const u = t[2 + 3 * i], v = t[3 + 3 * i], w = t[4 + 3 * i];
          if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; changed = true; }
        }
        if (!changed) break;
      }
      return String(dist[n] === Infinity ? -1 : dist[n]);
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map(([u, v, w]) => `${u} ${v} ${w}`).join("\n")}`;
      const chain = (n, w) => Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 2, w]);
      const bigRandom = (n, m) => Array.from({ length: m }, () => [randInt(rng, 1, n), randInt(rng, 1, n), randInt(rng, 1, 10000)]);
      const greedyTrap = [[1, 2, 1], [2, 4, 100], [1, 3, 10], [3, 4, 1]];
      const cases = [
        { input: mk(3, [[1, 2, 4], [2, 3, 5], [1, 3, 100]]), category: "sample", targets: "两段更短", reason: "答案 9" },
        { input: mk(2, [[1, 2, 7]]), category: "sample", targets: "单边直达", reason: "答案 7" },
        { input: mk(1, []), category: "boundary", targets: "起点即终点", reason: "答案 0" },
        { input: mk(2, []), category: "boundary", targets: "无边不可达", reason: "答案 -1" },
        { input: mk(3, [[3, 1, 5], [2, 3, 5]]), category: "special", targets: "反向边不可用", reason: "有向图方向性，-1" },
        { input: mk(4, greedyTrap), category: "special", targets: "首步贪心陷阱", reason: "先短后长非最优，答案 11" },
        { input: mk(100000, chain(100000, 1).concat([[1, 100000, 10000]])), category: "performance", scale: 100000, targets: "长链与捷径比较卡 SPFA 退化", reason: "10 万点链答案 9999+捷径取舍" },
        { input: mk(100000, bigRandom(100000, 200000)), category: "performance", scale: 200000, targets: "满规模随机图堆吞吐", reason: "20 万边 Dijkstra" },
        { input: mk(5, [[1, 2, 1], [2, 3, 1], [3, 2, 1], [3, 4, 1], [4, 5, 10000], [1, 5, 10000]]), category: "adversarial", targets: "环+等价路径", reason: "有环图终点两路等价对比" },
      ];
      for (let i = 0; i < 4; i++) {
        const n = randInt(rng, 2, 15), m = randInt(rng, 0, 25);
        cases.push({ input: mk(n, bigRandom(n, m)), category: "ordinary", targets: "随机小图", reason: "与 Bellman-Ford 对拍" });
      }
      return cases;
    },
  },
  {
    id: "CL017", title: "快速幂", difficulty: "入门", folder: "经典题库/数学与字符串",
    description: "给定整数 a、b、p，求 a 的 b 次方对 p 取模的结果。",
    inputFormat: "一行三个整数 a b p（0 ≤ a ≤ 1000000000，0 ≤ b ≤ 1000000000000000000，1 ≤ p ≤ 1000000000）。约定 0 的 0 次方为 1。",
    outputFormat: "一个整数：a^b mod p。",
    solve(input) {
      const parts = tokens(input);
      let a = BigInt(parts[0]) % BigInt(parts[2]);
      let b = BigInt(parts[1]);
      const p = BigInt(parts[2]);
      let result = 1n % p;
      while (b > 0n) {
        if (b & 1n) result = (result * a) % p;
        a = (a * a) % p;
        b >>= 1n;
      }
      return String(result);
    },
    brute(input) {
      const parts = tokens(input);
      const a = BigInt(parts[0]), b = Number(parts[1]), p = BigInt(parts[2]);
      let result = 1n % p;
      for (let i = 0; i < b; i++) result = (result * a) % p;
      return String(result);
    },
    gen(rng) {
      const cases = [
        { input: "2 10 1000", category: "sample", targets: "基础幂", reason: "1024 mod 1000 = 24" },
        { input: "3 0 7", category: "sample", targets: "零次幂", reason: "答案 1" },
        { input: "0 0 5", category: "boundary", targets: "0^0 约定", reason: "按题面输出 1" },
        { input: "0 5 7", category: "boundary", targets: "0 的正次幂", reason: "答案 0" },
        { input: "1000000000 1000000000000000000 999999937", category: "boundary", scale: 2, targets: "全参数上界卡朴素循环", reason: "1e18 次方必须快速幂" },
        { input: "5 3 1", category: "special", targets: "模 1", reason: "任何数 mod 1 为 0" },
        { input: "999999999 2 1000000000", category: "special", targets: "平方溢出 64 位", reason: "中间积约 1e18，卡 long long 溢出实现" },
        { input: "2 62 4611686018427387904", category: "special", scale: 2, targets: "答案接近模数", reason: "2^62 与大模数(需 128 位或 BigInt 乘法)" },
        { input: "7 1000000000000000000 998244353", category: "performance", scale: 2, targets: "最大指数卡逐次相乘 O(b)", reason: "1e18 指数需 60 轮快速幂" },
        { input: "123456789 987654321987654321 1000000007", category: "adversarial", scale: 2, targets: "随机大参数", reason: "综合正确性" },
      ];
      for (let i = 0; i < 4; i++) cases.push({ input: `${randInt(rng, 0, 50)} ${randInt(rng, 0, 12)} ${randInt(rng, 1, 97)}`, category: "ordinary", targets: "小参数", reason: "与朴素循环对拍" });
      return cases;
    },
  },
  {
    id: "CL018", title: "子串出现次数", difficulty: "普及", folder: "经典题库/数学与字符串",
    description: "给定文本串 S 和模式串 T，求 T 在 S 中出现的次数（允许重叠出现）。",
    inputFormat: "第一行为文本串 S，第二行为模式串 T。均为小写字母，1 ≤ |T| ≤ |S| ≤ 1000000。",
    outputFormat: "一个整数：T 在 S 中的出现次数。",
    solve(input) {
      const lines = input.split("\n").filter((l) => l.length > 0);
      const s = lines[0], t = lines[1];
      const n = s.length, m = t.length;
      const fail = new Int32Array(m);
      for (let i = 1, j = 0; i < m; i++) {
        while (j > 0 && t[i] !== t[j]) j = fail[j - 1];
        if (t[i] === t[j]) j++;
        fail[i] = j;
      }
      let count = 0;
      for (let i = 0, j = 0; i < n; i++) {
        while (j > 0 && s[i] !== t[j]) j = fail[j - 1];
        if (s[i] === t[j]) j++;
        if (j === m) { count++; j = fail[j - 1]; }
      }
      return String(count);
    },
    brute(input) {
      const lines = input.split("\n").filter((l) => l.length > 0);
      const s = lines[0], t = lines[1];
      let count = 0;
      for (let i = 0; i + t.length <= s.length; i++) if (s.slice(i, i + t.length) === t) count++;
      return String(count);
    },
    gen(rng) {
      const randStr = (n, alpha) => Array.from({ length: n }, () => alpha[randInt(rng, 0, alpha.length - 1)]).join("");
      const mk = (s, t) => `${s}\n${t}`;
      const cases = [
        { input: mk("ababab", "ab"), category: "sample", targets: "基础匹配", reason: "3 次" },
        { input: mk("aaaa", "aa"), category: "sample", targets: "重叠出现", reason: "3 次，卡跳过式计数" },
        { input: mk("a", "a"), category: "boundary", targets: "单字符全等", reason: "1 次" },
        { input: mk("b", "a"), category: "boundary", targets: "单字符不匹配", reason: "0 次" },
        { input: mk("abc", "abc"), category: "boundary", targets: "整串即模式", reason: "1 次" },
        { input: mk("abababab", "abab"), category: "special", targets: "周期串重叠", reason: "3 次，fail 数组回退" },
        { input: mk("aabaabaaab", "aab"), category: "special", targets: "部分匹配回退", reason: "前缀函数经典回退场景" },
        { input: mk("a".repeat(1000000), "a".repeat(500)), category: "performance", scale: 1000000, targets: "全同字符卡 O(n·m) 朴素匹配", reason: "百万文本×500 模式重叠爆炸" },
        { input: mk(randStr(1000000, "ab"), "ab".repeat(20)), category: "performance", scale: 1000000, targets: "二字符表高频回退", reason: "KMP 失配跳转吞吐" },
        { input: mk(`${"ab".repeat(300)}aab${"ab".repeat(300)}`, `${"ab".repeat(150)}aa`), category: "adversarial", targets: "近周期扰动", reason: "长前缀反复接近匹配" },
      ];
      for (let i = 0; i < 3; i++) {
        const s = randStr(randInt(rng, 5, 80), "abc");
        const start = randInt(rng, 0, s.length - 2);
        cases.push({ input: mk(s, s.slice(start, start + randInt(rng, 1, Math.min(4, s.length - start)))), category: "ordinary", targets: "取自文本的随机模式", reason: "保证有解并与朴素对拍" });
      }
      return cases;
    },
  },
];
