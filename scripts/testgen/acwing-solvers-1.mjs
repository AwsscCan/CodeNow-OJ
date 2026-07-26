/* CodeNow OJ · AcWing 基础课参考解与数据构造 批次1：第一讲 基础算法 · Bamzc */

import { randArray, randInt, shuffle, tokens } from "./lib.mjs";

const sortedCopy = (arr) => [...arr].sort((a, b) => a - b);

export const ACWING_SOLVERS_1 = {
  AW785: { // 快速排序：输出排序后数列
    solve(input) {
      const t = tokens(input).map(Number);
      return sortedCopy(t.slice(1, 1 + t[0])).join(" ");
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([1]), category: "boundary", targets: "单元素", reason: "n=1 不需交换" },
        { input: mk([2, 1]), category: "boundary", targets: "最小逆序", reason: "一次交换" },
        { input: mk([1000000000, 1, 1000000000]), category: "boundary", targets: "值域上界与重复", reason: "1e9 极值" },
        { input: mk(Array.from({ length: 5000 }, () => 7)), category: "special", targets: "全等元素卡朴素快排 O(n²) 退化", reason: "同值枢轴场景" },
        { input: mk(Array.from({ length: 100000 }, (_, i) => i + 1)), category: "adversarial", scale: 100000, targets: "已升序卡固定取首元素为枢轴", reason: "有序输入退化" },
        { input: mk(Array.from({ length: 100000 }, (_, i) => 100000 - i)), category: "adversarial", scale: 100000, targets: "严格降序卡固定枢轴", reason: "逆序输入退化" },
        { input: mk(randArray(rng, 100000, 1, 1000000000)), category: "performance", scale: 100000, targets: "满规模随机卡 O(n²) 排序", reason: "10 万随机数" },
        { input: mk(shuffle(rng, Array.from({ length: 100000 }, (_, i) => (i % 100) + 1))), category: "performance", scale: 100000, targets: "大量重复值的三路划分考验", reason: "每值约千次重复" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 2, 50), 1, 100)), category: "ordinary", targets: "随机小数组", reason: "常规正确性" });
      return cases;
    },
  },
  AW786: { // 第 k 个数
    solve(input) {
      const t = tokens(input).map(Number);
      return String(sortedCopy(t.slice(2, 2 + t[0]))[t[1] - 1]);
    },
    gen(rng) {
      const mk = (arr, k) => `${arr.length} ${k}\n${arr.join(" ")}`;
      const big = randArray(rng, 100000, 1, 1000000000);
      const cases = [
        { input: mk([9], 1), category: "boundary", targets: "单元素", reason: "n=k=1" },
        { input: mk([5, 5, 5], 2), category: "boundary", targets: "全等取中", reason: "重复计名次" },
        { input: mk([1000000000, 1], 2), category: "boundary", targets: "值域上界为答案", reason: "k=n 最大值" },
        { input: mk(Array.from({ length: 1000 }, (_, i) => 1000 - i), 500), category: "special", targets: "严格降序取中位", reason: "逆序输入" },
        { input: mk(big, 1), category: "performance", scale: 100000, targets: "k=1 卡整体排序不必要的最坏枢轴", reason: "求最小值场景" },
        { input: mk(big, 100000), category: "performance", scale: 100000, targets: "k=n 满规模", reason: "求最大值场景" },
        { input: mk(big, 50000), category: "performance", scale: 100000, targets: "中位数快速选择 O(n) 期望", reason: "满规模取中" },
        { input: mk(shuffle(rng, Array.from({ length: 99999 }, () => 4)).concat([3]), 1), category: "adversarial", scale: 100000, targets: "近全等中藏唯一最小值", reason: "同值海洋找异类" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 40); cases.push({ input: mk(randArray(rng, n, 1, 60), randInt(rng, 1, n)), category: "ordinary", targets: "随机小数组", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW787: { // 归并排序：输出排序后数列
    solve(input) {
      const t = tokens(input).map(Number);
      return sortedCopy(t.slice(1, 1 + t[0])).join(" ");
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([4]), category: "boundary", targets: "单元素", reason: "递归底" },
        { input: mk([2, 1]), category: "boundary", targets: "两元素合并", reason: "最小归并" },
        { input: mk([3, 3, 3, 1, 1]), category: "special", targets: "重复值稳定合并", reason: "同值比较分支" },
        { input: mk(Array.from({ length: 100000 }, (_, i) => 100000 - i)), category: "adversarial", scale: 100000, targets: "严格降序全量搬运", reason: "每层合并都交叉" },
        { input: mk(randArray(rng, 100000, 1, 1000000000)), category: "performance", scale: 100000, targets: "满规模随机 O(n log n) 吞吐", reason: "10 万元素" },
        { input: mk(Array.from({ length: 99999 }, (_, i) => i % 2 ? 2 : 1)), category: "performance", scale: 99999, targets: "奇数长度交错值", reason: "奇偶分割边界" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 2, 50), 1, 100)), category: "ordinary", targets: "随机小数组", reason: "常规正确性" });
      return cases;
    },
  },
  AW788: { // 逆序对的数量
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const a = t.slice(1, 1 + n);
      let count = 0;
      const tmp = new Array(n);
      const merge = (lo, hi) => {
        if (hi - lo <= 1) return;
        const mid = (lo + hi) >> 1;
        merge(lo, mid); merge(mid, hi);
        let i = lo, j = mid, k = lo;
        while (i < mid && j < hi) {
          if (a[i] <= a[j]) tmp[k++] = a[i++];
          else { count += mid - i; tmp[k++] = a[j++]; }
        }
        while (i < mid) tmp[k++] = a[i++];
        while (j < hi) tmp[k++] = a[j++];
        for (let x = lo; x < hi; x++) a[x] = tmp[x];
      };
      merge(0, n);
      return String(count);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const a = t.slice(1, 1 + n);
      let count = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (a[i] > a[j]) count++;
      return String(count);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([1]), category: "boundary", targets: "单元素零逆序", reason: "n=1" },
        { input: mk([2, 1]), category: "boundary", targets: "最小逆序对", reason: "答案 1" },
        { input: mk([1, 2, 3, 4]), category: "special", targets: "已升序零逆序", reason: "答案 0" },
        { input: mk([5, 5, 5]), category: "special", targets: "相等不算逆序", reason: "严格大于判定" },
        { input: mk(Array.from({ length: 100000 }, (_, i) => 100000 - i)), category: "performance", scale: 100000, targets: "全逆序答案约 5e9 卡 int 溢出与 O(n²)", reason: "n(n-1)/2 超 32 位" },
        { input: mk(randArray(rng, 100000, 1, 1000000000)), category: "performance", scale: 100000, targets: "满规模随机卡双重循环", reason: "10 万元素" },
        { input: mk(Array.from({ length: 50000 }, (_, i) => (i % 2 ? 1 : 1000000000))), category: "adversarial", scale: 50000, targets: "高低交错密集逆序", reason: "合并计数高频触发" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 2, 60), 1, 50)), category: "ordinary", targets: "随机小数组", reason: "与 O(n²) 对拍" });
      return cases;
    },
  },
  AW789: { // 数的范围：起止下标(0-based)，不存在 -1 -1
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, q] = t;
      const a = t.slice(2, 2 + n);
      const lower = (x) => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };
      const out = [];
      for (let i = 0; i < q; i++) {
        const k = t[2 + n + i];
        const l = lower(k);
        if (l >= n || a[l] !== k) { out.push("-1 -1"); continue; }
        out.push(`${l} ${lower(k + 1) - 1}`);
      }
      return out.join("\n");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, q] = t;
      const a = t.slice(2, 2 + n);
      const out = [];
      for (let i = 0; i < q; i++) {
        const k = t[2 + n + i];
        const first = a.indexOf(k), last = a.lastIndexOf(k);
        out.push(first < 0 ? "-1 -1" : `${first} ${last}`);
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (arr, qs) => `${arr.length} ${qs.length}\n${arr.join(" ")}\n${qs.join("\n")}`;
      const big = randArray(rng, 100000, 1, 10000).sort((a, b) => a - b);
      const cases = [
        { input: mk([5], [5, 6]), category: "boundary", targets: "单元素命中与未命中", reason: "n=1" },
        { input: mk([1, 10000], [1, 10000]), category: "boundary", targets: "值域两端", reason: "极值起止" },
        { input: mk(Array.from({ length: 1000 }, () => 42), [42]), category: "special", targets: "整段全等", reason: "起止跨全数组" },
        { input: mk([1, 3, 5, 7], [2, 4, 6, 0, 8]), category: "special", targets: "全部落在缝隙", reason: "各种未命中位置" },
        { input: mk(big, Array.from({ length: 100000 }, () => randInt(rng, 1, 10000))), category: "performance", scale: 100000, targets: "10 万×10 万卡线性扫描", reason: "必须二分" },
        { input: mk(big, Array.from({ length: 100000 }, () => 10001)), category: "adversarial", scale: 100000, targets: "全部未命中的边界越界", reason: "lower 落在 n 处" },
      ];
      for (let i = 0; i < 6; i++) {
        const n = randInt(rng, 2, 60);
        const arr = randArray(rng, n, 1, 30).sort((a, b) => a - b);
        cases.push({ input: mk(arr, randArray(rng, randInt(rng, 1, 8), 0, 32)), category: "ordinary", targets: "随机数组随机询问", reason: "与首末扫描对拍" });
      }
      return cases;
    },
  },
  AW790: { // 数的三次方根，6 位小数
    solve(input) {
      const n = Number(tokens(input)[0]);
      const r = Math.cbrt(n);
      const fixed = r.toFixed(6);
      return fixed === "-0.000000" ? "0.000000" : fixed;
    },
    gen(rng) {
      const cases = [
        { input: "0", category: "boundary", targets: "零的立方根", reason: "0.000000 不得输出 -0" },
        { input: "-10000", category: "boundary", targets: "负值域下界", reason: "负数立方根" },
        { input: "10000", category: "boundary", targets: "正值域上界", reason: "21.544347" },
        { input: "1", category: "special", targets: "立方根为整数", reason: "1.000000" },
        { input: "-27", category: "special", targets: "负完全立方数", reason: "-3.000000" },
        { input: "0.001", category: "special", targets: "小数输入", reason: "0.1 精确值" },
        { input: "9999.999999", category: "performance", scale: 2, targets: "高精度边界卡精度不足的二分", reason: "接近上界的非整值" },
        { input: "-0.000001", category: "adversarial", targets: "负极小值", reason: "-0.01 符号处理" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: (rng() * 20000 - 10000).toFixed(4), category: "ordinary", targets: "随机浮点", reason: "常规正确性" });
      return cases;
    },
  },
  AW799: { // 最长连续不重复子序列(值 0~1e5)
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const last = new Int32Array(100001).fill(-1);
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
      for (let i = 0; i < n; i++) { const seen = new Set(); for (let j = i; j < n; j++) { if (seen.has(a[j])) break; seen.add(a[j]); best = Math.max(best, j - i + 1); } }
      return String(best);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([0]), category: "boundary", targets: "单元素含 0 值", reason: "值域下界" },
        { input: mk([100000, 0, 100000]), category: "boundary", targets: "值域上界", reason: "极值下标数组" },
        { input: mk(Array.from({ length: 500 }, () => 3)), category: "special", targets: "全等答案 1", reason: "窗口无法扩张" },
        { input: mk(Array.from({ length: 1000 }, (_, i) => i)), category: "special", targets: "全不重复答案 n", reason: "窗口从不收缩" },
        { input: mk(randArray(rng, 100000, 0, 100000)), category: "performance", scale: 100000, targets: "满规模随机卡 O(n²)", reason: "10 万元素" },
        { input: mk(Array.from({ length: 100000 }, (_, i) => i % 3)), category: "performance", scale: 100000, targets: "小值域高频收缩", reason: "窗口反复滑动" },
        { input: mk([1, 2, 1, 3, 1, 4, 1, 5]), category: "adversarial", targets: "同值间隔穿插 left 只进不退", reason: "回退错误检测" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 2, 60), 0, 9)), category: "ordinary", targets: "小值域随机", reason: "与 O(n²) 对拍" });
      return cases;
    },
  },
  AW800: { // 数组元素的目标和：升序 A,B 唯一解，输出 0-based i j
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m, x] = t;
      const A = t.slice(3, 3 + n), B = t.slice(3 + n, 3 + n + m);
      let j = m - 1;
      for (let i = 0; i < n; i++) {
        while (j >= 0 && A[i] + B[j] > x) j--;
        if (j >= 0 && A[i] + B[j] === x) return `${i} ${j}`;
      }
      return "-1 -1";
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m, x] = t;
      const A = t.slice(3, 3 + n), B = t.slice(3 + n, 3 + n + m);
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) if (A[i] + B[j] === x) return `${i} ${j}`;
      return "-1 -1";
    },
    gen(rng) {
      const asc = (n, lo, step) => { const out = []; let cur = lo; for (let i = 0; i < n; i++) { out.push(cur); cur += randInt(rng, 1, step); } return out; };
      const mk = (A, B, x) => `${A.length} ${B.length} ${x}\n${A.join(" ")}\n${B.join(" ")}`;
      const bigA = asc(100000, 1, 20), bigB = asc(100000, 1, 20);
      const cases = [
        { input: mk([1], [2], 3), category: "boundary", targets: "双单元素", reason: "唯一组合即解" },
        { input: mk([0, 5], [0, 5], 10), category: "boundary", targets: "解在两端", reason: "i=n-1,j=m-1" },
        { input: mk([1, 2, 3], [10, 20, 30], 11), category: "special", targets: "解在首位组合", reason: "i=0,j=0" },
        { input: mk(bigA, bigB, bigA[99999] + bigB[0]), category: "performance", scale: 100000, targets: "卡 O(n·m) 双重循环", reason: "解在 A 末端 B 前端" },
        { input: mk(bigA, bigB, bigA[0] + bigB[99999]), category: "performance", scale: 100000, targets: "双指针反向端点", reason: "解在 A 前端 B 末端" },
        { input: mk(asc(1000, 1, 3), asc(1000, 1, 3), 2), category: "adversarial", targets: "解为最小组合", reason: "指针需走满一侧" },
      ];
      for (let i = 0; i < 6; i++) {
        const A = asc(randInt(rng, 2, 30), randInt(rng, 0, 5), 4);
        const B = asc(randInt(rng, 2, 30), randInt(rng, 0, 5), 4);
        const x = A[randInt(rng, 0, A.length - 1)] + B[randInt(rng, 0, B.length - 1)];
        cases.push({ input: mk(A, B, x), category: "ordinary", targets: "构造必有解", reason: "与双重循环对拍(题目保证唯一解，构造取首个)" });
      }
      return cases;
    },
  },
  AW801: { // 二进制中 1 的个数
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const out = [];
      for (let i = 0; i < n; i++) { let v = t[1 + i], c = 0; while (v) { v &= v - 1; c++; } out.push(c); }
      return out.join(" ");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      return t.slice(1, 1 + n).map((v) => v.toString(2).split("").filter((b) => b === "1").length).join(" ");
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([0]), category: "boundary", targets: "零无置位", reason: "答案 0" },
        { input: mk([1, 2147483647]), category: "boundary", targets: "int 上界 31 个 1", reason: "全置位" },
        { input: mk([1024, 1023]), category: "special", targets: "单比特与连续低位", reason: "1 与 10" },
        { input: mk(randArray(rng, 100000, 0, 2147483647)), category: "performance", scale: 100000, targets: "满规模卡逐位字符串转换低效", reason: "10 万数 lowbit 循环" },
        { input: mk(Array.from({ length: 100000 }, () => 2147483647)), category: "performance", scale: 100000, targets: "全高置位最坏循环次数", reason: "每数 31 次消位" },
        { input: mk([2, 4, 8, 16, 32]), category: "adversarial", targets: "全单比特幂", reason: "答案全 1" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 1, 40), 0, 1000)), category: "ordinary", targets: "随机小数组", reason: "与字符串统计对拍" });
      return cases;
    },
  },
  AW802: { // 区间和(离散化)
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const adds = [], queries = [];
      for (let i = 0; i < n; i++) adds.push([t[2 + 2 * i], t[3 + 2 * i]]);
      for (let i = 0; i < m; i++) queries.push([t[2 + 2 * n + 2 * i], t[3 + 2 * n + 2 * i]]);
      const xs = [...new Set(adds.map(([x]) => x))].sort((a, b) => a - b);
      const val = new Map();
      for (const [x, c] of adds) val.set(x, (val.get(x) || 0) + c);
      const pre = [0];
      for (const x of xs) pre.push(pre[pre.length - 1] + val.get(x));
      const lower = (x) => { let lo = 0, hi = xs.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid + 1; else hi = mid; } return lo; };
      const out = [];
      for (const [l, r] of queries) {
        const li = lower(l), ri = lower(r + 1);
        out.push(pre[ri] - pre[li]);
      }
      return out.join("\n");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      const adds = [];
      for (let i = 0; i < n; i++) adds.push([t[2 + 2 * i], t[3 + 2 * i]]);
      const out = [];
      for (let i = 0; i < m; i++) {
        const l = t[2 + 2 * n + 2 * i], r = t[3 + 2 * n + 2 * i];
        let s = 0;
        for (const [x, c] of adds) if (x >= l && x <= r) s += c;
        out.push(s);
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (adds, qs) => `${adds.length} ${qs.length}\n${adds.map(([x, c]) => `${x} ${c}`).join("\n")}\n${qs.map(([l, r]) => `${l} ${r}`).join("\n")}`;
      const bigAdds = Array.from({ length: 100000 }, () => [randInt(rng, -1000000000, 1000000000), randInt(rng, -10000, 10000)]);
      const bigQs = Array.from({ length: 100000 }, () => { const l = randInt(rng, -1000000000, 1000000000); return [l, randInt(rng, l, 1000000000)]; });
      const cases = [
        { input: mk([[0, 5]], [[0, 0]]), category: "boundary", targets: "单点单询问", reason: "l=r=x" },
        { input: mk([[-1000000000, 3], [1000000000, 4]], [[-1000000000, 1000000000]]), category: "boundary", targets: "坐标值域两端", reason: "全范围覆盖" },
        { input: mk([[7, 2], [7, 3]], [[7, 7], [6, 8]]), category: "special", targets: "同点多次累加", reason: "重复坐标合并" },
        { input: mk([[5, -4], [6, 4]], [[5, 6], [1, 2]]), category: "special", targets: "负数与零和区间", reason: "空区间输出 0" },
        { input: mk(bigAdds, bigQs), category: "performance", scale: 100000, targets: "满规模卡 O(n·m) 逐点扫描", reason: "需离散化+前缀和" },
        { input: mk(bigAdds.slice(0, 50000), Array.from({ length: 100000 }, () => [999999999, 1000000000])), category: "adversarial", scale: 100000, targets: "询问集中在无数据的远端", reason: "二分越界处理" },
      ];
      for (let i = 0; i < 6; i++) {
        const adds = Array.from({ length: randInt(rng, 1, 20) }, () => [randInt(rng, -50, 50), randInt(rng, -10, 10)]);
        const qs = Array.from({ length: randInt(rng, 1, 10) }, () => { const l = randInt(rng, -60, 60); return [l, randInt(rng, l, 60)]; });
        cases.push({ input: mk(adds, qs), category: "ordinary", targets: "随机小坐标", reason: "与逐点扫描对拍" });
      }
      return cases;
    },
  },
  AW803: { // 区间合并：输出合并后的区间个数(端点相接算合并)
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const segs = [];
      for (let i = 0; i < n; i++) segs.push([t[1 + 2 * i], t[2 + 2 * i]]);
      segs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let count = 0, curR = -Infinity;
      for (const [l, r] of segs) {
        if (l > curR) { count++; curR = r; }
        else if (r > curR) curR = r;
      }
      return String(count);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const segs = [];
      for (let i = 0; i < n; i++) segs.push([t[1 + 2 * i], t[2 + 2 * i]]);
      // 并查集式暴力：两两可合并则连通
      const parent = segs.map((_, i) => i);
      const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          const ri = find(i), rj = find(j);
          if (ri === rj) continue;
          const grp = (root) => segs.map((s, idx) => [s, idx]).filter(([, idx]) => find(idx) === root).map(([s]) => s);
          const gi = grp(ri), gj = grp(rj);
          const li = Math.min(...gi.map((s) => s[0])), riMax = Math.max(...gi.map((s) => s[1]));
          const lj = Math.min(...gj.map((s) => s[0])), rjMax = Math.max(...gj.map((s) => s[1]));
          if (li <= rjMax && lj <= riMax) { parent[ri] = rj; changed = true; }
        }
      }
      return String(new Set(segs.map((_, i) => find(i))).size);
    },
    gen(rng) {
      const mk = (segs) => `${segs.length}\n${segs.map(([l, r]) => `${l} ${r}`).join("\n")}`;
      const bigDisjoint = Array.from({ length: 100000 }, (_, i) => [i * 10000 - 1000000000, i * 10000 - 1000000000 + 5]);
      const bigOverlap = Array.from({ length: 100000 }, () => { const l = randInt(rng, -1000000, 1000000); return [l, l + randInt(rng, 0, 2000000)]; });
      const cases = [
        { input: mk([[1, 2]]), category: "boundary", targets: "单区间", reason: "答案 1" },
        { input: mk([[-1000000000, 1000000000]]), category: "boundary", targets: "值域全跨", reason: "极端端点" },
        { input: mk([[1, 2], [2, 4]]), category: "special", targets: "端点相接算合并", reason: "答案 1" },
        { input: mk([[1, 2], [3, 4]]), category: "special", targets: "相邻但不相接", reason: "答案 2，卡 l>r+1 错误判定" },
        { input: mk([[1, 100], [2, 3], [4, 5], [6, 7]]), category: "special", targets: "大区间吞并小区间", reason: "curR 不回退" },
        { input: mk(shuffle(rng, [...bigDisjoint])), category: "performance", scale: 100000, targets: "10 万互不相交区间卡 O(n²) 两两比较", reason: "答案为 n" },
        { input: mk(shuffle(rng, [...bigOverlap])), category: "performance", scale: 100000, targets: "高重叠随机区间", reason: "大规模吞并链" },
        { input: mk(Array.from({ length: 1000 }, (_, i) => [1000 - i, 1001 - i])), category: "adversarial", targets: "逆序输入的链式相接", reason: "必须排序后扫描" },
      ];
      for (let i = 0; i < 5; i++) {
        const segs = Array.from({ length: randInt(rng, 1, 12) }, () => { const l = randInt(rng, -30, 30); return [l, l + randInt(rng, 0, 15)]; });
        cases.push({ input: mk(segs), category: "ordinary", targets: "随机小区间集", reason: "与并查集暴力对拍" });
      }
      return cases;
    },
  },
};
