/* CodeNow OJ · AcWing 参考解批次3b：最短路/MST/二分图 · Bamzc */

import { randInt, tokens } from "./lib.mjs";

const INF = Number.POSITIVE_INFINITY;

/** 邻接表 + 手写小根堆 Dijkstra，返回 dist 数组 */
function dijkstra(n, edges, start) {
  const head = new Int32Array(n + 1).fill(-1);
  const nxt = new Int32Array(edges.length), to = new Int32Array(edges.length), wt = new Int32Array(edges.length);
  edges.forEach(([u, v, w], i) => { to[i] = v; wt[i] = w; nxt[i] = head[u]; head[u] = i; });
  const dist = new Array(n + 1).fill(INF);
  dist[start] = 0;
  const hd = [0], hn = [start];
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
    for (let e = head[u]; e !== -1; e = nxt[e]) {
      const nd = d + wt[e];
      if (nd < dist[to[e]]) { dist[to[e]] = nd; push(nd, to[e]); }
    }
  }
  return dist;
}

/** Bellman-Ford 全松弛(负权可用，无负环前提)，返回 dist */
function bellman(n, edges, start) {
  const dist = new Array(n + 1).fill(INF);
  dist[start] = 0;
  for (let round = 0; round < n; round++) {
    let changed = false;
    for (const [u, v, w] of edges) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; changed = true; }
    if (!changed) break;
  }
  return dist;
}

const parseEdges = (t, m, offset, triple = true) => Array.from({ length: m }, (_, i) => triple
  ? [t[offset + 3 * i], t[offset + 3 * i + 1], t[offset + 3 * i + 2]]
  : [t[offset + 2 * i], t[offset + 2 * i + 1]]);

/** 随机正权图：链保底可达 + 随机附加边 */
function reachableGraph(rng, n, extra, maxW) {
  const edges = Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 2, randInt(rng, 1, maxW)]);
  for (let i = 0; i < extra; i++) edges.push([randInt(rng, 1, n), randInt(rng, 1, n), randInt(rng, 1, maxW)]);
  return edges;
}

