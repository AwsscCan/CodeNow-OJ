/* CodeNow OJ · 竞赛真题题库(CSP-J/S 认证初级 · NOIP 普及 · 蓝桥杯)定义 · Bamzc */

import { randArray, randInt, shuffle, tokens } from "./lib.mjs";

/** 竞赛真题：改编自历年公开真题的入门/普及难度题，题面自撰、参考解产出数据 */
export const CONTEST_DEFS = [
  {
    id: "CS001", title: "CSP-J 分数线划定", difficulty: "普及", folder: "竞赛真题/CSP-J 入门级",
    sourceUrl: "https://www.noi.cn/",
    description: "某次认证有 n 名选手，第 i 名选手编号为 id[i]、成绩为 s[i]。按成绩从高到低排序，成绩相同则编号小的在前。计划录取 m 名（m ≥ 1），最终分数线为排序后第 m 名的成绩，所有成绩不低于分数线的选手都被录取。求分数线与实际录取人数。",
    inputFormat: "第一行两个整数 n 和 m（1 ≤ m ≤ n ≤ 100000）。接下来 n 行，每行两个整数 id[i] 和 s[i]（1 ≤ id[i] ≤ 1000000000，0 ≤ s[i] ≤ 1000000000）。",
    outputFormat: "一行两个整数：分数线与实际录取人数。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const people = [];
      for (let i = 0; i < n; i++) people.push([t[2 + 2 * i], t[3 + 2 * i]]);
      people.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      const line = people[m - 1][1];
      const admitted = people.filter((p) => p[1] >= line).length;
      return `${line} ${admitted}`;
    },
    gen(rng) {
      const mk = (m, ppl) => `${ppl.length} ${m}\n${ppl.map((p) => p.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(1, [[5, 100]]), category: "sample", targets: "单人录取", reason: "分数线即其成绩" },
        { input: mk(2, [[1, 90], [2, 90], [3, 80]]), category: "sample", targets: "同分扩录", reason: "并列使录取超 m" },
        { input: mk(1, [[9, 0], [3, 0]]), category: "boundary", targets: "零分并列", reason: "编号小在前" },
        { input: mk(3, [[1, 5], [2, 5], [3, 5]]), category: "boundary", targets: "全同分全录", reason: "分数线 5 录 3 人" },
        { input: mk(7500, shuffle(rng, Array.from({ length: 15000 }, (_, i) => [i + 1, i % 1000]))), category: "performance", scale: 100000, targets: "1.5 万选手排序卡 O(n²)", reason: "大量同分扩录" },
        { input: mk(1, [[1000000000, 1000000000], [1, 999999999]]), category: "special", targets: "值域上界", reason: "大成绩大编号" },
        { input: mk(2, [[3, 70], [1, 70], [2, 85]]), category: "adversarial", targets: "同分排序稳定性", reason: "分数线处并列排序" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 1, 40); cases.push({ input: mk(randInt(rng, 1, n), Array.from({ length: n }, (_, k) => [k + 1, randInt(rng, 0, 30)])), category: "ordinary", targets: "随机成绩", reason: "常规正确性" }); }
      return cases;
    },
  },
  {
    id: "CS002", title: "CSP-J 数字游戏", difficulty: "普及", folder: "竞赛真题/CSP-J 入门级",
    sourceUrl: "https://www.noi.cn/",
    description: "给定正整数 n，反复将其各位数字之和作为新的 n，直到 n 变为一位数为止。求最终得到的一位数（数字根）。",
    inputFormat: "一行一个正整数 n（1 ≤ n ≤ 10^18）。",
    outputFormat: "一个一位数，表示 n 的数字根。",
    solve(input) {
      let s = tokens(input)[0];
      while (s.length > 1) {
        let sum = 0;
        for (const ch of s) sum += Number(ch);
        s = String(sum);
      }
      return s;
    },
    brute(input) {
      const n = BigInt(tokens(input)[0]);
      const dr = n === 0n ? 0n : 1n + (n - 1n) % 9n;
      return String(dr);
    },
    gen(rng) {
      const cases = [
        { input: "1", category: "sample", targets: "已是一位数", reason: "直接输出" },
        { input: "38", category: "sample", targets: "两步收敛", reason: "3+8=11→2" },
        { input: "9", category: "boundary", targets: "数字根 9", reason: "9 的倍数特例" },
        { input: "999999999999999999", category: "boundary", scale: 2, targets: "18 位上界", reason: "大数逐位求和" },
        { input: "1000000000000000000", category: "special", targets: "1e18 整", reason: "数字根 1" },
        { input: "123456789", category: "performance", scale: 2, targets: "多位快速收敛", reason: "常数轮迭代" },
        { input: "88888888888888888", category: "adversarial", targets: "全 8 高位和", reason: "首轮和很大" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: String(randInt(rng, 1, 1000000000)), category: "ordinary", targets: "随机数", reason: "与数字根公式对拍" });
      return cases;
    },
  },
  {
    id: "CS003", title: "CSP-J 摆放积木", difficulty: "普及", folder: "竞赛真题/CSP-J 入门级",
    sourceUrl: "https://www.noi.cn/",
    description: "有 n 块高度分别为 h[i] 的积木排成一行。每次操作可将任意一块积木的高度减 1（不能减到负数）。要把所有积木削成不严格递增（h[1] ≤ h[2] ≤ … ≤ h[n]）的形状，求最少操作次数。",
    inputFormat: "第一行一个整数 n（1 ≤ n ≤ 100000）。第二行 n 个整数 h[i]（0 ≤ h[i] ≤ 1000000000）。",
    outputFormat: "一个整数，最少操作次数。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      let cap = Infinity, total = 0n;
      // 从右往左，每块不得超过右边的上限
      for (let i = n; i >= 1; i--) {
        const h = t[i];
        if (h > cap) { total += BigInt(h - cap); } else cap = h;
      }
      return String(total);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const h = t.slice(1, 1 + n);
      let cap = Infinity, total = 0n;
      for (let i = n - 1; i >= 0; i--) {
        if (h[i] > cap) total += BigInt(h[i] - cap);
        else cap = h[i];
      }
      return String(total);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([3]), category: "sample", targets: "单块无需操作", reason: "0" },
        { input: mk([3, 2, 1]), category: "sample", targets: "严格递减", reason: "削成 1 1 1 需 3 步" },
        { input: mk([1, 2, 3]), category: "boundary", targets: "已递增", reason: "0" },
        { input: mk([0, 0, 0]), category: "boundary", targets: "全零", reason: "0" },
        { input: mk(Array.from({ length: 20000 }, () => 1000000000)), category: "performance", scale: 100000, targets: "全等大值卡溢出", reason: "已满足递增答案 0" },
        { input: mk(Array.from({ length: 20000 }, (_, i) => 20000 - i)), category: "performance", scale: 100000, targets: "严格递减满规模", reason: "累计削减超 32 位" },
        { input: mk([5, 1, 5, 1, 5]), category: "adversarial", targets: "锯齿形", reason: "从右传递上限" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 2, 40), 0, 100)), category: "ordinary", targets: "随机高度", reason: "与逐块暴力对拍" });
      return cases;
    },
  },
  {
    id: "CS004", title: "NOIP 普及 · 最大连续段和", difficulty: "普及", folder: "竞赛真题/NOIP 普及组",
    sourceUrl: "https://www.noi.cn/",
    description: "给定长度为 n 的整数序列，求一个非空连续子段，使其元素之和最大，输出这个最大和。",
    inputFormat: "第一行一个整数 n（1 ≤ n ≤ 200000）。第二行 n 个整数（绝对值不超过 10000）。",
    outputFormat: "一个整数，最大连续子段和。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      let best = -Infinity, cur = 0;
      for (let i = 0; i < n; i++) {
        cur = Math.max(t[1 + i], cur + t[1 + i]);
        if (cur > best) best = cur;
      }
      return String(best);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const a = t.slice(1, 1 + n);
      let best = -Infinity;
      for (let i = 0; i < n; i++) { let s = 0; for (let j = i; j < n; j++) { s += a[j]; best = Math.max(best, s); } }
      return String(best);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([1, -2, 3, 4, -1]), category: "sample", targets: "经典样例", reason: "3+4=7" },
        { input: mk([5]), category: "sample", targets: "单元素", reason: "5" },
        { input: mk([-5, -2, -9]), category: "boundary", targets: "全负数", reason: "取最大单元素 -2" },
        { input: mk([-10000, 10000]), category: "boundary", targets: "值域两端", reason: "10000" },
        { input: mk(randArray(rng, 40000, -10000, 10000)), category: "performance", scale: 200000, targets: "4 万卡 O(n²)", reason: "线性 DP 必需" },
        { input: mk(Array.from({ length: 40000 }, () => -1)), category: "performance", scale: 200000, targets: "全负满规模", reason: "答案 -1" },
        { input: mk([3, -1, 4, -1, 5, -9, 2, 6]), category: "adversarial", targets: "多峰选择", reason: "3-1+4-1+5=10" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 2, 50), -50, 50)), category: "ordinary", targets: "随机序列", reason: "与 O(n²) 对拍" });
      return cases;
    },
  },
  {
    id: "CS005", title: "NOIP 普及 · 校门外的树", difficulty: "普及", folder: "竞赛真题/NOIP 普及组",
    sourceUrl: "https://www.noi.cn/",
    description: "一条长度为 L 的马路（坐标 0 到 L）上每个整数点都种有一棵树。现有 m 个区间 [a,b]（含端点）内的树被移走。求最后剩下的树的数量。区间可能重叠。",
    inputFormat: "第一行两个整数 L 和 m（1 ≤ L ≤ 10000000，0 ≤ m ≤ 100000）。接下来 m 行，每行两个整数 a 和 b（0 ≤ a ≤ b ≤ L）。",
    outputFormat: "一个整数，剩余的树的数量。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [L, m] = t;
      if (m === 0) return String(L + 1);
      const segs = [];
      for (let i = 0; i < m; i++) segs.push([t[2 + 2 * i], t[3 + 2 * i]]);
      segs.sort((a, b) => a[0] - b[0]);
      // 合并区间后累加各段长度
      let removed = 0, curL = segs[0][0], curR = segs[0][1];
      for (let i = 1; i < segs.length; i++) {
        const [a, b] = segs[i];
        if (a > curR) { removed += curR - curL + 1; curL = a; curR = b; }
        else curR = Math.max(curR, b);
      }
      removed += curR - curL + 1;
      return String(L + 1 - removed);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [L, m] = t;
      const alive = new Uint8Array(L + 1).fill(1);
      for (let i = 0; i < m; i++) { const a = t[2 + 2 * i], b = t[3 + 2 * i]; for (let x = a; x <= b; x++) alive[x] = 0; }
      let count = 0;
      for (let x = 0; x <= L; x++) count += alive[x];
      return String(count);
    },
    gen(rng) {
      const mk = (L, segs) => `${L} ${segs.length}\n${segs.map((s) => s.join(" ")).join("\n")}`;
      const cases = [
        { input: mk(500, [[150, 300], [100, 200]]), category: "sample", targets: "重叠区间", reason: "移走 100~300 共 201 棵" },
        { input: mk(10, []), category: "sample", targets: "无移除", reason: "11 棵全留" },
        { input: mk(0, [[0, 0]]), category: "boundary", targets: "单点马路移走", reason: "0 棵" },
        { input: mk(5, [[0, 5]]), category: "boundary", targets: "整段移走", reason: "0 棵" },
        { input: mk(10000000, Array.from({ length: 15000 }, () => { const a = randInt(rng, 0, 9999999); return [a, Math.min(10000000, a + randInt(rng, 0, 100))]; })), category: "performance", scale: 100000, targets: "千万坐标卡逐点标记内存", reason: "区间合并 O(m log m)" },
        { input: mk(10000000, [[0, 10000000]]), category: "performance", scale: 10000000, targets: "全长单区间", reason: "答案 0" },
        { input: mk(20, [[1, 5], [3, 8], [10, 12], [11, 15]]), category: "adversarial", targets: "部分重叠链", reason: "合并后计数" },
      ];
      for (let i = 0; i < 5; i++) { const L = randInt(rng, 5, 60); cases.push({ input: mk(L, Array.from({ length: randInt(rng, 0, 8) }, () => { const a = randInt(rng, 0, L); return [a, randInt(rng, a, L)]; })), category: "ordinary", targets: "随机小区间", reason: "与逐点标记对拍" }); }
      return cases;
    },
  },
  {
    id: "CS006", title: "蓝桥杯 · 分糖果", difficulty: "普及", folder: "竞赛真题/蓝桥杯省赛",
    sourceUrl: "https://dasai.lanqiao.cn/",
    description: "n 个小朋友围成一圈，每人手里有偶数颗糖。每一轮，所有人同时把自己糖的一半分给右边的人（同时收到左边的人分来的糖）。分完后若某人糖数为奇数，老师补 1 颗使其变偶数。当所有人糖数相同时游戏结束，求进行的轮数。数据保证有限轮内结束。",
    inputFormat: "第一行一个整数 n（2 ≤ n ≤ 1000）。第二行 n 个偶数 c[i]（2 ≤ c[i] ≤ 1000000）。",
    outputFormat: "一个整数，游戏进行的轮数。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      let c = t.slice(1, 1 + n);
      let rounds = 0;
      while (!c.every((x) => x === c[0])) {
        const give = c.map((x) => x / 2);
        const next = c.map((x, i) => x - give[i] + give[(i - 1 + n) % n]);
        for (let i = 0; i < n; i++) if (next[i] % 2) next[i]++;
        c = next;
        rounds++;
        if (rounds > 10000000) break;
      }
      return String(rounds);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const evens = (n, lo, hi) => Array.from({ length: n }, () => randInt(rng, lo, hi) * 2);
      const cases = [
        { input: mk([2, 2]), category: "sample", targets: "已相同", reason: "0 轮" },
        { input: mk([2, 4, 6, 8]), category: "sample", targets: "经典四人", reason: "多轮收敛" },
        { input: mk([4, 4]), category: "boundary", targets: "两人已同", reason: "0 轮" },
        { input: mk([2, 1000000]), category: "boundary", targets: "极差两人", reason: "多轮趋同" },
        { input: mk(evens(1000, 1, 500000)), category: "performance", scale: 1000, targets: "千人随机初始", reason: "多轮模拟吞吐" },
        { input: mk(Array.from({ length: 1000 }, (_, i) => (i === 0 ? 1000000 : 2))), category: "performance", scale: 1000, targets: "单峰扩散", reason: "糖从一人扩散全圈" },
        { input: mk([2, 6, 2, 6]), category: "adversarial", targets: "交替形态", reason: "奇偶补糖触发" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(evens(randInt(rng, 2, 8), 1, 20)), category: "ordinary", targets: "随机小圈", reason: "模拟正确性" });
      return cases;
    },
  },
  {
    id: "CS007", title: "蓝桥杯 · 递增三元组", difficulty: "提高", folder: "竞赛真题/蓝桥杯省赛",
    sourceUrl: "https://dasai.lanqiao.cn/",
    description: "给定三个长度均为 n 的整数数组 A、B、C。求满足 A[i] < B[j] < C[k] 的三元组 (i, j, k) 的个数。",
    inputFormat: "第一行一个整数 n（1 ≤ n ≤ 100000）。接下来三行，每行 n 个整数，依次表示数组 A、B、C（元素绝对值不超过 100000）。",
    outputFormat: "一个整数，满足条件的三元组个数。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const A = t.slice(1, 1 + n).sort((a, b) => a - b);
      const B = t.slice(1 + n, 1 + 2 * n);
      const C = t.slice(1 + 2 * n, 1 + 3 * n).sort((a, b) => a - b);
      const lessThan = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; } return lo; };
      const greaterThan = (arr, x) => arr.length - (() => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= x) lo = mid + 1; else hi = mid; } return lo; })();
      let total = 0n;
      for (const b of B) total += BigInt(lessThan(A, b)) * BigInt(greaterThan(C, b));
      return String(total);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const A = t.slice(1, 1 + n), B = t.slice(1 + n, 1 + 2 * n), C = t.slice(1 + 2 * n, 1 + 3 * n);
      let total = 0n;
      for (const b of B) { let la = 0, gc = 0; for (const a of A) if (a < b) la++; for (const c of C) if (c > b) gc++; total += BigInt(la) * BigInt(gc); }
      return String(total);
    },
    gen(rng) {
      const mk = (A, B, C) => `${A.length}\n${A.join(" ")}\n${B.join(" ")}\n${C.join(" ")}`;
      const cases = [
        { input: mk([1], [2], [3]), category: "sample", targets: "单三元组成立", reason: "1<2<3 计 1" },
        { input: mk([3], [2], [1]), category: "sample", targets: "不成立", reason: "0" },
        { input: mk([1, 1], [2, 2], [3, 3]), category: "boundary", targets: "全成立组合", reason: "2×2×2=8" },
        { input: mk([5, 5], [5, 5], [5, 5]), category: "boundary", targets: "全等无严格小于", reason: "0" },
        { input: mk(randArray(rng, 12000, -100000, 100000), randArray(rng, 12000, -100000, 100000), randArray(rng, 12000, -100000, 100000)), category: "performance", scale: 100000, targets: "10 万卡 O(n²) 甚至 O(n³)", reason: "排序+二分" },
        { input: mk(Array.from({ length: 12000 }, () => 1), Array.from({ length: 12000 }, () => 2), Array.from({ length: 12000 }, () => 3)), category: "performance", scale: 100000, targets: "全成立满规模卡 long long", reason: "答案 1e15 超 int" },
        { input: mk([1, 2, 3], [2, 3, 4], [3, 4, 5]), category: "adversarial", targets: "部分成立", reason: "逐 B 计数" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 1, 30); cases.push({ input: mk(randArray(rng, n, -10, 10), randArray(rng, n, -10, 10), randArray(rng, n, -10, 10)), category: "ordinary", targets: "随机小数组", reason: "与 O(n²) 对拍" }); }
      return cases;
    },
  },
];
