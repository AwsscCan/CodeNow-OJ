/* CodeNow OJ · AcWing 参考解批次3a：DFS/BFS/树图遍历/拓扑 · Bamzc */

import { randInt, shuffle, tokens } from "./lib.mjs";

export const ACWING_SOLVERS_3A = {
  AW842: { // 排列数字：字典序全排列
    solve(input) {
      const n = Number(tokens(input)[0]);
      const out = [];
      const path = [], used = new Array(n + 1).fill(false);
      const dfs = () => {
        if (path.length === n) { out.push(path.join(" ")); return; }
        for (let v = 1; v <= n; v++) if (!used[v]) { used[v] = true; path.push(v); dfs(); path.pop(); used[v] = false; }
      };
      dfs();
      return out.join("\n");
    },
    gen() {
      return [
        { input: "1", category: "boundary", targets: "单元素排列", reason: "只有一行 1" },
        { input: "2", category: "boundary", targets: "最小交换规模", reason: "两行" },
        { input: "4", category: "ordinary", targets: "常规规模", reason: "24 行字典序" },
        { input: "5", category: "ordinary", targets: "常规规模", reason: "120 行" },
        { input: "6", category: "special", targets: "输出量 720 行", reason: "字典序稳定性" },
        { input: "7", category: "performance", scale: 5040, targets: "上限 5040 行卡低效字符串拼接", reason: "递归满深度" },
        { input: "3", category: "ordinary", targets: "样例邻近规模", reason: "6 行" },
        { input: "7", category: "adversarial", scale: 5040, targets: "重复满规模防非字典序实现", reason: "与性能点同输入双验证" },
        { input: "2", category: "ordinary", targets: "回归小规模", reason: "1 2 与 2 1" },
        { input: "5", category: "special", targets: "中段字典序顺序", reason: "第 60 行边界" },
        { input: "6", category: "ordinary", targets: "复验 720 行", reason: "顺序一致性" },
        { input: "4", category: "special", targets: "递归回溯清理 used 数组", reason: "24 行完整性" },
      ];
    },
  },
  AW843: { // n-皇后：逐行放置、列升序尝试的方案序
    solve(input) {
      const n = Number(tokens(input)[0]);
      const out = [];
      const col = new Array(n).fill(false), dg = new Array(2 * n).fill(false), udg = new Array(2 * n).fill(false);
      const board = Array.from({ length: n }, () => new Array(n).fill("."));
      const dfs = (r) => {
        if (r === n) { out.push(board.map((row) => row.join("")).join("\n"), ""); return; }
        for (let c = 0; c < n; c++) {
          if (col[c] || dg[r + c] || udg[r - c + n]) continue;
          col[c] = dg[r + c] = udg[r - c + n] = true;
          board[r][c] = "Q";
          dfs(r + 1);
          board[r][c] = ".";
          col[c] = dg[r + c] = udg[r - c + n] = false;
        }
      };
      dfs(0);
      return out.join("\n");
    },
    gen() {
      return [
        { input: "1", category: "boundary", targets: "1 皇后单方案", reason: "输出 Q 与空行" },
        { input: "4", category: "ordinary", targets: "经典 2 方案", reason: "对称双解" },
        { input: "5", category: "ordinary", targets: "10 方案", reason: "常规规模" },
        { input: "6", category: "special", targets: "方案数最少的非平凡规模", reason: "仅 4 解" },
        { input: "2", category: "special", allowEmpty: true, targets: "无解输出为空", reason: "2 皇后无解，只应无任何方案行" },
        { input: "3", category: "special", allowEmpty: true, targets: "无解规模 3", reason: "同为空输出场景" },
        { input: "8", category: "performance", scale: 92, targets: "92 方案标准规模", reason: "经典八皇后" },
        { input: "9", category: "performance", scale: 352, targets: "上限 352 方案卡低效剪枝", reason: "对角线数组剪枝" },
        { input: "7", category: "ordinary", targets: "40 方案", reason: "中等规模" },
        { input: "8", category: "adversarial", scale: 92, targets: "重复满规模验证方案顺序", reason: "列升序 DFS 顺序" },
        { input: "5", category: "ordinary", targets: "复验 10 方案", reason: "顺序一致" },
        { input: "6", category: "ordinary", targets: "复验 4 方案", reason: "空行分隔完整" },
      ];
    },
  },
  AW844: { // 走迷宫：0 通 1 墙 BFS，保证有解
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const grid = t.slice(2);
      const dist = new Int32Array(n * m).fill(-1);
      const queue = new Int32Array(n * m);
      let head = 0, tail = 0;
      dist[0] = 0; queue[tail++] = 0;
      const dr = [1, -1, 0, 0], dc = [0, 0, 1, -1];
      while (head < tail) {
        const cur = queue[head++];
        const r = Math.floor(cur / m), c = cur % m;
        for (let d = 0; d < 4; d++) {
          const nr = r + dr[d], nc = c + dc[d];
          if (nr < 0 || nr >= n || nc < 0 || nc >= m) continue;
          const ni = nr * m + nc;
          if (dist[ni] !== -1 || grid[ni] === 1) continue;
          dist[ni] = dist[cur] + 1;
          queue[tail++] = ni;
        }
      }
      return String(dist[n * m - 1]);
    },
    gen(rng) {
      const mk = (rows) => `${rows.length} ${rows[0].length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const open = (n, m) => Array.from({ length: n }, () => new Array(m).fill(0));
      const solvable = (n, m, wallRate) => {
        // 先铺 L 形保底通路，再随机加墙
        const rows = Array.from({ length: n }, () => Array.from({ length: m }, () => (rng() < wallRate ? 1 : 0)));
        for (let r = 0; r < n; r++) rows[r][0] = 0;
        for (let c = 0; c < m; c++) rows[n - 1][c] = 0;
        rows[0][0] = 0; rows[n - 1][m - 1] = 0;
        return rows;
      };
      const snake = (n, m) => {
        const rows = Array.from({ length: n }, () => new Array(m).fill(1));
        for (let r = 0; r < n; r++) {
          if (r % 2 === 0) for (let c = 0; c < m; c++) rows[r][c] = 0;
          else rows[r][r % 4 === 1 ? m - 1 : 0] = 0;
        }
        return rows;
      };
      const cases = [
        { input: mk([[0]]), category: "boundary", targets: "1x1 原地即终点", reason: "答案 0" },
        { input: mk([Array.from({ length: 100 }, () => 0)]), category: "boundary", targets: "单行长廊", reason: "答案 m-1" },
        { input: mk(open(100, 1).map((r) => r)), category: "boundary", targets: "单列长廊", reason: "答案 n-1" },
        { input: mk([[0, 1], [0, 0]]), category: "special", targets: "唯一绕行路径", reason: "答案 2" },
        { input: mk(open(100, 100)), category: "performance", scale: 10000, targets: "全开放满规模 BFS 吞吐", reason: "1 万格" },
        { input: mk(snake(99, 100)), category: "performance", scale: 9900, targets: "蛇形唯一长路卡 DFS 求最短", reason: "约 5 千步唯一路径" },
        { input: mk(solvable(100, 100, 0.28)), category: "adversarial", scale: 10000, targets: "随机墙保底通路", reason: "L 形保证有解" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(solvable(randInt(rng, 2, 8), randInt(rng, 2, 8), 0.2)), category: "ordinary", targets: "随机小迷宫", reason: "保证可达的常规验证" });
      return cases;
    },
  },
  AW845: { // 八数码：最少交换次数，无解 -1
    solve(input) {
      const start = tokens(input).join("");
      const target = "12345678x";
      if (start === target) return "0";
      const dist = new Map([[start, 0]]);
      const queue = [start];
      const dr = [1, -1, 0, 0], dc = [0, 0, 1, -1];
      for (let head = 0; head < queue.length; head++) {
        const cur = queue[head];
        const d = dist.get(cur);
        const pos = cur.indexOf("x");
        const r = Math.floor(pos / 3), c = pos % 3;
        for (let k = 0; k < 4; k++) {
          const nr = r + dr[k], nc = c + dc[k];
          if (nr < 0 || nr > 2 || nc < 0 || nc > 2) continue;
          const np = nr * 3 + nc;
          const arr = cur.split("");
          [arr[pos], arr[np]] = [arr[np], arr[pos]];
          const next = arr.join("");
          if (dist.has(next)) continue;
          if (next === target) return String(d + 1);
          dist.set(next, d + 1);
          queue.push(next);
        }
      }
      return "-1";
    },
    gen(rng) {
      const scrambled = (steps) => {
        // 从终态反向随机走保证有解
        let cur = "12345678x".split("");
        const dr = [1, -1, 0, 0], dc = [0, 0, 1, -1];
        for (let i = 0; i < steps; i++) {
          const pos = cur.indexOf("x");
          const r = Math.floor(pos / 3), c = pos % 3;
          const moves = [];
          for (let k = 0; k < 4; k++) { const nr = r + dr[k], nc = c + dc[k]; if (nr >= 0 && nr <= 2 && nc >= 0 && nc <= 2) moves.push(nr * 3 + nc); }
          const np = moves[randInt(rng, 0, moves.length - 1)];
          [cur[pos], cur[np]] = [cur[np], cur[pos]];
        }
        return cur.join("").split("").join(" ");
      };
      const cases = [
        { input: "1 2 3 4 5 6 7 8 x", category: "boundary", targets: "已是终态", reason: "答案 0" },
        { input: "1 2 3 4 5 6 7 x 8", category: "boundary", targets: "一步之遥", reason: "答案 1" },
        { input: "1 2 3 4 5 6 8 7 x", category: "special", targets: "奇排列无解", reason: "逆序对奇偶性,输出 -1" },
        { input: "2 1 3 4 5 6 7 8 x", category: "special", targets: "相邻互换无解", reason: "同为 -1 场景" },
        { input: scrambled(120), category: "performance", scale: 181440, targets: "深度打乱卡朴素 DFS 与无判重 BFS", reason: "远离终态的状态" },
        { input: "8 6 7 2 5 4 3 x 1", category: "performance", scale: 181440, targets: "接近最深 31 步的困难局面", reason: "近最坏情况深度" },
        { input: scrambled(60), category: "adversarial", targets: "中深度打乱", reason: "状态判重正确性" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: scrambled(randInt(rng, 3, 25)), category: "ordinary", targets: "浅层打乱", reason: "反向随机保证有解" });
      return cases;
    },
  },
  AW846: { // 树的重心：删除后最大连通块最小值
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const head = new Int32Array(n + 1).fill(-1);
      const nxt = new Int32Array(2 * n), to = new Int32Array(2 * n);
      let edgeCount = 0;
      const addEdge = (a, b) => { to[edgeCount] = b; nxt[edgeCount] = head[a]; head[a] = edgeCount++; };
      for (let i = 0; i < n - 1; i++) { addEdge(t[1 + 2 * i], t[2 + 2 * i]); addEdge(t[2 + 2 * i], t[1 + 2 * i]); }
      let best = n;
      const size = new Int32Array(n + 1);
      // 迭代后序 DFS 防爆栈
      const parent = new Int32Array(n + 1);
      const order = [];
      const stack = [1];
      parent[1] = 0;
      const visited = new Uint8Array(n + 1);
      visited[1] = 1;
      while (stack.length) {
        const u = stack.pop();
        order.push(u);
        for (let e = head[u]; e !== -1; e = nxt[e]) {
          const v = to[e];
          if (!visited[v]) { visited[v] = 1; parent[v] = u; stack.push(v); }
        }
      }
      for (let i = order.length - 1; i >= 0; i--) {
        const u = order[i];
        size[u] += 1;
        let maxPart = n - size[u];
        for (let e = head[u]; e !== -1; e = nxt[e]) {
          const v = to[e];
          if (v !== parent[u]) maxPart = Math.max(maxPart, size[v]);
        }
        best = Math.min(best, maxPart);
        if (parent[u]) size[parent[u]] += size[u];
      }
      return String(best);
    },
    gen(rng) {
      const mk = (n, edges) => `${n}\n${edges.map(([a, b]) => `${a} ${b}`).join("\n")}`;
      const chain = (n) => Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 2]);
      const star = (n) => Array.from({ length: n - 1 }, (_, i) => [1, i + 2]);
      const randomTree = (n) => Array.from({ length: n - 1 }, (_, i) => [randInt(rng, 1, i + 1), i + 2]);
      const cases = [
        { input: mk(1, []), category: "boundary", targets: "单点树", reason: "删除后无块，答案 0" },
        { input: mk(2, [[1, 2]]), category: "boundary", targets: "两点树", reason: "答案 1" },
        { input: mk(7, chain(7)), category: "special", targets: "链的重心在中点", reason: "答案 3" },
        { input: mk(8, star(8)), category: "special", targets: "星型重心即中心", reason: "答案 1" },
        { input: mk(10000, chain(10000)), category: "performance", scale: 10000, targets: "长链卡递归 DFS 爆栈", reason: "深度 1 万需迭代" },
        { input: mk(10000, randomTree(10000)), category: "performance", scale: 10000, targets: "随机树满规模", reason: "1 万点尺寸统计" },
        { input: mk(6, [[1, 2], [2, 3], [2, 4], [4, 5], [4, 6]]), category: "adversarial", targets: "双候选重心", reason: "2 与 4 并列取同值" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 3, 30); cases.push({ input: mk(n, shuffle(rng, randomTree(n))), category: "ordinary", targets: "乱序边随机树", reason: "边输入顺序无关" }); }
      return cases;
    },
  },
  AW847: { // 图中点的层次：1→n BFS 最短，构造保证可达
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const head = new Int32Array(n + 1).fill(-1);
      const nxt = new Int32Array(m), to = new Int32Array(m);
      for (let i = 0; i < m; i++) { const a = t[2 + 2 * i]; to[i] = t[3 + 2 * i]; nxt[i] = head[a]; head[a] = i; }
      const dist = new Int32Array(n + 1).fill(-1);
      const queue = new Int32Array(n);
      let qh = 0, qt = 0;
      dist[1] = 0; queue[qt++] = 1;
      while (qh < qt) {
        const u = queue[qh++];
        if (u === n) break;
        for (let e = head[u]; e !== -1; e = nxt[e]) {
          const v = to[e];
          if (dist[v] === -1) { dist[v] = dist[u] + 1; queue[qt++] = v; }
        }
      }
      return String(dist[n]);
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map(([a, b]) => `${a} ${b}`).join("\n")}`;
      const chain = (n) => Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 2]);
      const layered = (n, extra) => {
        const edges = chain(n);
        for (let i = 0; i < extra; i++) { const a = randInt(rng, 1, n - 1); edges.push([a, randInt(rng, a + 1, n)]); }
        return edges;
      };
      const cases = [
        { input: mk(1, []), category: "boundary", targets: "起点即终点", reason: "答案 0" },
        { input: mk(2, [[1, 2]]), category: "boundary", targets: "单边直达", reason: "答案 1" },
        { input: mk(3, [[1, 2], [2, 3], [1, 3]]), category: "special", targets: "捷径与绕路并存", reason: "答案 1" },
        { input: mk(4, [[1, 2], [1, 2], [2, 4], [3, 3]]), category: "special", targets: "重边与自环", reason: "不影响最短层次" },
        { input: mk(10000, chain(10000)), category: "performance", scale: 10000, targets: "长链层次 9999", reason: "满规模逐层扩展" },
        { input: mk(10000, layered(10000, 5000)), category: "performance", scale: 10000, targets: "捷径密集图", reason: "1.5 万边 BFS 吞吐" },
        { input: mk(5, [[1, 3], [3, 5], [1, 2], [2, 3], [4, 5]]), category: "adversarial", targets: "多路径取最短层", reason: "1→3→5 两步" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 25); cases.push({ input: mk(n, layered(n, randInt(rng, 0, 10))), category: "ordinary", targets: "链保底随机图", reason: "构造保证可达" }); }
      return cases;
    },
  },
  AW848: { // 拓扑序列：队列按小编号优先入队；无拓扑 -1
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const head = new Int32Array(n + 1).fill(-1);
      const nxt = new Int32Array(m), to = new Int32Array(m);
      const indeg = new Int32Array(n + 1);
      for (let i = 0; i < m; i++) { const a = t[2 + 2 * i], b = t[3 + 2 * i]; to[i] = b; nxt[i] = head[a]; head[a] = i; indeg[b]++; }
      const queue = new Int32Array(n);
      let qh = 0, qt = 0;
      for (let v = 1; v <= n; v++) if (!indeg[v]) queue[qt++] = v;
      const order = [];
      while (qh < qt) {
        const u = queue[qh++];
        order.push(u);
        for (let e = head[u]; e !== -1; e = nxt[e]) if (--indeg[to[e]] === 0) queue[qt++] = to[e];
      }
      return order.length === n ? order.join(" ") : "-1";
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map(([a, b]) => `${a} ${b}`).join("\n")}`;
      const dag = (n, m) => Array.from({ length: m }, () => { const a = randInt(rng, 1, n - 1); return [a, randInt(rng, a + 1, n)]; });
      const cases = [
        { input: mk(1, []), category: "boundary", targets: "单点无边", reason: "输出 1" },
        { input: mk(3, []), category: "boundary", targets: "无边多点", reason: "按编号输出 1 2 3(小编号优先)" },
        { input: mk(2, [[1, 2], [2, 1]]), category: "special", targets: "二元环无拓扑", reason: "-1" },
        { input: mk(4, [[2, 1], [3, 1], [4, 1]]), category: "special", targets: "汇点入度 3", reason: "1 最后出，其余按编号(期望为小编号优先 BFS 序)" },
        { input: mk(5, [[1, 2], [2, 3], [3, 4], [4, 5], [5, 3]]), category: "special", targets: "尾部藏环", reason: "部分可排序仍 -1" },
        { input: mk(10000, Array.from({ length: 9999 }, (_, i) => [i + 1, i + 2])), category: "performance", scale: 10000, targets: "长链满规模", reason: "唯一拓扑序" },
        { input: mk(10000, dag(10000, 15000)), category: "performance", scale: 10000, targets: "随机 DAG 1.5 万边", reason: "期望为小编号优先 BFS 拓扑序" },
        { input: mk(6, [[6, 5], [5, 4], [4, 3], [3, 2], [2, 1]]), category: "adversarial", targets: "编号与拓扑序完全逆置", reason: "输出 6 5 4 3 2 1" },
      ];
      for (let i = 0; i < 4; i++) { const n = randInt(rng, 2, 20); cases.push({ input: mk(n, dag(n, randInt(rng, 1, 25))), category: "ordinary", targets: "随机小 DAG", reason: "期望为小编号优先 BFS 拓扑序" }); }
      return cases;
    },
  },
};