export const ACWING_SOLVERS_3B = {
  AW849: { // Dijkstra I：1→n 最短距离，不可达 -1
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const dist = dijkstra(n, parseEdges(t, m, 2), 1);
      return String(dist[n] === INF ? -1 : dist[n]);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const dist = bellman(n, parseEdges(t, m, 2), 1);
      return String(dist[n] === INF ? -1 : dist[n]);
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(1, []), category: "boundary", targets: "起点即终点", reason: "答案 0" },
        { input: mk(2, []), category: "boundary", targets: "无边不可达", reason: "-1" },
        { input: mk(3, [[1, 2, 2], [2, 3, 1], [1, 3, 4]]), category: "special", targets: "两段和更短", reason: "3 优于 4" },
        { input: mk(3, [[1, 2, 1], [1, 2, 5], [2, 2, 3], [2, 3, 2]]), category: "special", targets: "重边与自环", reason: "取小权重边" },
        { input: mk(4, [[1, 2, 1], [2, 4, 100], [1, 3, 10], [3, 4, 1]]), category: "special", targets: "首步贪心陷阱", reason: "先短后长非最优" },
        { input: mk(10000, reachableGraph(rng, 10000, 5000, 10000)), category: "performance", scale: 10000, targets: "1.5 万边满规模卡 O(n·m)", reason: "堆优化吞吐" },
        { input: mk(10000, Array.from({ length: 9999 }, (_, i) => [i + 1, i + 2, 1]).concat([[1, 10000, 10000]])), category: "performance", scale: 10000, targets: "长链 vs 大权捷径", reason: "答案 9999 需走全链" },
        { input: mk(5, [[2, 3, 1], [3, 4, 1], [4, 5, 1]]), category: "adversarial", targets: "起点孤立", reason: "1 无出边 -1" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 15); cases.push({ input: mk(n, reachableGraph(rng, n, randInt(rng, 0, 12), 20)), category: "ordinary", targets: "随机小图", reason: "与 Bellman-Ford 对拍" }); }
      return cases;
    },
  },
  AW853: { // 有边数限制的最短路：≤k 条边，impossible
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m, k] = t;
      const edges = parseEdges(t, m, 3);
      let dist = new Array(n + 1).fill(INF);
      dist[1] = 0;
      for (let round = 0; round < k; round++) {
        const backup = [...dist];
        for (const [u, v, w] of edges) if (backup[u] !== INF && backup[u] + w < dist[v]) dist[v] = backup[u] + w;
      }
      return dist[n] === INF ? "impossible" : String(dist[n]);
    },
    gen(rng) {
      const mk = (n, k, edges) => `${n} ${edges.length} ${k}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(2, 1, [[1, 2, -5]]), category: "boundary", targets: "单负权边", reason: "答案 -5" },
        { input: mk(2, 1, []), category: "boundary", targets: "无边", reason: "impossible" },
        { input: mk(3, 1, [[1, 2, 1], [2, 3, 1], [1, 3, 3]]), category: "special", targets: "边数限制生效", reason: "k=1 只能走直达 3" },
        { input: mk(3, 2, [[1, 2, 1], [2, 3, 1], [1, 3, 3]]), category: "special", targets: "放宽到两条边", reason: "k=2 答案 2" },
        { input: mk(4, 2, [[1, 2, -1], [2, 3, -1], [3, 4, -1], [1, 4, 0]]), category: "special", targets: "backup 数组防串联松弛", reason: "k=2 不能一轮松弛三条边" },
        { input: mk(3, 3, [[2, 3, -10], [3, 2, -10], [1, 2, 1]]), category: "special", targets: "负环但受 k 限制", reason: "k 限制天然遏制负环" },
        { input: mk(3000, 500, Array.from({ length: 12000 }, () => [randInt(rng, 1, 3000), randInt(rng, 1, 3000), randInt(rng, -100, 10000)])), category: "performance", scale: 12000, targets: "1.2 万边×500 轮满负荷", reason: "Bellman k 轮吞吐" },
        { input: mk(4, 3, [[1, 2, 5], [2, 4, 5], [1, 3, -2], [3, 4, 100]]), category: "adversarial", targets: "负边诱导的次优前缀", reason: "负前缀不等于最优整路" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 10); cases.push({ input: mk(n, randInt(rng, 1, n), Array.from({ length: randInt(rng, 1, 15) }, () => [randInt(rng, 1, n), randInt(rng, 1, n), randInt(rng, -20, 50)])), category: "ordinary", targets: "随机小图含负权", reason: "k 轮语义常规验证" }); }
      return cases;
    },
  },
  AW851: { // SPFA 最短路：负权无负环，impossible
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const dist = bellman(n, parseEdges(t, m, 2), 1);
      return dist[n] === INF ? "impossible" : String(dist[n]);
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      // 负权只放在 DAG 前向边上，保证无负环
      const dagNeg = (n, extra) => {
        const edges = Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 2, randInt(rng, -50, 100)]);
        for (let i = 0; i < extra; i++) { const a = randInt(rng, 1, n - 1); edges.push([a, randInt(rng, a + 1, n), randInt(rng, -50, 100)]); }
        return edges;
      };
      const cases = [
        { input: mk(2, [[1, 2, -7]]), category: "boundary", targets: "单负权直达", reason: "-7" },
        { input: mk(2, []), category: "boundary", targets: "不可达", reason: "impossible" },
        { input: mk(3, [[1, 2, 5], [2, 3, -3], [1, 3, 4]]), category: "special", targets: "负边改写更优路", reason: "锚点同款结构" },
        { input: mk(4, [[1, 2, 2], [2, 3, 2], [3, 4, 2], [1, 4, 100], [2, 4, -1]]), category: "special", targets: "负边后置更新", reason: "已出队点需重新入队" },
        { input: mk(10000, dagNeg(10000, 5000)), category: "performance", scale: 10000, targets: "1.5 万边含负权满规模", reason: "SPFA 队列吞吐" },
        { input: mk(3000, Array.from({ length: 2999 }, (_, i) => [i + 1, i + 2, 100]).concat(Array.from({ length: 2998 }, (_, i) => [i + 1, i + 3, 1]))), category: "performance", scale: 6000, targets: "跳边密集反复松弛卡朴素实现", reason: "多次改写距离" },
        { input: mk(4, [[2, 3, -5], [3, 4, -5], [1, 4, 0]]), category: "adversarial", targets: "起点不可达的负链", reason: "负边不从 1 可达，答案 0" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 12); cases.push({ input: mk(n, dagNeg(n, randInt(rng, 0, 10))), category: "ordinary", targets: "随机 DAG 负权", reason: "无负环保证" }); }
      return cases;
    },
  },
  AW852: { // SPFA 判负环
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const edges = parseEdges(t, m, 2);
      // Bellman：从虚拟源连全部点，n 轮后仍可松弛即有负环
      const dist = new Array(n + 1).fill(0);
      for (let round = 0; round < n; round++) {
        let changed = false;
        for (const [u, v, w] of edges) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; changed = true; }
        if (!changed) return "No";
      }
      for (const [u, v, w] of edges) if (dist[u] + w < dist[v]) return "Yes";
      return "No";
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(1, [[1, 1, -1]]), category: "boundary", targets: "负自环", reason: "Yes" },
        { input: mk(1, [[1, 1, 0]]), category: "boundary", targets: "零权自环", reason: "非负环 No" },
        { input: mk(2, [[1, 2, 3], [2, 1, -3]]), category: "special", targets: "零和环", reason: "和为 0 输出 No" },
        { input: mk(2, [[1, 2, 3], [2, 1, -4]]), category: "special", targets: "轻负环", reason: "和 -1 输出 Yes" },
        { input: mk(5, [[3, 4, -2], [4, 5, -2], [5, 3, 1]]), category: "special", targets: "负环不与 1 连通", reason: "任意起点检测，Yes" },
        { input: mk(2000, Array.from({ length: 10000 }, () => [randInt(rng, 1, 2000), randInt(rng, 1, 2000), randInt(rng, 1, 100)])), category: "performance", scale: 10000, targets: "全正权大图必 No", reason: "满轮松弛后收敛" },
        { input: mk(2000, Array.from({ length: 9000 }, () => [randInt(rng, 1, 2000), randInt(rng, 1, 2000), randInt(rng, 1, 100)]).concat([[1999, 2000, 1], [2000, 1999, -3]])), category: "performance", scale: 9002, targets: "大图藏微小负环", reason: "深处负环检测" },
        { input: mk(4, [[1, 2, -1], [2, 3, -1], [3, 1, 3], [3, 4, -5]]), category: "adversarial", targets: "负边多但环和非负", reason: "和为 1 输出 No" },
      ];
      for (let i = 0; i < 5; i++) {
        const n = randInt(rng, 2, 10);
        const edges = Array.from({ length: randInt(rng, 1, 14) }, () => [randInt(rng, 1, n), randInt(rng, 1, n), randInt(rng, -6, 20)]);
        cases.push({ input: mk(n, edges), category: "ordinary", targets: "随机混权小图", reason: "Bellman 全图判定" });
      }
      return cases;
    },
  },
  AW854: { // Floyd 多询问：impossible
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m, k] = t;
      const d = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(INF));
      for (let i = 1; i <= n; i++) d[i][i] = 0;
      for (let i = 0; i < m; i++) {
        const x = t[3 + 3 * i], y = t[4 + 3 * i], z = t[5 + 3 * i];
        if (z < d[x][y]) d[x][y] = z;
      }
      for (let mid = 1; mid <= n; mid++) for (let i = 1; i <= n; i++) { const dm = d[i][mid]; if (dm === INF) continue; for (let j = 1; j <= n; j++) if (dm + d[mid][j] < d[i][j]) d[i][j] = dm + d[mid][j]; }
      const out = [];
      const qOffset = 3 + 3 * m;
      for (let i = 0; i < k; i++) {
        const x = t[qOffset + 2 * i], y = t[qOffset + 2 * i + 1];
        out.push(d[x][y] === INF ? "impossible" : String(d[x][y]));
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (n, edges, qs) => `${n} ${edges.length} ${qs.length}\n${edges.map((e) => e.join(" ")).join("\n")}\n${qs.map((q) => q.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(1, [], [[1, 1]]), category: "boundary", targets: "自身距离", reason: "0" },
        { input: mk(2, [], [[1, 2], [2, 1]]), category: "boundary", targets: "无边互不可达", reason: "双 impossible" },
        { input: mk(3, [[1, 2, 5], [1, 2, 2], [2, 2, 7]], [[1, 2]]), category: "special", targets: "重边取小与自环忽略", reason: "答案 2" },
        { input: mk(4, [[1, 2, 3], [2, 3, -1], [3, 4, 2]], [[1, 4], [4, 1]]), category: "special", targets: "负边中转与反向不可达", reason: "4 与 impossible" },
        { input: mk(200, Array.from({ length: 3000 }, () => [randInt(rng, 1, 200), randInt(rng, 1, 200), randInt(rng, -20, 100)]).concat(Array.from({ length: 199 }, (_, i) => [i + 1, i + 2, 50])), Array.from({ length: 5000 }, () => [randInt(rng, 1, 200), randInt(rng, 1, 200)])), category: "performance", scale: 5000, targets: "200 点稠密图 5 千询问", reason: "Floyd O(n³) 预处理必需" },
        { input: mk(150, Array.from({ length: 149 }, (_, i) => [i + 1, i + 2, 1]), Array.from({ length: 3000 }, () => [randInt(rng, 1, 150), randInt(rng, 1, 150)])), category: "performance", scale: 3000, targets: "链图长距离询问", reason: "跨全链传递闭包" },
        { input: mk(3, [[1, 2, 2], [2, 1, -2], [2, 3, 5]], [[1, 3]]), category: "adversarial", targets: "零和环不当负环", reason: "答案 7" },
      ];
      for (let i = 0; i < 5; i++) {
        const n = randInt(rng, 2, 12);
        const edges = Array.from({ length: randInt(rng, 1, 20) }, () => [randInt(rng, 1, n), randInt(rng, 1, n), randInt(rng, -5, 30)]);
        const qs = Array.from({ length: randInt(rng, 1, 8) }, () => [randInt(rng, 1, n), randInt(rng, 1, n)]);
        cases.push({ input: mk(n, edges, qs), category: "ordinary", targets: "随机小图多询问", reason: "常规正确性(构造无负环)" });
      }
      return cases;
    },
  },
  AW858: { // Prim 最小生成树：impossible
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const g = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(INF));
      for (let i = 0; i < m; i++) {
        const u = t[2 + 3 * i], v = t[3 + 3 * i], w = t[4 + 3 * i];
        if (w < g[u][v]) { g[u][v] = w; g[v][u] = w; }
      }
      const dist = new Array(n + 1).fill(INF);
      const used = new Array(n + 1).fill(false);
      dist[1] = 0;
      let total = 0;
      for (let round = 0; round < n; round++) {
        let u = -1;
        for (let v = 1; v <= n; v++) if (!used[v] && (u === -1 || dist[v] < dist[u])) u = v;
        if (dist[u] === INF) return "impossible";
        used[u] = true;
        total += dist[u];
        for (let v = 1; v <= n; v++) if (!used[v] && g[u][v] < dist[v]) dist[v] = g[u][v];
      }
      return String(total);
    },
    brute(input) { // Kruskal 对拍：两种 MST 算法总权必一致
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const edges = Array.from({ length: m }, (_, i) => [t[2 + 3 * i], t[3 + 3 * i], t[4 + 3 * i]]).sort((a, b) => a[2] - b[2]);
      const parent = Array.from({ length: n + 1 }, (_, i) => i);
      const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      let total = 0, picked = 0;
      for (const [u, v, w] of edges) { const ru = find(u), rv = find(v); if (ru !== rv) { parent[ru] = rv; total += w; picked++; } }
      return picked === n - 1 ? String(total) : "impossible";
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const connected = (n, extra, lo = -100, hi = 1000) => {
        const edges = Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 2, randInt(rng, lo, hi)]);
        for (let i = 0; i < extra; i++) edges.push([randInt(rng, 1, n), randInt(rng, 1, n), randInt(rng, lo, hi)]);
        return edges;
      };
      const cases = [
        { input: mk(1, []), category: "boundary", targets: "单点树", reason: "总权 0" },
        { input: mk(2, []), category: "boundary", targets: "两点无边", reason: "impossible" },
        { input: mk(3, [[1, 2, -5], [2, 3, -7]]), category: "special", targets: "负权边生成树", reason: "总权 -12" },
        { input: mk(3, [[1, 2, 3], [1, 2, 1], [2, 2, 0], [2, 3, 4]]), category: "special", targets: "重边取小与自环剔除", reason: "答案 5" },
        { input: mk(4, [[1, 2, 1], [3, 4, 1]]), category: "special", targets: "两个孤立分量", reason: "impossible" },
        { input: mk(500, connected(rng ? 500 : 500, 20000)), category: "performance", scale: 20000, targets: "稠密图 2 万边朴素 Prim O(n²)", reason: "500 点稠密" },
        { input: mk(500, connected(500, 200, 1, 1)), category: "performance", scale: 700, targets: "全等权多解树总权唯一", reason: "并列最优选择" },
        { input: mk(4, [[1, 2, 10], [2, 3, 10], [3, 4, 10], [1, 4, 1], [1, 3, 1]]), category: "adversarial", targets: "环上替换重边", reason: "答案 12" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 15); cases.push({ input: mk(n, rng() < 0.8 ? connected(n, randInt(rng, 0, 12)) : Array.from({ length: randInt(rng, 0, 6) }, () => [randInt(rng, 1, n), randInt(rng, 1, n), randInt(rng, 1, 50)])), category: "ordinary", targets: "随机图(连通与否混合)", reason: "与 Kruskal 双算法对拍" }); }
      return cases;
    },
  },
  AW859: { // Kruskal：与 AW858 同判定
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const edges = Array.from({ length: m }, (_, i) => [t[2 + 3 * i], t[3 + 3 * i], t[4 + 3 * i]]).sort((a, b) => a[2] - b[2]);
      const parent = Array.from({ length: n + 1 }, (_, i) => i);
      const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      let total = 0, picked = 0;
      for (const [u, v, w] of edges) { const ru = find(u), rv = find(v); if (ru !== rv) { parent[ru] = rv; total += w; picked++; } }
      return picked === n - 1 ? String(total) : "impossible";
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const connected = (n, extra, lo = -100, hi = 1000) => {
        const edges = Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 2, randInt(rng, lo, hi)]);
        for (let i = 0; i < extra; i++) edges.push([randInt(rng, 1, n), randInt(rng, 1, n), randInt(rng, lo, hi)]);
        return edges;
      };
      const cases = [
        { input: mk(1, []), category: "boundary", targets: "单点", reason: "0" },
        { input: mk(3, [[1, 2, 4]]), category: "boundary", targets: "边数不足", reason: "impossible" },
        { input: mk(4, connected(4, 4, -50, -1)), category: "special", targets: "全负权", reason: "仍取 n-1 条" },
        { input: mk(3, [[1, 1, -100], [1, 2, 5], [2, 3, 5]]), category: "special", targets: "负自环诱惑", reason: "自环不可入树" },
        { input: mk(8000, connected(8000, 8000)), category: "performance", scale: 20000, targets: "1.6 万边排序+并查集满规模", reason: "8 千点稀疏图" },
        { input: mk(2000, connected(2000, 12000, 7, 7)), category: "performance", scale: 20000, targets: "全等权大图", reason: "排序稳定性无关性" },
        { input: mk(5, [[1, 2, 1], [2, 3, 1], [3, 1, 1], [3, 4, 100], [4, 5, 1]]), category: "adversarial", targets: "小环诱导跳边", reason: "环内第三边必弃" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 15); cases.push({ input: mk(n, rng() < 0.8 ? connected(n, randInt(rng, 0, 12)) : Array.from({ length: randInt(rng, 0, 6) }, () => [randInt(rng, 1, n), randInt(rng, 1, n), randInt(rng, 1, 50)])), category: "ordinary", targets: "随机图", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW860: { // 染色法判定二分图
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const adj = Array.from({ length: n + 1 }, () => []);
      for (let i = 0; i < m; i++) { const u = t[2 + 2 * i], v = t[3 + 2 * i]; adj[u].push(v); adj[v].push(u); }
      const color = new Int8Array(n + 1);
      for (let s = 1; s <= n; s++) {
        if (color[s]) continue;
        color[s] = 1;
        const queue = [s];
        for (let head = 0; head < queue.length; head++) {
          const u = queue[head];
          for (const v of adj[u]) {
            if (!color[v]) { color[v] = -color[u]; queue.push(v); }
            else if (color[v] === color[u]) return "No";
          }
        }
      }
      return "Yes";
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const bipartite = (nl, nr, m) => Array.from({ length: m }, () => [randInt(rng, 1, nl), nl + randInt(rng, 1, nr)]);
      const cases = [
        { input: mk(1, []), category: "boundary", targets: "单点无边", reason: "Yes" },
        { input: mk(2, [[1, 1]]), category: "boundary", targets: "自环", reason: "自环同色冲突 No" },
        { input: mk(3, [[1, 2], [2, 3], [3, 1]]), category: "special", targets: "奇环", reason: "三角形 No" },
        { input: mk(4, [[1, 2], [2, 3], [3, 4], [4, 1]]), category: "special", targets: "偶环", reason: "四边形 Yes" },
        { input: mk(7, [[1, 2], [2, 3], [5, 6], [6, 7], [7, 5]]), category: "special", targets: "多分量其一含奇环", reason: "孤立分量也须检查" },
        { input: mk(10000, bipartite(5000, 5000, 20000)), category: "performance", scale: 20000, targets: "2 万边真二分图满规模", reason: "全图染色吞吐" },
        { input: mk(10000, bipartite(5000, 5000, 19999).concat([[1, 2]])), category: "performance", scale: 20000, targets: "大图中一条同侧边破坏二分性", reason: "冲突深藏" },
        { input: mk(5, [[1, 2], [1, 2], [2, 1]]), category: "adversarial", targets: "重边不误判", reason: "平行边合法 Yes" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 15); cases.push({ input: mk(n, Array.from({ length: randInt(rng, 0, 18) }, () => [randInt(rng, 1, n), randInt(rng, 1, n)])), category: "ordinary", targets: "随机小图", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW861: { // 二分图最大匹配(匈牙利)
    solve(input) {
      const t = tokens(input).map(Number);
      const [n1, n2, m] = t;
      const adj = Array.from({ length: n1 + 1 }, () => []);
      for (let i = 0; i < m; i++) adj[t[3 + 2 * i]].push(t[4 + 2 * i]);
      const match = new Int32Array(n2 + 1);
      const tryKuhn = (u, visited) => {
        for (const v of adj[u]) {
          if (visited[v]) continue;
          visited[v] = 1;
          if (!match[v] || tryKuhn(match[v], visited)) { match[v] = u; return true; }
        }
        return false;
      };
      let result = 0;
      for (let u = 1; u <= n1; u++) if (tryKuhn(u, new Uint8Array(n2 + 1))) result++;
      return String(result);
    },
    brute(input) { // 小规模：枚举左点子集的递归最大匹配
      const t = tokens(input).map(Number);
      const [n1, n2, m] = t;
      const adj = Array.from({ length: n1 + 1 }, () => []);
      for (let i = 0; i < m; i++) adj[t[3 + 2 * i]].push(t[4 + 2 * i]);
      const usedR = new Uint8Array(n2 + 1);
      const go = (u) => {
        if (u > n1) return 0;
        let best = go(u + 1);
        for (const v of adj[u]) if (!usedR[v]) { usedR[v] = 1; best = Math.max(best, 1 + go(u + 1)); usedR[v] = 0; }
        return best;
      };
      return String(go(1));
    },
    gen(rng) {
      const mk = (n1, n2, edges) => `${n1} ${n2} ${edges.length}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(1, 1, [[1, 1]]), category: "boundary", targets: "单边匹配", reason: "1" },
        { input: mk(2, 2, []), category: "boundary", targets: "无边", reason: "0" },
        { input: mk(3, 1, [[1, 1], [2, 1], [3, 1]]), category: "special", targets: "右侧独木桥", reason: "最大匹配 1" },
        { input: mk(3, 3, [[1, 1], [2, 1], [2, 2], [3, 2]]), category: "special", targets: "增广路径换位", reason: "答案 3 需两次让位" },
        { input: mk(500, 500, Array.from({ length: 8000 }, () => [randInt(rng, 1, 500), randInt(rng, 1, 500)])), category: "performance", scale: 8000, targets: "8 千边随机二分图", reason: "匈牙利满规模" },
        { input: mk(500, 500, Array.from({ length: 500 }, (_, i) => [i + 1, i + 1]).concat(Array.from({ length: 499 }, (_, i) => [i + 2, i + 1]))), category: "performance", scale: 1000, targets: "梯形结构长增广链", reason: "反复让位最坏链" },
        { input: mk(4, 4, [[1, 1], [1, 2], [2, 1], [3, 2], [4, 3]]), category: "adversarial", targets: "贪心首选冲突", reason: "需要回溯让位" },
      ];
      for (let i = 0; i < 6; i++) {
        const n1 = randInt(rng, 1, 7), n2 = randInt(rng, 1, 7);
        cases.push({ input: mk(n1, n2, Array.from({ length: randInt(rng, 0, 12) }, () => [randInt(rng, 1, n1), randInt(rng, 1, n2)])), category: "ordinary", targets: "随机小二分图", reason: "与枚举匹配对拍" });
      }
      return cases;
    },
  },
};
