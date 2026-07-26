/* CodeNow OJ · AcWing 参考解批次4a：质数/约数/欧拉/快速幂/扩欧/CRT · Bamzc */

import { randInt, tokens } from "./lib.mjs";

const MOD = 1000000007n;

/** 试除法分解质因数，返回 [[p, k], ...] 升序 */
function factorize(x) {
  const out = [];
  for (let p = 2; p * p <= x; p++) {
    if (x % p) continue;
    let k = 0;
    while (x % p === 0) { x /= p; k++; }
    out.push([p, k]);
  }
  if (x > 1) out.push([x, 1]);
  return out;
}

function powMod(a, b, p) {
  a = ((a % p) + p) % p;
  let r = 1n % p;
  while (b > 0n) { if (b & 1n) r = (r * a) % p; a = (a * a) % p; b >>= 1n; }
  return r;
}

/** 标准扩展欧几里得(y 总模板)：返回 [d, x, y] 满足 ax+by=d */
function exgcd(a, b) {
  if (b === 0n) return [a, 1n, 0n];
  const [d, x1, y1] = exgcd(b, a % b);
  return [d, y1, x1 - (a / b) * y1];
}

const gcd = (a, b) => { while (b) { [a, b] = [b, a % b]; } return a; };

export const ACWING_SOLVERS_4A = {
  AW866: { // 题面实为"分解质因数"(抓取错位)，按样例语义实现
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const out = [];
      for (let i = 0; i < n; i++) {
        for (const [p, k] of factorize(t[1 + i])) out.push(`${p} ${k}`);
        out.push("");
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join("\n")}`;
      const cases = [
        { input: mk([2]), category: "boundary", targets: "最小质数", reason: "2 1" },
        { input: mk([999999937]), category: "boundary", targets: "大质数试除到 sqrt", reason: "单因子 1e9 级质数" },
        { input: mk([1024]), category: "special", targets: "单一质因子高次幂", reason: "2 10" },
        { input: mk([999999999]), category: "special", targets: "多质因子合数", reason: "3^4·37·333667" },
        { input: mk([6, 8, 30]), category: "ordinary", targets: "多组基础分解", reason: "含样例同款" },
        { input: mk(Array.from({ length: 90 }, () => 999999000 + randInt(rng, 0, 999))), category: "performance", scale: 90, targets: "90 个大数连续试除卡 O(x) 逐一试除", reason: "需 sqrt 级试除" },
        { input: mk(Array.from({ length: 100 }, () => randInt(rng, 2, 1000000000))), category: "performance", scale: 100, targets: "满量随机大数", reason: "混合难度分解" },
        { input: mk([536870912, 387420489]), category: "adversarial", targets: "2^29 与 3^18 高次幂", reason: "指数统计正确性" },
      ];
      for (let i = 0; i < 4; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 6) }, () => randInt(rng, 2, 5000))), category: "ordinary", targets: "小数分解", reason: "常规验证" });
      return cases;
    },
  },
  AW868: { // 筛质数：1~n 质数个数
    solve(input) {
      const n = Number(tokens(input)[0]);
      if (n < 2) return "0";
      const composite = new Uint8Array(n + 1);
      let count = 0;
      const primes = [];
      for (let i = 2; i <= n; i++) {
        if (!composite[i]) { primes.push(i); count++; }
        for (const p of primes) {
          if (p * i > n) break;
          composite[p * i] = 1;
          if (i % p === 0) break;
        }
      }
      return String(count);
    },
    brute(input) {
      const n = Number(tokens(input)[0]);
      let count = 0;
      for (let x = 2; x <= n; x++) {
        let isPrime = true;
        for (let p = 2; p * p <= x; p++) if (x % p === 0) { isPrime = false; break; }
        if (isPrime) count++;
      }
      return String(count);
    },
    gen(rng) {
      const cases = [
        { input: "1", category: "boundary", targets: "无质数区间", reason: "0" },
        { input: "2", category: "boundary", targets: "最小质数上界", reason: "1" },
        { input: "3", category: "boundary", targets: "两个质数", reason: "2" },
        { input: "100", category: "special", targets: "百内 25 个质数", reason: "教科书常数" },
        { input: "999983", category: "special", scale: 999983, targets: "上界恰为质数", reason: "边界计入" },
        { input: "1000000", category: "performance", scale: 1000000, targets: "百万规模卡逐数试除 O(n√n)", reason: "线性/埃氏筛必需" },
        { input: "999999", category: "performance", scale: 999999, targets: "非质数上界满规模", reason: "差一错误防护" },
        { input: "4", category: "adversarial", targets: "最小合数上界", reason: "2 与 3 计 2 个" },
      ];
      for (let i = 0; i < 4; i++) cases.push({ input: String(randInt(rng, 2, 2000)), category: "ordinary", targets: "随机小上界", reason: "与试除计数对拍" });
      return cases;
    },
  },
  AW869: { // 试除法求约数：升序一行
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const out = [];
      for (let i = 0; i < n; i++) {
        const x = t[1 + i];
        const small = [], large = [];
        for (let d = 1; d * d <= x; d++) {
          if (x % d) continue;
          small.push(d);
          if (d !== x / d) large.push(x / d);
        }
        out.push([...small, ...large.reverse()].join(" "));
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join("\n")}`;
      const cases = [
        { input: mk([1]), category: "boundary", targets: "1 只有自身", reason: "输出 1" },
        { input: mk([999999937]), category: "boundary", targets: "大质数两约数", reason: "1 与自身" },
        { input: mk([36]), category: "special", targets: "完全平方数根号约数不重复", reason: "6 只出现一次" },
        { input: mk([735134400]), category: "special", targets: "高合成数千级约数", reason: "1344 个约数升序" },
        { input: mk(Array.from({ length: 100 }, () => 999000000 + randInt(rng, 0, 999999))), category: "performance", scale: 100, targets: "百个大数试除", reason: "sqrt 枚举吞吐" },
        { input: mk(Array.from({ length: 100 }, () => 963761198400 % 2000000000 ? 735134400 : 735134400)), category: "performance", scale: 100, targets: "重复高合成数", reason: "大输出量排序" },
        { input: mk([2, 3, 4]), category: "adversarial", targets: "连续小数", reason: "输出行对应关系" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 5) }, () => randInt(rng, 1, 3000))), category: "ordinary", targets: "随机小数", reason: "升序完整性" });
      return cases;
    },
  },
  AW870: { // 约数个数：乘积的 d 值 mod 1e9+7
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const counter = new Map();
      for (let i = 0; i < n; i++) for (const [p, k] of factorize(t[1 + i])) counter.set(p, (counter.get(p) || 0) + k);
      let result = 1n;
      for (const k of counter.values()) result = (result * BigInt(k + 1)) % MOD;
      return String(result);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join("\n")}`;
      const cases = [
        { input: mk([1]), category: "boundary", targets: "乘积为 1", reason: "约数个数 1" },
        { input: mk([2, 2, 2]), category: "boundary", targets: "同质数累积", reason: "2^3 有 4 个约数" },
        { input: mk([999999937, 999999937]), category: "special", targets: "大质数平方", reason: "指数合并为 2" },
        { input: mk(Array.from({ length: 100 }, () => 2))
          , category: "special", targets: "指数 100 的幂", reason: "d=101" },
        { input: mk(Array.from({ length: 100 }, () => randInt(rng, 1, 2000000000))), category: "performance", scale: 100, targets: "百个 2e9 级大数分解", reason: "合并计数满负荷" },
        { input: mk(Array.from({ length: 100 }, () => 1999999999)), category: "performance", scale: 100, targets: "重复大数的快速分解", reason: "同数值缓存无关性" },
        { input: mk([1024, 59049, 9765625]), category: "adversarial", targets: "三个不同质数的高次幂", reason: "11×11×11" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 6) }, () => randInt(rng, 1, 500))), category: "ordinary", targets: "随机小数", reason: "常规乘积约数" });
      return cases;
    },
  },
  AW871: { // 约数之和 mod 1e9+7
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const counter = new Map();
      for (let i = 0; i < n; i++) for (const [p, k] of factorize(t[1 + i])) counter.set(p, (counter.get(p) || 0) + k);
      let result = 1n;
      for (const [p, k] of counter) {
        let term = 1n;
        const bp = BigInt(p) % MOD;
        for (let i = 0; i < k; i++) term = (term * bp + 1n) % MOD;
        result = (result * term) % MOD;
      }
      return String(result);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join("\n")}`;
      const cases = [
        { input: mk([1]), category: "boundary", targets: "乘积 1 约数和 1", reason: "空积" },
        { input: mk([2]), category: "boundary", targets: "最小质数", reason: "1+2=3" },
        { input: mk([6, 8]), category: "special", targets: "跨数合并指数", reason: "48 的约数和 124" },
        { input: mk(Array.from({ length: 60 }, () => 999999937)), category: "special", scale: 60, targets: "大质数 60 次幂等比和取模", reason: "逐项累加防溢出" },
        { input: mk(Array.from({ length: 100 }, () => randInt(rng, 1, 2000000000))), category: "performance", scale: 100, targets: "百个大数分解累积", reason: "满量分解" },
        { input: mk(Array.from({ length: 100 }, () => 2000000000)), category: "performance", scale: 100, targets: "2e9 重复分解", reason: "2^8·5^9·...合并" },
        { input: mk([16, 81]), category: "adversarial", targets: "双高次幂", reason: "31×121" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 6) }, () => randInt(rng, 1, 400))), category: "ordinary", targets: "随机小数", reason: "常规约数和" });
      return cases;
    },
  },
  AW872: { // 最大公约数
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const out = [];
      for (let i = 0; i < n; i++) out.push(gcd(t[1 + 2 * i], t[2 + 2 * i]));
      return out.join("\n");
    },
    gen(rng) {
      const mk = (pairs) => `${pairs.length}\n${pairs.map((p) => p.join(" ")).join("\n")}`;
      const fib = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10946, 17711, 28657, 46368, 75025, 121393, 196418, 317811, 514229, 832040, 1346269];
      const cases = [
        { input: mk([[1, 1]]), category: "boundary", targets: "最小同值", reason: "1" },
        { input: mk([[2000000000, 2000000000]]), category: "boundary", targets: "上界同值", reason: "自身" },
        { input: mk([[1, 2000000000]]), category: "special", targets: "互质极端", reason: "1" },
        { input: mk([[fib[28], fib[29]]]), category: "special", targets: "斐波那契相邻数辗转最深", reason: "gcd=1 且步数最多" },
        { input: mk(Array.from({ length: 10000 }, () => [randInt(rng, 1, 2000000000), randInt(rng, 1, 2000000000)])), category: "performance", scale: 10000, targets: "万组随机大数", reason: "欧几里得吞吐" },
        { input: mk(Array.from({ length: 10000 }, () => [fib[27], fib[28]])), category: "performance", scale: 10000, targets: "万组最坏步数", reason: "辗转最深重复" },
        { input: mk([[999999937, 1999999874]]), category: "adversarial", targets: "倍数关系大质数", reason: "gcd 为质数本身" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 8) }, () => [randInt(rng, 1, 1000), randInt(rng, 1, 1000)])), category: "ordinary", targets: "随机小数对", reason: "常规验证" });
      return cases;
    },
  },
  AW873: { // 欧拉函数
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const out = [];
      for (let i = 0; i < n; i++) {
        let x = t[1 + i], phi = x;
        for (const [p] of factorize(x)) phi = phi / p * (p - 1);
        out.push(phi);
      }
      return out.join("\n");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const out = [];
      for (let i = 0; i < n; i++) {
        const x = t[1 + i];
        let count = 0;
        for (let k = 1; k <= x; k++) if (gcd(k, x) === 1) count++;
        out.push(count);
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join("\n")}`;
      const cases = [
        { input: mk([1]), category: "boundary", targets: "φ(1)=1", reason: "定义边界" },
        { input: mk([2]), category: "boundary", targets: "最小质数", reason: "φ(2)=1" },
        { input: mk([999999937]), category: "special", targets: "大质数 φ=p-1", reason: "单因子路径" },
        { input: mk([1024]), category: "special", targets: "2 的幂", reason: "φ=512" },
        { input: mk(Array.from({ length: 100 }, () => randInt(rng, 1, 2000000000))), category: "performance", scale: 100, targets: "百个大数分解求 φ", reason: "sqrt 分解满负荷" },
        { input: mk(Array.from({ length: 100 }, () => 1999999998)), category: "performance", scale: 100, targets: "多因子大数重复", reason: "2·3·3·...分解" },
        { input: mk([30, 36, 210]), category: "adversarial", targets: "多质因子乘积公式", reason: "8/12/48" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 6) }, () => randInt(rng, 1, 800))), category: "ordinary", targets: "随机小数", reason: "与逐一 gcd 计数对拍" });
      return cases;
    },
  },
  AW875: { // 快速幂多组(原样例抓取残缺，弃锚点)
    skipAnchor: true,
    solve(input) {
      const parts = tokens(input);
      const n = Number(parts[0]);
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = BigInt(parts[1 + 3 * i]), b = BigInt(parts[2 + 3 * i]), p = BigInt(parts[3 + 3 * i]);
        out.push(String(powMod(a, b, p)));
      }
      return out.join("\n");
    },
    brute(input) {
      const parts = tokens(input);
      const n = Number(parts[0]);
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = BigInt(parts[1 + 3 * i]), b = Number(parts[2 + 3 * i]), p = BigInt(parts[3 + 3 * i]);
        let r = 1n % p;
        for (let k = 0; k < b; k++) r = (r * a) % p;
        out.push(String(r));
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (rows) => `${rows.length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[0, 0, 1]]), category: "boundary", targets: "0^0 mod 1", reason: "结果 0" },
        { input: mk([[1, 1000000000, 2]]), category: "boundary", targets: "底数 1 大指数", reason: "恒 1" },
        { input: mk([[2, 30, 1000000007]]), category: "special", targets: "无需取模的完整幂", reason: "2^30" },
        { input: mk([[999999999, 2, 1000000000]]), category: "special", targets: "平方溢出 64 位场景", reason: "卡 long long 直乘" },
        { input: mk(Array.from({ length: 8000 }, () => [randInt(rng, 0, 1000000000), randInt(rng, 0, 1000000000), randInt(rng, 1, 1000000000)])), category: "performance", scale: 10000, targets: "8 千组大指数卡 O(b) 循环", reason: "快速幂 30 轮×8 千" },
        { input: mk(Array.from({ length: 8000 }, () => [2, 1000000000, 998244353])), category: "performance", scale: 10000, targets: "重复大指数", reason: "满负荷位运算" },
        { input: mk([[0, 5, 7], [5, 0, 7]]), category: "adversarial", targets: "零底数与零指数并存", reason: "0 与 1" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 6) }, () => [randInt(rng, 0, 30), randInt(rng, 0, 12), randInt(rng, 1, 97)])), category: "ordinary", targets: "小参数多组", reason: "与朴素循环对拍" });
      return cases;
    },
  },
  AW876: { // 快速幂求逆元：p 为质数，a%p==0 → impossible
    solve(input) {
      const parts = tokens(input);
      const n = Number(parts[0]);
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = BigInt(parts[1 + 2 * i]), p = BigInt(parts[2 + 2 * i]);
        out.push(a % p === 0n ? "impossible" : String(powMod(a, p - 2n, p)));
      }
      return out.join("\n");
    },
    gen(rng) {
      const primes = [2, 3, 5, 7, 11, 101, 997, 99991, 999983, 999999937];
      const mk = (rows) => `${rows.length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[1, 2]]), category: "boundary", targets: "1 的逆元", reason: "恒 1" },
        { input: mk([[2, 2]]), category: "boundary", targets: "a 是 p 的倍数", reason: "impossible" },
        { input: mk([[999999936, 999999937]]), category: "special", targets: "p-1 的逆元", reason: "自身(p-1)" },
        { input: mk([[1999999874, 999999937]]), category: "special", targets: "大于 p 的倍数", reason: "impossible 判定需取模" },
        { input: mk(Array.from({ length: 10000 }, () => { const p = primes[randInt(rng, 4, primes.length - 1)]; return [randInt(rng, 1, 1000000000), p]; })), category: "performance", scale: 10000, targets: "万组费马小定理快速幂", reason: "大质数模满负荷" },
        { input: mk(Array.from({ length: 10000 }, () => [randInt(rng, 1, 100) * 999983, 999983])), category: "performance", scale: 10000, targets: "全倍数 impossible 流", reason: "边界密集" },
        { input: mk([[4, 3], [8, 5], [6, 3]]), category: "adversarial", targets: "样例同款三连", reason: "1/2/impossible" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 6) }, () => [randInt(rng, 1, 50), primes[randInt(rng, 0, 4)]])), category: "ordinary", targets: "小质数逆元", reason: "乘回验证恒等" });
      return cases;
    },
  },
  AW877: { // 扩展欧几里得：输出一组 x y
    solve(input) {
      const parts = tokens(input);
      const n = Number(parts[0]);
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = BigInt(parts[1 + 2 * i]), b = BigInt(parts[2 + 2 * i]);
        const [, x, y] = exgcd(a, b);
        out.push(`${x} ${y}`);
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (rows) => `${rows.length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[1, 1]]), category: "boundary", targets: "最小互质对", reason: "标准模板解 0 1 或 1 0" },
        { input: mk([[1000000000, 1]]), category: "boundary", targets: "b=1 直返", reason: "y 承担全部" },
        { input: mk([[6, 4]]), category: "special", targets: "非互质对", reason: "d=2 的贝祖等式" },
        { input: mk([[233, 144]]), category: "special", targets: "斐波那契相邻辗转最深", reason: "递归层数最多" },
        { input: mk(Array.from({ length: 10000 }, () => [randInt(rng, 1, 1000000000), randInt(rng, 1, 1000000000)])), category: "performance", scale: 10000, targets: "万组大数递归", reason: "log 层递归吞吐" },
        { input: mk(Array.from({ length: 10000 }, () => [1346269, 832040])), category: "performance", scale: 10000, targets: "万组最坏层数", reason: "斐波那契重复" },
        { input: mk([[4, 6], [8, 18]]), category: "adversarial", targets: "样例同款(校验模板解)", reason: "-1 1 与 -2 1" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 8) }, () => [randInt(rng, 1, 500), randInt(rng, 1, 500)])), category: "ordinary", targets: "随机小数对", reason: "贝祖等式可验证" });
      return cases;
    },
  },
  AW878: { // 线性同余方程 ax≡b(mod m)：无解 impossible
    solve(input) {
      const parts = tokens(input);
      const n = Number(parts[0]);
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = BigInt(parts[1 + 3 * i]), b = BigInt(parts[2 + 3 * i]), m = BigInt(parts[3 + 3 * i]);
        const [d, x] = exgcd(a, m);
        if (b % d !== 0n) { out.push("impossible"); continue; }
        // 模板解：x * (b/d) 对 int 取值(可为负)，按原题输出任意解语义采用模板直接解
        out.push(String(BigInt.asIntN(64, x * (b / d) % m)));
      }
      return out.join("\n");
    },
    gen(rng) {
      const mk = (rows) => `${rows.length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[1, 0, 2]]), category: "boundary", targets: "零右端", reason: "x=0 解" },
        { input: mk([[2, 1, 2]]), category: "boundary", targets: "偶模奇余无解", reason: "impossible" },
        { input: mk([[2, 3, 6], [4, 3, 5]]), category: "special", targets: "样例同款", reason: "impossible 与 -3" },
        { input: mk([[6, 4, 8]]), category: "special", targets: "d=2 整除放缩", reason: "缩放后求解" },
        { input: mk(Array.from({ length: 8000 }, () => [randInt(rng, 1, 1000000000), randInt(rng, 0, 1000000000), randInt(rng, 1, 1000000000)])), category: "performance", scale: 10000, targets: "8 千组大参数扩欧", reason: "满负荷求解" },
        { input: mk(Array.from({ length: 10000 }, () => { const m = randInt(rng, 2, 1000000); const a = randInt(rng, 1, 1000000); const x = randInt(rng, 0, m - 1); return [a, (a * x) % m, m]; })), category: "performance", scale: 10000, targets: "构造必有解流", reason: "全部可解路径" },
        { input: mk([[999999937, 1, 999999936]]), category: "adversarial", targets: "大质数与大模", reason: "边界数值" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(Array.from({ length: randInt(rng, 1, 8) }, () => [randInt(rng, 1, 60), randInt(rng, 0, 60), randInt(rng, 1, 60)])), category: "ordinary", targets: "随机小同余", reason: "回代验证 ax≡b" });
      return cases;
    },
  },
  AW204: { // 表达整数的奇怪方式：CRT 逐对合并，无解 -1
    solve(input) {
      const parts = tokens(input);
      const n = Number(parts[0]);
      let a1 = BigInt(parts[1]), m1 = BigInt(parts[2]);
      // 约定：输入行是 a m 表示 x ≡ m (mod a)
      let A = a1, M = m1;
      for (let i = 1; i < n; i++) {
        const a2 = BigInt(parts[1 + 2 * i]), m2 = BigInt(parts[2 + 2 * i]);
        const [d, k1] = exgcd(A, a2);
        if ((m2 - M) % d !== 0n) return "-1";
        const mod = a2 / d;
        let k = (k1 * ((m2 - M) / d)) % mod;
        if (k < 0n) k += mod;
        M = M + k * A;
        A = A / d * a2;
        M = ((M % A) + A) % A;
      }
      return String(M);
    },
    gen(rng) {
      const mk = (rows) => `${rows.length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const cases = [
        { input: mk([[7, 3]]), category: "boundary", targets: "单方程最小非负解", reason: "x=3" },
        { input: mk([[4, 2], [6, 3]]), category: "boundary", targets: "偶模冲突", reason: "-1" },
        { input: mk([[8, 7], [11, 9]]), category: "special", targets: "样例同款", reason: "31" },
        { input: mk([[6, 4], [9, 7]]), category: "special", targets: "非互质可解合并", reason: "d=3 放缩" },
        { input: mk(Array.from({ length: 25 }, (_, i) => { const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]; return [primes[i], randInt(rng, 0, primes[i] - 1)]; })), category: "performance", scale: 25, targets: "25 个互质模连乘接近 64 位上界", reason: "大数合并防溢出" },
        { input: mk(Array.from({ length: 20 }, () => [randInt(rng, 2, 100), 1])), category: "performance", scale: 20, targets: "非互质链式合并", reason: "gcd 放缩路径" },
        { input: mk([[10, 3], [15, 8], [6, 5]]), category: "adversarial", targets: "三方程两两非互质", reason: "逐对合并顺序" },
      ];
      for (let i = 0; i < 5; i++) {
        const x = randInt(rng, 0, 500);
        const rows = Array.from({ length: randInt(rng, 1, 4) }, () => { const a = randInt(rng, 2, 60); return [a, x % a]; });
        cases.push({ input: mk(rows), category: "ordinary", targets: "由已知解构造必可解", reason: `构造解 ${x} 的同余组` });
      }
      return cases;
    },
  },
};
