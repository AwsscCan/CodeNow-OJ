/* CodeNow OJ · AcWing needs_review 补全批次1：高精度/前缀差分/双指针/数据结构 · Bamzc */

import { randArray, randInt, tokens } from "./lib.mjs";

/** 题面自撰(原自动提取缺失)，参考解产出数据，均 skipAnchor + rewriteStatement */
export const ACWING_REVIEW_1 = {
  AW791: {
    title: "高精度加法", difficulty: "入门", skipAnchor: true,
    description: "给定两个非负整数 a 和 b，求它们的和。a、b 的位数不超过 100000。",
    inputFormat: "共两行，第一行为整数 a，第二行为整数 b。",
    outputFormat: "一个整数，表示 a + b。",
    solve(input) { const [a, b] = tokens(input); return String(BigInt(a) + BigInt(b)); },
    gen(rng) {
      const big = (len) => (randInt(rng, 1, 9) + Array.from({ length: len - 1 }, () => randInt(rng, 0, 9)).join(""));
      const mk = (a, b) => `${a}\n${b}`;
      const cases = [
        { input: mk("12", "23"), category: "sample", targets: "基础相加", reason: "35" },
        { input: mk("0", "0"), category: "boundary", targets: "双零", reason: "0" },
        { input: mk("999", "1"), category: "boundary", targets: "进位链", reason: "1000" },
        { input: mk("99999999999999999999", "1"), category: "special", targets: "超 64 位进位", reason: "必须高精度" },
        { input: mk(big(100000), big(100000)), category: "performance", scale: 100000, targets: "10 万位大数相加", reason: "线性进位" },
        { input: mk("9".repeat(100000), "9".repeat(100000)), category: "performance", scale: 100000, targets: "全 9 连续进位", reason: "最长进位链" },
        { input: mk("500000000000", "500000000000"), category: "adversarial", targets: "中段进位", reason: "1e12 级" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(big(randInt(rng, 1, 20)), big(randInt(rng, 1, 20))), category: "ordinary", targets: "随机大数", reason: "常规正确性" });
      return cases;
    },
  },
  AW792: {
    title: "高精度减法", difficulty: "入门", skipAnchor: true,
    description: "给定两个非负整数 a 和 b，求 a - b（保证 a ≥ b）。a、b 的位数不超过 100000。",
    inputFormat: "共两行，第一行为整数 a，第二行为整数 b（a ≥ b）。",
    outputFormat: "一个整数，表示 a - b。",
    solve(input) { const [a, b] = tokens(input); return String(BigInt(a) - BigInt(b)); },
    gen(rng) {
      const big = (len) => (randInt(rng, 1, 9) + Array.from({ length: len - 1 }, () => randInt(rng, 0, 9)).join(""));
      const mk = (a, b) => `${a}\n${b}`;
      const cases = [
        { input: mk("35", "12"), category: "sample", targets: "基础相减", reason: "23" },
        { input: mk("5", "5"), category: "boundary", targets: "结果为零", reason: "0" },
        { input: mk("1000", "1"), category: "boundary", targets: "借位链", reason: "999" },
        { input: mk("100000000000000000000", "1"), category: "special", targets: "超 64 位借位", reason: "高精度" },
        { input: mk("1" + "0".repeat(100000), "1"), category: "performance", scale: 100000, targets: "10 万位借位链", reason: "全借位" },
        { input: mk(big(100000), big(50000)), category: "performance", scale: 100000, targets: "大数减中数", reason: "前导零裁剪" },
        { input: mk("10000", "9999"), category: "adversarial", targets: "接近相等", reason: "结果 1" },
      ];
      for (let i = 0; i < 6; i++) { const a = BigInt(big(randInt(rng, 2, 20))); const b = BigInt(big(randInt(rng, 1, 18))); const [hi, lo] = a >= b ? [a, b] : [b, a]; cases.push({ input: mk(String(hi), String(lo)), category: "ordinary", targets: "随机大数(保证 a≥b)", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW793: {
    title: "高精度乘法", difficulty: "普及", skipAnchor: true,
    description: "给定一个非负大整数 a（位数不超过 100000）和一个非负整数 b（0 ≤ b ≤ 10000），求 a × b。",
    inputFormat: "共两行，第一行为大整数 a，第二行为整数 b。",
    outputFormat: "一个整数，表示 a × b。",
    solve(input) { const [a, b] = tokens(input); return String(BigInt(a) * BigInt(b)); },
    gen(rng) {
      const big = (len) => (randInt(rng, 1, 9) + Array.from({ length: len - 1 }, () => randInt(rng, 0, 9)).join(""));
      const mk = (a, b) => `${a}\n${b}`;
      const cases = [
        { input: mk("12", "3"), category: "sample", targets: "基础相乘", reason: "36" },
        { input: mk("12345", "0"), category: "boundary", targets: "乘零", reason: "0" },
        { input: mk("0", "9999"), category: "boundary", targets: "零乘数", reason: "0" },
        { input: mk("99999999999999999999", "10000"), category: "special", targets: "超 64 位乘法", reason: "高精度乘单精" },
        { input: mk(big(100000), "9999"), category: "performance", scale: 100000, targets: "10 万位×大单精", reason: "线性乘法进位" },
        { input: mk("9".repeat(100000), "9"), category: "performance", scale: 100000, targets: "全 9 大数×9", reason: "满进位" },
        { input: mk("123456789", "1"), category: "adversarial", targets: "乘一恒等", reason: "原数" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(big(randInt(rng, 1, 20)), String(randInt(rng, 0, 10000))), category: "ordinary", targets: "随机大数×单精", reason: "常规正确性" });
      return cases;
    },
  },
  AW794: {
    title: "高精度除法", difficulty: "普及", skipAnchor: true,
    description: "给定一个非负大整数 a（位数不超过 100000）和一个正整数 b（1 ≤ b ≤ 10000），求 a ÷ b 的商与余数。",
    inputFormat: "共两行，第一行为大整数 a，第二行为整数 b。",
    outputFormat: "两行，第一行为商，第二行为余数。",
    solve(input) { const [a, b] = tokens(input); const A = BigInt(a), B = BigInt(b); return `${A / B}\n${A % B}`; },
    gen(rng) {
      const big = (len) => (randInt(rng, 1, 9) + Array.from({ length: len - 1 }, () => randInt(rng, 0, 9)).join(""));
      const mk = (a, b) => `${a}\n${b}`;
      const cases = [
        { input: mk("100", "7"), category: "sample", targets: "带余除法", reason: "商 14 余 2" },
        { input: mk("0", "5"), category: "boundary", targets: "零被除", reason: "0 0" },
        { input: mk("10000", "1"), category: "boundary", targets: "除一", reason: "商即原数余 0" },
        { input: mk("99999999999999999999", "9999"), category: "special", targets: "超 64 位除法", reason: "高精度除单精" },
        { input: mk(big(100000), "7"), category: "performance", scale: 100000, targets: "10 万位除单精", reason: "逐位试商" },
        { input: mk("9".repeat(100000), "9"), category: "performance", scale: 100000, targets: "全 9 整除", reason: "商全 1 余 0" },
        { input: mk("999", "1000"), category: "adversarial", targets: "被除数小于除数", reason: "商 0 余 999" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(big(randInt(rng, 1, 20)), String(randInt(rng, 1, 10000))), category: "ordinary", targets: "随机大数÷单精", reason: "常规正确性" });
      return cases;
    },
  },
  AW795: {
    title: "前缀和", difficulty: "入门", skipAnchor: true,
    description: "给定长度为 n 的整数序列，有 m 次询问，每次询问区间 [l, r] 的元素之和。",
    inputFormat: "第一行两个整数 n 和 m（1 ≤ n, m ≤ 100000）。第二行 n 个整数（绝对值不超过 1000）。接下来 m 行，每行两个整数 l r（1 ≤ l ≤ r ≤ n）。",
    outputFormat: "m 行，每行一个整数，表示区间和。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const pre = new Array(n + 1).fill(0);
      for (let i = 1; i <= n; i++) pre[i] = pre[i - 1] + t[1 + i];
      const out = [];
      for (let i = 0; i < m; i++) { const l = t[2 + n + 2 * i], r = t[3 + n + 2 * i]; out.push(pre[r] - pre[l - 1]); }
      return out.join("\n");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t; const a = t.slice(2, 2 + n); const out = [];
      for (let i = 0; i < m; i++) { const l = t[2 + n + 2 * i], r = t[3 + n + 2 * i]; let s = 0; for (let j = l - 1; j < r; j++) s += a[j]; out.push(s); }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (arr, qs) => `${arr.length} ${qs.length}\n${arr.join(" ")}\n${qs.map((q) => q.join(" ")).join("\n")}`;
      const big = randArray(rng, 10000, -1000, 1000);
      const bigQ = Array.from({ length: 10000 }, () => { const l = randInt(rng, 1, 10000); return [l, randInt(rng, l, 10000)]; });
      const cases = [
        { input: mk([1, 2, 3, 4], [[1, 4], [2, 3]]), category: "sample", targets: "基础前缀和", reason: "10 与 5" },
        { input: mk([5], [[1, 1]]), category: "boundary", targets: "单元素", reason: "5" },
        { input: mk([-1000, 1000], [[1, 2]]), category: "boundary", targets: "值域两端", reason: "0" },
        { input: mk(Array.from({ length: 100 }, () => 1000), [[1, 100]]), category: "special", targets: "满值区间", reason: "100000" },
        { input: mk(big, bigQ), category: "performance", scale: 20000, targets: "1 万询问卡逐项累加", reason: "前缀和 O(1) 查询" },
        { input: mk(big, Array.from({ length: 10000 }, () => [1, 10000])), category: "adversarial", scale: 20000, targets: "全量区间重复", reason: "最长区间" },
      ];
      for (let i = 0; i < 6; i++) { const n = randInt(rng, 2, 40); cases.push({ input: mk(randArray(rng, n, -100, 100), Array.from({ length: randInt(rng, 1, 6) }, () => { const l = randInt(rng, 1, n); return [l, randInt(rng, l, n)]; })), category: "ordinary", targets: "随机数组", reason: "与逐项对拍" }); }
      return cases;
    },
  },
  AW797: {
    title: "差分", difficulty: "入门", skipAnchor: true,
    description: "给定长度为 n 的整数序列，进行 m 次操作，每次给区间 [l, r] 内所有元素加上 c。输出所有操作完成后的序列。",
    inputFormat: "第一行两个整数 n 和 m（1 ≤ n, m ≤ 100000）。第二行 n 个整数（初始序列）。接下来 m 行，每行三个整数 l r c。",
    outputFormat: "一行 n 个整数，表示最终序列。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const diff = new Array(n + 2).fill(0);
      for (let i = 1; i <= n; i++) { diff[i] += t[1 + i]; diff[i + 1] -= t[1 + i]; }
      for (let i = 0; i < m; i++) { const l = t[2 + n + 3 * i], r = t[3 + n + 3 * i], c = t[4 + n + 3 * i]; diff[l] += c; diff[r + 1] -= c; }
      const out = []; let cur = 0;
      for (let i = 1; i <= n; i++) { cur += diff[i]; out.push(cur); }
      return out.join(" ");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t; const a = t.slice(2, 2 + n);
      for (let i = 0; i < m; i++) { const l = t[2 + n + 3 * i], r = t[3 + n + 3 * i], c = t[4 + n + 3 * i]; for (let j = l - 1; j < r; j++) a[j] += c; }
      return a.join(" ");
    },
    gen(rng) {
      const mk = (arr, ops) => `${arr.length} ${ops.length}\n${arr.join(" ")}\n${ops.map((o) => o.join(" ")).join("\n")}`;
      const big = randArray(rng, 8000, -1000, 1000);
      const bigOps = Array.from({ length: 8000 }, () => { const l = randInt(rng, 1, 8000); return [l, randInt(rng, l, 8000), randInt(rng, -1000, 1000)]; });
      const cases = [
        { input: mk([1, 2, 3, 4], [[1, 3, 1], [2, 4, 2]]), category: "sample", targets: "两次区间加", reason: "2 5 6 6" },
        { input: mk([0], [[1, 1, 5]]), category: "boundary", targets: "单元素加", reason: "5" },
        { input: mk([1, 1, 1], [[1, 3, -1]]), category: "boundary", targets: "整段减", reason: "0 0 0" },
        { input: mk(Array.from({ length: 100 }, () => 0), [[1, 100, 1000]]), category: "special", targets: "全段满值加", reason: "全 1000" },
        { input: mk(big, bigOps), category: "performance", scale: 15000, targets: "8 千操作卡逐点更新", reason: "差分 O(1) 区间加" },
        { input: mk(big, Array.from({ length: 8000 }, () => [1, 8000, 1])), category: "adversarial", scale: 15000, targets: "全量区间重复加", reason: "全序列累加" },
      ];
      for (let i = 0; i < 6; i++) { const n = randInt(rng, 2, 40); cases.push({ input: mk(randArray(rng, n, -50, 50), Array.from({ length: randInt(rng, 1, 6) }, () => { const l = randInt(rng, 1, n); return [l, randInt(rng, l, n), randInt(rng, -20, 20)]; })), category: "ordinary", targets: "随机操作", reason: "与逐点对拍" }); }
      return cases;
    },
  },
  AW2816: {
    title: "判断子序列", difficulty: "入门", skipAnchor: true,
    description: "给定长度为 n 的序列 a 和长度为 m 的序列 b，判断 a 是否为 b 的子序列（可不连续但保持相对顺序）。",
    inputFormat: "第一行两个整数 n 和 m（1 ≤ n ≤ m ≤ 100000）。第二行 n 个整数表示 a。第三行 m 个整数表示 b。",
    outputFormat: "若 a 是 b 的子序列输出 Yes，否则输出 No。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const a = t.slice(2, 2 + n), b = t.slice(2 + n, 2 + n + m);
      let i = 0;
      for (let j = 0; j < m && i < n; j++) if (a[i] === b[j]) i++;
      return i === n ? "Yes" : "No";
    },
    gen(rng) {
      const mk = (a, b) => `${a.length} ${b.length}\n${a.join(" ")}\n${b.join(" ")}`;
      const cases = [
        { input: mk([1, 3, 5], [1, 2, 3, 4, 5]), category: "sample", targets: "基础子序列", reason: "Yes" },
        { input: mk([5, 3], [1, 3, 5]), category: "sample", targets: "顺序不符", reason: "No" },
        { input: mk([1], [1]), category: "boundary", targets: "单元素相等", reason: "Yes" },
        { input: mk([2], [1]), category: "boundary", targets: "单元素不等", reason: "No" },
        { input: mk(Array.from({ length: 30000 }, () => 1), Array.from({ length: 30000 }, () => 1)), category: "performance", scale: 100000, targets: "长度相等匹配", reason: "双指针一遍扫" },
        { input: mk(Array.from({ length: 15000 }, (_, i) => i), Array.from({ length: 30000 }, (_, i) => Math.floor(i / 2))), category: "performance", scale: 100000, targets: "较大规模稀疏匹配", reason: "指针满扫" },
        { input: mk([1, 2, 3], [3, 2, 1]), category: "adversarial", targets: "逆序 b", reason: "No" },
      ];
      for (let i = 0; i < 6; i++) { const m = randInt(rng, 2, 30); const b = randArray(rng, m, 1, 9); const a = b.filter(() => rng() < 0.5); cases.push({ input: mk(a.length ? a : [b[0]], b), category: "ordinary", targets: "从 b 抽取子序列", reason: "构造 Yes 为主" }); }
      return cases;
    },
  },
  AW154: {
    title: "滑动窗口", difficulty: "普及", skipAnchor: true,
    description: "给定长度为 n 的序列和窗口大小 k，窗口从左向右滑动。每次输出窗口内的最小值，然后另起一行输出每个窗口内的最大值。",
    inputFormat: "第一行两个整数 n 和 k（1 ≤ k ≤ n ≤ 100000）。第二行 n 个整数（绝对值不超过 1000000000）。",
    outputFormat: "两行：第一行为各窗口最小值，第二行为各窗口最大值，均用空格分隔。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, k] = t;
      const a = t.slice(2, 2 + n);
      const slide = (cmp) => {
        const dq = new Int32Array(n); let h = 0, tl = 0; const out = [];
        for (let i = 0; i < n; i++) {
          while (tl > h && cmp(a[dq[tl - 1]], a[i])) tl--;
          dq[tl++] = i;
          if (dq[h] <= i - k) h++;
          if (i >= k - 1) out.push(a[dq[h]]);
        }
        return out.join(" ");
      };
      return `${slide((x, y) => x >= y)}\n${slide((x, y) => x <= y)}`;
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, k] = t; const a = t.slice(2, 2 + n);
      const mins = [], maxs = [];
      for (let i = 0; i + k <= n; i++) { const w = a.slice(i, i + k); mins.push(Math.min(...w)); maxs.push(Math.max(...w)); }
      return `${mins.join(" ")}\n${maxs.join(" ")}`;
    },
    gen(rng) {
      const mk = (arr, k) => `${arr.length} ${k}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([1, 3, -1, -3, 5, 3, 6, 7], 3), category: "sample", targets: "经典样例", reason: "min/max 两行" },
        { input: mk([5], 1), category: "boundary", targets: "单元素窗口", reason: "自身" },
        { input: mk([9, 8], 2), category: "boundary", targets: "单窗口", reason: "8 与 9" },
        { input: mk(Array.from({ length: 500 }, (_, i) => 500 - i), 100), category: "special", targets: "严格递减队头频繁过期", reason: "单调队列换手" },
        { input: mk(randArray(rng, 20000, -1000000000, 1000000000), 10000), category: "performance", scale: 100000, targets: "2 万大窗口卡 O(nk)", reason: "单调队列 O(n)" },
        { input: mk(Array.from({ length: 30000 }, () => 5), 137), category: "performance", scale: 100000, targets: "全等值弹出策略(3 万)", reason: "同值比较" },
        { input: mk([5, 5, 4, 4, 5, 5], 3), category: "adversarial", targets: "同值与回升", reason: "队内同值处理" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 40); cases.push({ input: mk(randArray(rng, n, -50, 50), randInt(rng, 1, n)), category: "ordinary", targets: "随机窗口", reason: "与逐窗对拍" }); }
      return cases;
    },
  },
  AW840: {
    title: "模拟散列表", difficulty: "普及", skipAnchor: true,
    description: "维护一个集合，支持两种操作：I x 插入整数 x；Q x 询问 x 是否在集合中。",
    inputFormat: "第一行一个整数 N（1 ≤ N ≤ 100000）。接下来 N 行，每行一个操作 I x 或 Q x（x 绝对值不超过 1000000000）。",
    outputFormat: "对每个 Q 操作输出一行 Yes 或 No。",
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const N = Number(lines[0]);
      const set = new Set();
      const out = [];
      for (let i = 1; i <= N; i++) { const [op, x] = lines[i].split(/\s+/); if (op === "I") set.add(x); else out.push(set.has(x) ? "Yes" : "No"); }
      return out.join("\n");
    },
    gen(rng) {
      const script = (n, vals) => {
        const cmds = []; let hasQ = false;
        for (let i = 0; i < n; i++) { const x = vals[randInt(rng, 0, vals.length - 1)]; if (rng() < 0.5) cmds.push(`I ${x}`); else { cmds.push(`Q ${x}`); hasQ = true; } }
        if (!hasQ) cmds.push(`Q ${vals[0]}`);
        return `${cmds.length}\n${cmds.join("\n")}`;
      };
      const cases = [
        { input: "2\nI 5\nQ 5", category: "sample", targets: "插入即查", reason: "Yes" },
        { input: "1\nQ 7", category: "boundary", targets: "查空集", reason: "No" },
        { input: "3\nI -1000000000\nQ -1000000000\nQ 1000000000", category: "boundary", targets: "值域两端", reason: "Yes No" },
        { input: "4\nI 3\nI 3\nQ 3\nQ 4", category: "special", targets: "重复插入", reason: "Yes No" },
        { input: script(15000, Array.from({ length: 50 }, () => randInt(rng, -1000000000, 1000000000))), category: "performance", scale: 100000, targets: "1.5 万操作高命中", reason: "散列 O(1)" },
        { input: script(15000, Array.from({ length: 15000 }, () => randInt(rng, -1000000000, 1000000000))), category: "performance", scale: 100000, targets: "大值域低命中(1.5 万)", reason: "散列冲突压力" },
        { input: "5\nQ 1\nI 1\nQ 1\nI 2\nQ 2", category: "adversarial", targets: "查询先于插入", reason: "No Yes Yes" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: script(randInt(rng, 2, 30), Array.from({ length: 6 }, () => randInt(rng, -20, 20))), category: "ordinary", targets: "随机操作", reason: "常规正确性" });
      return cases;
    },
  },
  AW850: {
    title: "Dijkstra 求最短路 II", difficulty: "提高", skipAnchor: true,
    description: "给定 n 个点 m 条边的有向图，边权为正。求 1 号点到 n 号点的最短距离，不存在则输出 -1。（堆优化版，数据规模更大）",
    inputFormat: "第一行两个整数 n 和 m（1 ≤ n ≤ 100000，1 ≤ m ≤ 200000）。接下来 m 行，每行三个整数 x y z 表示 x→y 边权 z（1 ≤ z ≤ 10000）。",
    outputFormat: "一个整数，1 到 n 的最短距离，不可达输出 -1。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const head = new Int32Array(n + 1).fill(-1);
      const nxt = new Int32Array(m), to = new Int32Array(m), wt = new Int32Array(m);
      for (let i = 0; i < m; i++) { const x = t[2 + 3 * i]; to[i] = t[3 + 3 * i]; wt[i] = t[4 + 3 * i]; nxt[i] = head[x]; head[x] = i; }
      const dist = new Float64Array(n + 1).fill(Infinity); dist[1] = 0;
      const hd = [0], hn = [1];
      const swap = (i, j) => { [hd[i], hd[j]] = [hd[j], hd[i]]; [hn[i], hn[j]] = [hn[j], hn[i]]; };
      const push = (d, v) => { hd.push(d); hn.push(v); let i = hd.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hd[p] <= hd[i]) break; swap(p, i); i = p; } };
      const pop = () => { const d = hd[0], v = hn[0]; const ld = hd.pop(), lv = hn.pop(); if (hd.length) { hd[0] = ld; hn[0] = lv; let i = 0; for (;;) { let s = i; const l = 2 * i + 1, r = 2 * i + 2; if (l < hd.length && hd[l] < hd[s]) s = l; if (r < hd.length && hd[r] < hd[s]) s = r; if (s === i) break; swap(s, i); i = s; } } return [d, v]; };
      while (hd.length) { const [d, u] = pop(); if (d > dist[u]) continue; for (let e = head[u]; e !== -1; e = nxt[e]) { const nd = d + wt[e]; if (nd < dist[to[e]]) { dist[to[e]] = nd; push(nd, to[e]); } } }
      return String(dist[n] === Infinity ? -1 : dist[n]);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const edges = Array.from({ length: m }, (_, i) => [t[2 + 3 * i], t[3 + 3 * i], t[4 + 3 * i]]);
      const dist = new Array(n + 1).fill(Infinity); dist[1] = 0;
      for (let r = 0; r < n; r++) { let ch = false; for (const [u, v, w] of edges) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; ch = true; } if (!ch) break; }
      return String(dist[n] === Infinity ? -1 : dist[n]);
    },
    gen(rng) {
      const mk = (n, edges) => `${n} ${edges.length}\n${edges.map((e) => e.join(" ")).join("\n")}`;
      const reach = (n, extra) => { const e = Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 2, randInt(rng, 1, 10000)]); for (let i = 0; i < extra; i++) e.push([randInt(rng, 1, n), randInt(rng, 1, n), randInt(rng, 1, 10000)]); return e; };
      const cases = [
        { input: mk(3, [[1, 2, 2], [2, 3, 1], [1, 3, 4]]), category: "sample", targets: "两段更短", reason: "3" },
        { input: mk(2, [[1, 2, 7]]), category: "boundary", targets: "单边直达", reason: "7" },
        { input: mk(2, [[2, 1, 5]]), category: "boundary", targets: "反向不可达", reason: "-1" },
        { input: mk(4, [[1, 2, 1], [2, 4, 100], [1, 3, 10], [3, 4, 1]]), category: "special", targets: "首步贪心陷阱", reason: "11" },
        { input: mk(7000, reach(7000, 10000)), category: "performance", scale: 200000, targets: "7 千点 1 万边堆优化", reason: "Dijkstra II 满规模" },
        { input: mk(8000, Array.from({ length: 7999 }, (_, i) => [i + 1, i + 2, 1])), category: "performance", scale: 100000, targets: "长链最短路(8 千点)", reason: "答案 7999" },
        { input: mk(5, [[1, 2, 3], [2, 3, 3], [3, 4, 3], [4, 5, 3], [1, 5, 100]]), category: "adversarial", targets: "多段优于直达", reason: "12 优于 100" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 15); cases.push({ input: mk(n, reach(n, randInt(rng, 0, 12))), category: "ordinary", targets: "随机小图", reason: "与 Bellman-Ford 对拍" }); }
      return cases;
    },
  },
};
