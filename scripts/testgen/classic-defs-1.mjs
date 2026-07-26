/* CodeNow OJ · 经典题库定义(上)：枚举模拟/排序二分/前缀和双指针 · Bamzc */

import { randArray, randInt, shuffle, tokens } from "./lib.mjs";

const MOD = 1000000007n;

export const CLASSIC_DEFS_1 = [
  {
    id: "CL001", title: "斐波那契数列", difficulty: "入门", folder: "经典题库/枚举与模拟",
    description: "斐波那契数列定义为 F(1)=1，F(2)=1，F(n)=F(n-1)+F(n-2)。给定 n，求 F(n) 对 1000000007 取模的结果。",
    inputFormat: "一行一个整数 n（1 ≤ n ≤ 1000000）。",
    outputFormat: "一个整数，表示 F(n) mod 1000000007。",
    solve(input) {
      const n = Number(tokens(input)[0]);
      if (n <= 2) return "1";
      let a = 1n, b = 1n;
      for (let i = 3; i <= n; i++) { const c = (a + b) % MOD; a = b; b = c; }
      return String(b);
    },
    brute(input) {
      const n = Number(tokens(input)[0]);
      const f = [0n, 1n, 1n];
      for (let i = 3; i <= n; i++) f[i] = (f[i - 1] + f[i - 2]) % MOD;
      return String(f[n]);
    },
    gen(rng) {
      const cases = [
        { input: "1", category: "sample", targets: "最小边界", reason: "n=1 起始项" },
        { input: "10", category: "sample", targets: "常规样例", reason: "便于手算核对(55)" },
        { input: "2", category: "boundary", targets: "第二个起始项", reason: "递推起点覆盖" },
        { input: "3", category: "boundary", targets: "首个递推项", reason: "递推第一步" },
        { input: "90", category: "special", targets: "超出 64 位溢出点", reason: "F(90) 超 long long，必须取模" },
        { input: "1000000", category: "performance", scale: 20000, targets: "卡 O(2^n) 递归与递归爆栈", reason: "最大规模需线性递推" },
        { input: "999999", category: "performance", scale: 100009, targets: "最大规模相邻值", reason: "防止差一错误" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: String(randInt(rng, 4, 500)), category: "ordinary", targets: "随机中等规模", reason: "常规正确性" });
      cases.push({ input: "100000", category: "adversarial", scale: 10000, targets: "卡朴素大数不取模", reason: "中间值必须逐步取模" });
      return cases;
    },
  },
  {
    id: "CL002", title: "约瑟夫环", difficulty: "入门", folder: "经典题库/枚举与模拟",
    description: "n 个人围成一圈，从 1 号开始按顺时针 1 到 m 报数，报到 m 的人出列，下一人重新从 1 开始报数，如此往复。求最后留下的人的编号。",
    inputFormat: "一行两个整数 n 和 m（1 ≤ n ≤ 1000000，1 ≤ m ≤ 1000000000）。",
    outputFormat: "一个整数，最后留下的人的编号（从 1 开始）。",
    solve(input) {
      const [n, m] = tokens(input).map(Number);
      let f = 0;
      for (let i = 2; i <= n; i++) f = (f + m) % i;
      return String(f + 1);
    },
    brute(input) {
      const [n, m] = tokens(input).map(Number);
      const ring = Array.from({ length: n }, (_, i) => i + 1);
      let idx = 0;
      while (ring.length > 1) { idx = (idx + m - 1) % ring.length; ring.splice(idx, 1); }
      return String(ring[0]);
    },
    gen(rng) {
      const cases = [
        { input: "5 2", category: "sample", targets: "经典小样例", reason: "答案 3，便于手推" },
        { input: "6 7", category: "sample", targets: "m 大于 n", reason: "报数跨过整圈" },
        { input: "1 1", category: "boundary", targets: "单人成环", reason: "n=1 直接留下" },
        { input: "1 1000000000", category: "boundary", targets: "单人+最大 m", reason: "m 极大不影响单人" },
        { input: "2 1", category: "boundary", targets: "最小非平凡环", reason: "首轮即淘汰 1 号" },
        { input: "10 1", category: "special", targets: "m=1 顺序出列", reason: "答案恒为 n" },
        { input: "7 1000000000", category: "special", targets: "极大 m 取模", reason: "卡逐步报数模拟" },
        { input: "1000000 3", category: "performance", scale: 20000, targets: "卡 O(n·m) 与链表模拟", reason: "必须 O(n) 递推" },
        { input: "999983 999979", category: "performance", scale: 999983, targets: "大 n 大 m 组合", reason: "质数规模防特例" },
        { input: "13 13", category: "adversarial", targets: "m 恰等于 n", reason: "整圈回到起点的报数" },
      ];
      for (let i = 0; i < 3; i++) cases.push({ input: `${randInt(rng, 3, 60)} ${randInt(rng, 1, 40)}`, category: "ordinary", targets: "随机小环", reason: "与暴力模拟对拍" });
      return cases;
    },
  },
  {
    id: "CL003", title: "第 k 小的数", difficulty: "入门", folder: "经典题库/排序与二分",
    description: "给定 n 个整数，求其中第 k 小的数（重复元素按出现次数计入排名）。",
    inputFormat: "第一行两个整数 n 和 k（1 ≤ k ≤ n ≤ 100000）。第二行 n 个整数，绝对值不超过 1000000000。",
    outputFormat: "一个整数，第 k 小的数。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, k] = t;
      const a = t.slice(2, 2 + n);
      a.sort((x, y) => x - y);
      return String(a[k - 1]);
    },
    gen(rng) {
      const mk = (arr, k) => `${arr.length} ${k}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([3, 1, 2], 2), category: "sample", targets: "基础排序", reason: "答案 2" },
        { input: mk([5, 5, 5, 5], 3), category: "sample", targets: "全相同元素", reason: "重复计入排名" },
        { input: mk([42], 1), category: "boundary", targets: "单元素", reason: "n=k=1" },
        { input: mk([-1000000000, 1000000000], 1), category: "boundary", targets: "值域极端", reason: "最小负值排首位" },
        { input: mk([-1000000000, 1000000000], 2), category: "boundary", targets: "值域极端取最大", reason: "k=n 取末位" },
        { input: mk([3, -3, 0, -3, 3], 3), category: "special", targets: "正负零混合去重错误", reason: "第 3 小是 0" },
        { input: mk(Array.from({ length: 200 }, (_, i) => 200 - i), 100), category: "adversarial", targets: "严格逆序卡冒泡剪枝", reason: "逆序输入" },
        { input: mk(randArray(rng, 10000, -1000000000, 1000000000), 50000), category: "performance", scale: 10000, targets: "卡 O(n²) 选择排序", reason: "最大规模取中位" },
        { input: mk(Array.from({ length: 10000 }, () => 7), 99999), category: "performance", scale: 10000, targets: "全等元素卡朴素快排退化 O(n²)", reason: "同值枢轴退化场景" },
      ];
      for (let i = 0; i < 4; i++) {
        const n = randInt(rng, 5, 80);
        cases.push({ input: mk(randArray(rng, n, -100, 100), randInt(rng, 1, n)), category: "ordinary", targets: "随机数组", reason: "常规正确性" });
      }
      return cases;
    },
  },
  {
    id: "CL004", title: "二分查找首次出现", difficulty: "入门", folder: "经典题库/排序与二分",
    description: "给定长度为 n 的非降序整数数组和 q 次查询。每次查询给出整数 x，求 x 在数组中第一次出现的下标（从 1 开始）；若不存在输出 -1。",
    inputFormat: "第一行两个整数 n 和 q（1 ≤ n, q ≤ 100000）。第二行 n 个非降序整数。接下来 q 行，每行一个整数 x。所有数绝对值不超过 1000000000。",
    outputFormat: "q 行，每行一个整数：首次出现下标或 -1。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, q] = t;
      const a = t.slice(2, 2 + n);
      const out = [];
      for (let i = 0; i < q; i++) {
        const x = t[2 + n + i];
        let lo = 0, hi = n;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; }
        out.push(lo < n && a[lo] === x ? lo + 1 : -1);
      }
      return out.join("\n");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, q] = t;
      const a = t.slice(2, 2 + n);
      const out = [];
      for (let i = 0; i < q; i++) { const x = t[2 + n + i]; const idx = a.indexOf(x); out.push(idx >= 0 ? idx + 1 : -1); }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (arr, qs) => `${arr.length} ${qs.length}\n${arr.join(" ")}\n${qs.join("\n")}`;
      const big = randArray(rng, 12000, -1000000, 1000000).sort((x, y) => x - y);
      const bigQ = Array.from({ length: 10000 }, () => big[randInt(rng, 0, big.length - 1)]);
      const cases = [
        { input: mk([1, 2, 2, 3], [2, 4]), category: "sample", targets: "重复元素取首位", reason: "2 首次在下标 2；4 不存在" },
        { input: mk([5], [5, 6]), category: "sample", targets: "单元素命中与未命中", reason: "极小规模" },
        { input: mk([3], [2]), category: "boundary", targets: "查询小于全部元素", reason: "lo 停在 0 且不等" },
        { input: mk([3], [9]), category: "boundary", targets: "查询大于全部元素", reason: "lo 越界需判存在性" },
        { input: mk([-1000000000, 1000000000], [-1000000000, 1000000000, 0]), category: "boundary", targets: "值域两端", reason: "极值命中与中间未命中" },
        { input: mk(Array.from({ length: 1000 }, () => 6), [6, 7]), category: "special", targets: "全等长段取第一个", reason: "首次出现必须是 1" },
        { input: mk([1, 1, 2, 2, 2, 9], [2, 2, 2]), category: "special", targets: "重复查询一致性", reason: "同询多次答案一致" },
        { input: mk(big, bigQ), category: "performance", scale: 10000, targets: "卡 O(n·q) 线性扫描", reason: "10 万数组 × 10 万查询" },
        { input: mk(big, Array.from({ length: 10000 }, () => 1500000)), category: "adversarial", scale: 10000, targets: "全部未命中的最坏查找", reason: "每次查满 log 深度" },
      ];
      for (let i = 0; i < 4; i++) {
        const n = randInt(rng, 3, 60);
        const arr = randArray(rng, n, -30, 30).sort((x, y) => x - y);
        cases.push({ input: mk(arr, randArray(rng, randInt(rng, 1, 10), -35, 35)), category: "ordinary", targets: "随机小数组", reason: "与线性扫描对拍" });
      }
      return cases;
    },
  },
  {
    id: "CL005", title: "路灯的最大最小间距", difficulty: "普及", folder: "经典题库/排序与二分",
    description: "一条街上有 n 个可安装路灯的位置，坐标已知。要安装 c 盏路灯（每个位置至多一盏），使相邻路灯间的最小距离尽可能大。求这个最大的最小距离。",
    inputFormat: "第一行两个整数 n 和 c（2 ≤ c ≤ n ≤ 100000）。第二行 n 个互不相同的整数坐标（0 ≤ 坐标 ≤ 1000000000）。",
    outputFormat: "一个整数：最大化后的最小相邻间距。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, c] = t;
      const xs = t.slice(2, 2 + n).sort((a, b) => a - b);
      const ok = (d) => {
        let cnt = 1, last = xs[0];
        for (let i = 1; i < n; i++) if (xs[i] - last >= d) { cnt++; last = xs[i]; if (cnt >= c) return true; }
        return cnt >= c;
      };
      let lo = 0, hi = xs[n - 1] - xs[0];
      while (lo < hi) { const mid = hi - ((hi - lo) >> 1); if (ok(mid)) lo = mid; else hi = mid - 1; }
      return String(lo);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, c] = t;
      const xs = t.slice(2, 2 + n).sort((a, b) => a - b);
      let best = 0;
      const pick = (idx, chosen, minGap) => {
        if (chosen.length === c) { best = Math.max(best, minGap); return; }
        if (idx >= n || chosen.length + (n - idx) < c) return;
        const gap = chosen.length ? xs[idx] - chosen[chosen.length - 1] : Infinity;
        pick(idx + 1, [...chosen, xs[idx]], Math.min(minGap, gap));
        pick(idx + 1, chosen, minGap);
      };
      pick(0, [], Infinity);
      return String(best);
    },
    gen(rng) {
      const mk = (xs, c) => `${xs.length} ${c}\n${xs.join(" ")}`;
      const bigXs = shuffle(rng, Array.from(new Set(randArray(rng, 22000, 0, 1000000000))).slice(0, 100000));
      const cases = [
        { input: mk([1, 2, 8, 4, 9], 3), category: "sample", targets: "经典布置", reason: "答案 3(1,4,8 或 1,4,9)" },
        { input: mk([0, 10], 2), category: "sample", targets: "两点两灯", reason: "间距即区间长" },
        { input: mk([0, 1000000000], 2), category: "boundary", targets: "值域最大跨度", reason: "二分上界溢出检查" },
        { input: mk([5, 6, 7], 3), category: "boundary", targets: "全部位置都放灯", reason: "c=n 时取最小相邻差" },
        { input: mk([0, 1, 2, 3, 4, 5, 6, 7], 8), category: "special", targets: "紧凑等距全放", reason: "答案为 1" },
        { input: mk(shuffle(rng, [3, 14, 1, 9, 20, 6]), 4), category: "special", targets: "乱序输入", reason: "必须先排序" },
        { input: mk(bigXs, 2), category: "performance", scale: 10000, targets: "c=2 卡枚举所有点对", reason: "最大规模只取两端" },
        { input: mk(bigXs, 50000), category: "performance", scale: 10000, targets: "卡 O(n²) 判定与逐距枚举", reason: "大 c 需 O(n log V) 二分" },
        { input: mk([0, 2, 4, 6, 8, 10, 12], 4), category: "adversarial", targets: "等差陷阱", reason: "答案恰为公差的整数倍" },
      ];
      for (let i = 0; i < 4; i++) {
        const n = randInt(rng, 4, 12);
        const xs = shuffle(rng, Array.from(new Set(randArray(rng, n + 6, 0, 60))).slice(0, n));
        if (xs.length < 4) { i--; continue; }
        cases.push({ input: mk(xs, randInt(rng, 2, Math.min(4, xs.length))), category: "ordinary", targets: "随机小规模", reason: "与枚举暴力对拍" });
      }
      return cases;
    },
  },
  {
    id: "CL006", title: "区间和查询", difficulty: "入门", folder: "经典题库/前缀和与双指针",
    description: "给定长度为 n 的整数数组和 q 次查询。每次查询给出 l 和 r，求下标区间 [l, r] 内所有元素之和。",
    inputFormat: "第一行两个整数 n 和 q（1 ≤ n, q ≤ 100000）。第二行 n 个整数（绝对值不超过 1000000000）。接下来 q 行，每行两个整数 l r（1 ≤ l ≤ r ≤ n）。",
    outputFormat: "q 行，每行一个整数：对应区间和。",
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, q] = t;
      const pre = new Array(n + 1).fill(0n);
      for (let i = 1; i <= n; i++) pre[i] = pre[i - 1] + BigInt(t[1 + i]);
      const out = [];
      for (let i = 0; i < q; i++) {
        const l = t[2 + n + 2 * i], r = t[3 + n + 2 * i];
        out.push(String(pre[r] - pre[l - 1]));
      }
      return out.join("\n");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, q] = t;
      const a = t.slice(2, 2 + n);
      const out = [];
      for (let i = 0; i < q; i++) {
        const l = t[2 + n + 2 * i], r = t[3 + n + 2 * i];
        let s = 0n;
        for (let j = l - 1; j < r; j++) s += BigInt(a[j]);
        out.push(String(s));
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (arr, qs) => `${arr.length} ${qs.length}\n${arr.join(" ")}\n${qs.map(([l, r]) => `${l} ${r}`).join("\n")}`;
      const big = randArray(rng, 10000, -1000000000, 1000000000);
      const bigQ = Array.from({ length: 10000 }, () => { const l = randInt(rng, 1, 10000); return [l, randInt(rng, l, 10000)]; });
      const cases = [
        { input: mk([1, 2, 3, 4], [[1, 4], [2, 3]]), category: "sample", targets: "基础区间和", reason: "10 与 5" },
        { input: mk([-5], [[1, 1]]), category: "sample", targets: "单元素负数", reason: "l=r 场景" },
        { input: mk([1000000000, 1000000000, 1000000000], [[1, 3]]), category: "boundary", targets: "和超 32 位", reason: "3e9 溢出 int" },
        { input: mk(Array.from({ length: 1000 }, () => 1000000000), [[1, 1000]]), category: "boundary", targets: "和超 2^53 需大整数", reason: "1e12 内其实安全，验证累计精度" },
        { input: mk(Array.from({ length: 100 }, (_, i) => (i % 2 ? 1 : -1)), [[1, 100], [1, 99]]), category: "special", targets: "正负抵消", reason: "和为 0 与 -1" },
        { input: mk(big, bigQ), category: "performance", scale: 10000, targets: "卡 O(n·q) 逐项累加", reason: "10 万查询需前缀和" },
        { input: mk(big, Array.from({ length: 10000 }, () => [1, 10000])), category: "adversarial", scale: 10000, targets: "全量区间重复查询", reason: "每询都是最长区间" },
      ];
      for (let i = 0; i < 5; i++) {
        const n = randInt(rng, 3, 50);
        const qs = Array.from({ length: randInt(rng, 1, 8) }, () => { const l = randInt(rng, 1, n); return [l, randInt(rng, l, n)]; });
        cases.push({ input: mk(randArray(rng, n, -100, 100), qs), category: "ordinary", targets: "随机数组随机询问", reason: "与逐项累加对拍" });
      }
      return cases;
    },
  },
  {
    id: "CL007", title: "最长不重复子段", difficulty: "普及", folder: "经典题库/前缀和与双指针",
    description: "给定长度为 n 的整数序列，求最长的连续子段，使得子段内没有重复元素，输出其长度。",
    inputFormat: "第一行一个整数 n（1 ≤ n ≤ 1000000）。第二行 n 个整数（0 ≤ 值 ≤ 1000000）。",
    outputFormat: "一个整数：最长不含重复元素的连续子段长度。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const last = new Int32Array(1000001).fill(-1);
      let best = 0, left = 0;
      for (let i = 0; i < n; i++) {
        const v = t[1 + i];
        if (last[v] >= left) left = last[v] + 1;
        last[v] = i;
        if (i - left + 1 > best) best = i - left + 1;
      }
      return String(best);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const a = t.slice(1, 1 + n);
      let best = 0;
      for (let i = 0; i < n; i++) {
        const seen = new Set();
        for (let j = i; j < n; j++) {
          if (seen.has(a[j])) break;
          seen.add(a[j]);
          best = Math.max(best, j - i + 1);
        }
      }
      return String(best);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([1, 2, 2, 3, 5]), category: "sample", targets: "基础滑窗", reason: "答案 3(2,3,5)" },
        { input: mk([7]), category: "sample", targets: "单元素", reason: "n=1" },
        { input: mk([0, 0, 0, 0]), category: "boundary", targets: "全相同", reason: "答案 1" },
        { input: mk([1000000, 0, 1000000]), category: "boundary", targets: "值域两端", reason: "极值哈希/数组下标" },
        { input: mk(Array.from({ length: 1000 }, (_, i) => i)), category: "special", targets: "全不重复", reason: "答案等于 n" },
        { input: mk([1, 2, 3, 1, 2, 3, 4, 5, 6, 7]), category: "special", targets: "左指针跳跃回退错误", reason: "left 只能前进不能倒退" },
        { input: mk(randArray(rng, 20000, 0, 1000000)), category: "performance", scale: 20000, targets: "卡 O(n²) 枚举", reason: "百万规模需 O(n)" },
        { input: mk(Array.from({ length: 10000 }, (_, i) => i % 2)), category: "performance", scale: 20000, targets: "高频重复窗口抖动", reason: "窗口反复收缩" },
        { input: mk([5, 1, 5, 2, 5, 3, 5, 4]), category: "adversarial", targets: "同值间隔穿插", reason: "last 位置与 left 交错更新" },
      ];
      for (let i = 0; i < 4; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 5, 60), 0, 9)), category: "ordinary", targets: "小值域随机", reason: "与 O(n²) 对拍" });
      return cases;
    },
  },
  {
    id: "CL008", title: "括号匹配", difficulty: "入门", folder: "经典题库/数据结构",
    description: "给定仅由 ()[]{} 组成的字符串，判断括号是否完全匹配：每个右括号与最近的未匹配左括号类型相同，且最终没有剩余未匹配括号。",
    inputFormat: "一行一个非空字符串，长度不超过 1000000。",
    outputFormat: "匹配输出 Yes，否则输出 No。",
    solve(input) {
      const s = input.trim();
      const pair = { ")": "(", "]": "[", "}": "{" };
      const stack = [];
      for (const ch of s) {
        if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
        else if (stack.pop() !== pair[ch]) return "No";
      }
      return stack.length ? "No" : "Yes";
    },
    gen(rng) {
      const deep = "(".repeat(120000) + ")".repeat(120000);
      const alt = "()[]{}".repeat(40000);
      const kinds = ["()", "[]", "{}"];
      const randomBalanced = (len) => {
        let s = "";
        const st = [];
        while (s.length < len) {
          if (st.length && (rng() < 0.5 || s.length + st.length >= len)) s += st.pop();
          else { const k = kinds[randInt(rng, 0, 2)]; st.push(k[1]); s += k[0]; }
        }
        while (st.length) s += st.pop();
        return s;
      };
      const cases = [
        { input: "()[]", category: "sample", targets: "基础匹配", reason: "Yes" },
        { input: "([)]", category: "sample", targets: "交叉嵌套", reason: "类型不匹配 No" },
        { input: "(", category: "boundary", targets: "单左括号", reason: "栈非空 No" },
        { input: ")", category: "boundary", targets: "单右括号", reason: "空栈弹出 No" },
        { input: "{}", category: "boundary", targets: "最短匹配", reason: "Yes" },
        { input: "((((((((((", category: "special", targets: "全左括号", reason: "只进不出" },
        { input: "()".repeat(300) + "]", category: "special", targets: "末尾多余右括号", reason: "长串最后一步失败" },
        { input: deep, category: "performance", scale: 20000, targets: "50 万层深嵌套卡递归解法", reason: "递归必爆栈，需显式栈" },
        { input: alt, category: "performance", scale: 960000, targets: "百万级交替串", reason: "线性扫描性能" },
        { input: randomBalanced(2000) + "(", category: "adversarial", targets: "几乎匹配只差一个", reason: "尾部残留一个左括号" },
      ];
      for (let i = 0; i < 3; i++) cases.push({ input: randomBalanced(randInt(rng, 2, 60)), category: "ordinary", targets: "随机合法串", reason: "构造保证 Yes" });
      return cases;
    },
  },
  {
    id: "CL009", title: "合并果子", difficulty: "普及", folder: "经典题库/数据结构",
    description: "有 n 堆果子，第 i 堆重量为 a[i]。每次可将两堆合并为一堆，消耗体力为两堆重量之和。要把所有果子合并成一堆，求最小总体力消耗。",
    inputFormat: "第一行一个整数 n（1 ≤ n ≤ 100000）。第二行 n 个整数 a[i]（1 ≤ a[i] ≤ 20000）。",
    outputFormat: "一个整数：最小总体力消耗（n=1 时为 0）。",
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const heap = t.slice(1, 1 + n);
      heap.sort((a, b) => a - b);
      // 手写小根堆
      const h = [...heap];
      const up = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (h[p] <= h[i]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
      const down = (i) => {
        for (;;) {
          let m = i; const l = 2 * i + 1, r = 2 * i + 2;
          if (l < h.length && h[l] < h[m]) m = l;
          if (r < h.length && h[r] < h[m]) m = r;
          if (m === i) break;
          [h[m], h[i]] = [h[i], h[m]]; i = m;
        }
      };
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
      while (arr.length > 1) {
        arr.sort((a, b) => a - b);
        const merged = arr[0] + arr[1];
        total += merged;
        arr = [merged, ...arr.slice(2)];
      }
      return String(total);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([1, 2, 9]), category: "sample", targets: "经典三堆", reason: "答案 15" },
        { input: mk([5, 5]), category: "sample", targets: "两堆直接合并", reason: "答案 10" },
        { input: mk([7]), category: "boundary", targets: "单堆无需合并", reason: "答案 0" },
        { input: mk([1, 1]), category: "boundary", targets: "最小重量两堆", reason: "答案 2" },
        { input: mk(Array.from({ length: 100 }, () => 20000)), category: "boundary", targets: "最大单堆重量", reason: "上界累计" },
        { input: mk(Array.from({ length: 64 }, () => 1)), category: "special", targets: "全等重量的完全归并树", reason: "贪心退化为满二叉树" },
        { input: mk(Array.from({ length: 30 }, (_, i) => 2 ** Math.min(i, 14))), category: "special", targets: "指数递增卡先大后小的错误贪心", reason: "必须每次取最小两堆" },
        { input: mk(randArray(rng, 20000, 1, 20000)), category: "performance", scale: 10000, targets: "卡每轮重排序 O(n² log n)", reason: "10 万堆需优先队列" },
        { input: mk(Array.from({ length: 10000 }, () => 1)), category: "performance", scale: 10000, targets: "全等大规模堆抖动", reason: "堆内大量相等键" },
        { input: mk([20000, 1, 20000, 1, 20000, 1]), category: "adversarial", targets: "大小交错卡按输入顺序合并", reason: "顺序合并明显劣于贪心" },
      ];
      for (let i = 0; i < 3; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 2, 40), 1, 200)), category: "ordinary", targets: "随机小堆", reason: "与每轮重排的暴力对拍" });
      return cases;
    },
  },
];
