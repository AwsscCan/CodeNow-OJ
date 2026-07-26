/* CodeNow OJ · AcWing 参考解批次2b：Trie/异或对/并查集/食物链/堆/字符串哈希 · Bamzc */

import { randArray, randInt, tokens } from "./lib.mjs";

export const ACWING_SOLVERS_2B = {
  AW835: { // Trie 字符串统计：I x 插入 / Q x 查询完整串出现次数
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const n = Number(lines[0]);
      const count = new Map();
      const out = [];
      for (let i = 1; i <= n; i++) {
        const [op, x] = lines[i].split(/\s+/);
        if (op === "I") count.set(x, (count.get(x) || 0) + 1);
        else out.push(count.get(x) || 0);
      }
      return out.join("\n");
    },
    gen(rng) {
      const randWord = (len) => Array.from({ length: len }, () => "abcdefghijklmnopqrstuvwxyz"[randInt(rng, 0, 25)]).join("");
      const script = (n, vocab) => {
        const cmds = [];
        let hasQ = false;
        for (let i = 0; i < n; i++) {
          const w = vocab[randInt(rng, 0, vocab.length - 1)];
          if (rng() < 0.5) cmds.push(`I ${w}`);
          else { cmds.push(`Q ${w}`); hasQ = true; }
        }
        if (!hasQ) cmds.push(`Q ${vocab[0]}`);
        return `${cmds.length}\n${cmds.join("\n")}`;
      };
      const cases = [
        { input: "2\nI a\nQ a", category: "boundary", targets: "单字符插入即查", reason: "次数 1" },
        { input: "1\nQ zzz", category: "boundary", targets: "查询空集合", reason: "次数 0" },
        { input: "4\nI ab\nI ab\nI ab\nQ ab", category: "special", targets: "重复插入累计", reason: "次数 3" },
        { input: "3\nI abc\nQ ab\nQ abcd", category: "special", targets: "前缀不算完整串", reason: "ab 与 abcd 均 0，卡前缀计数实现" },
        { input: script(20000, Array.from({ length: 50 }, () => randWord(randInt(rng, 1, 5)))), category: "performance", scale: 20000, targets: "两万次操作高频命中", reason: "满规模操作数" },
        { input: (() => { const long = randWord(2000); const cmds = []; for (let i = 0; i < 40; i++) cmds.push(i % 2 ? `Q ${long}` : `I ${long}`); return `${cmds.length}\n${cmds.join("\n")}`; })(), category: "performance", scale: 20000, targets: "超长字符串反复插查", reason: "总长逼近上限的深链" },
        { input: "5\nI ab\nI abc\nQ ab\nI ab\nQ ab", category: "adversarial", targets: "同前缀词交错", reason: "结尾计数与路径计数区分" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: script(randInt(rng, 2, 30), Array.from({ length: 6 }, () => randWord(randInt(rng, 1, 4)))), category: "ordinary", targets: "小词表随机操作", reason: "高命中率常规验证" });
      return cases;
    },
  },
  AW143: { // 最大异或对
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      // 31 位 Trie(数组池)
      const cap = n * 32 + 2;
      const child = [new Int32Array(cap), new Int32Array(cap)];
      let nodes = 1;
      const insert = (v) => {
        let cur = 0;
        for (let b = 30; b >= 0; b--) {
          const bit = (v >> b) & 1;
          if (!child[bit][cur]) { child[bit][cur] = nodes++; }
          cur = child[bit][cur];
        }
      };
      const query = (v) => {
        let cur = 0, res = 0;
        for (let b = 30; b >= 0; b--) {
          const bit = (v >> b) & 1;
          if (child[1 - bit][cur]) { res |= 1 << b; cur = child[1 - bit][cur]; }
          else cur = child[bit][cur];
        }
        return res;
      };
      insert(t[1]);
      let best = 0;
      for (let i = 1; i < n; i++) { best = Math.max(best, query(t[1 + i])); insert(t[1 + i]); }
      return String(best);
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      let best = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) best = Math.max(best, t[1 + i] ^ t[1 + j]);
      return String(best);
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([0, 0]), category: "boundary", targets: "全零对", reason: "答案 0" },
        { input: mk([0, 2147483647]), category: "boundary", targets: "值域两端", reason: "2^31-1" },
        { input: mk([5, 5, 5]), category: "special", targets: "全等元素", reason: "任意对异或为 0" },
        { input: mk([1073741824, 1073741823]), category: "special", targets: "最高位互补", reason: "高位贪心正确性" },
        { input: mk(randArray(rng, 100000, 0, 2147483647)), category: "performance", scale: 100000, targets: "满规模卡 O(n²) 枚举", reason: "10 万数需 Trie" },
        { input: mk(Array.from({ length: 100000 }, (_, i) => i)), category: "performance", scale: 100000, targets: "连续整数密集前缀", reason: "Trie 深路径共享" },
        { input: mk([2863311530, 1431655765].map((v) => v & 2147483647)), category: "adversarial", targets: "交替比特模式", reason: "10101… 与 01010…" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 2, 40), 0, 1023)), category: "ordinary", targets: "小值域随机", reason: "与 O(n²) 对拍" });
      return cases;
    },
  },
  AW836: { // 合并集合：M a b / Q a b → Yes/No
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const [n, m] = lines[0].split(/\s+/).map(Number);
      const parent = new Int32Array(n + 1);
      for (let i = 1; i <= n; i++) parent[i] = i;
      const find = (x) => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; } return r; };
      const out = [];
      for (let i = 1; i <= m; i++) {
        const [op, aStr, bStr] = lines[i].split(/\s+/);
        const a = Number(aStr), b = Number(bStr);
        if (op === "M") { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
        else out.push(find(a) === find(b) ? "Yes" : "No");
      }
      return out.join("\n");
    },
    gen(rng) {
      const script = (n, m) => {
        const cmds = [];
        let hasQ = false;
        for (let i = 0; i < m; i++) {
          const a = randInt(rng, 1, n), b = randInt(rng, 1, n);
          if (rng() < 0.5) cmds.push(`M ${a} ${b}`);
          else { cmds.push(`Q ${a} ${b}`); hasQ = true; }
        }
        if (!hasQ) cmds.push(`Q 1 ${n}`);
        return `${n} ${cmds.length}\n${cmds.join("\n")}`;
      };
      const chainThenQuery = (n) => {
        const cmds = [];
        for (let i = 1; i < n; i++) cmds.push(`M ${i} ${i + 1}`);
        for (let i = 0; i < n; i++) cmds.push(`Q 1 ${randInt(rng, 1, n)}`);
        return `${n} ${cmds.length}\n${cmds.join("\n")}`;
      };
      const cases = [
        { input: "1 1\nQ 1 1", category: "boundary", targets: "自身查询", reason: "同点必 Yes" },
        { input: "2 2\nQ 1 2\nM 1 2", category: "boundary", targets: "合并前查询", reason: "初始各自独立 No" },
        { input: "3 4\nM 1 2\nM 1 2\nM 2 1\nQ 1 2", category: "special", targets: "重复合并幂等", reason: "已同集忽略" },
        { input: "4 3\nM 1 1\nQ 1 1\nQ 1 2", category: "special", targets: "自环合并", reason: "a=b 不影响其它" },
        { input: chainThenQuery(100000), category: "performance", scale: 100000, targets: "10 万长链卡无路径压缩", reason: "退化树高查询" },
        { input: script(100000, 100000), category: "performance", scale: 100000, targets: "随机满规模", reason: "混合合并查询" },
        { input: "6 5\nM 1 2\nM 3 4\nM 5 6\nM 2 4\nQ 1 6", category: "adversarial", targets: "跨组连接后的间接连通", reason: "1-2-4-3 与 5-6 分离" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: script(randInt(rng, 2, 20), randInt(rng, 2, 30)), category: "ordinary", targets: "随机小规模", reason: "常规正确性" });
      return cases;
    },
  },
  AW837: { // 连通块中点的数量：C a b / Q1 a b / Q2 a
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const [n, m] = lines[0].split(/\s+/).map(Number);
      const parent = new Int32Array(n + 1);
      const size = new Int32Array(n + 1).fill(1);
      for (let i = 1; i <= n; i++) parent[i] = i;
      const find = (x) => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; } return r; };
      const out = [];
      for (let i = 1; i <= m; i++) {
        const parts = lines[i].split(/\s+/);
        if (parts[0] === "C") {
          const ra = find(Number(parts[1])), rb = find(Number(parts[2]));
          if (ra !== rb) { parent[ra] = rb; size[rb] += size[ra]; }
        } else if (parts[0] === "Q1") {
          out.push(find(Number(parts[1])) === find(Number(parts[2])) ? "Yes" : "No");
        } else out.push(size[find(Number(parts[1]))]);
      }
      return out.join("\n");
    },
    gen(rng) {
      const script = (n, m) => {
        const cmds = [];
        let hasQ = false;
        for (let i = 0; i < m; i++) {
          const roll = rng();
          const a = randInt(rng, 1, n), b = randInt(rng, 1, n);
          if (roll < 0.45) cmds.push(`C ${a} ${b}`);
          else if (roll < 0.7) { cmds.push(`Q1 ${a} ${b}`); hasQ = true; }
          else { cmds.push(`Q2 ${a}`); hasQ = true; }
        }
        if (!hasQ) cmds.push("Q2 1");
        return `${n} ${cmds.length}\n${cmds.join("\n")}`;
      };
      const star = (n) => {
        const cmds = [];
        for (let i = 2; i <= n; i++) cmds.push(`C 1 ${i}`);
        cmds.push("Q2 1", `Q1 2 ${n}`);
        return `${n} ${cmds.length}\n${cmds.join("\n")}`;
      };
      const cases = [
        { input: "1 2\nQ2 1\nQ1 1 1", category: "boundary", targets: "单点块", reason: "size=1 且自连通" },
        { input: "3 2\nC 2 2\nQ2 2", category: "boundary", targets: "自环连接", reason: "size 不得虚增" },
        { input: "4 4\nC 1 2\nC 1 2\nQ2 1\nQ2 2", category: "special", targets: "重复连接 size 不重复累加", reason: "size 恒为 2" },
        { input: star(100000), category: "performance", scale: 100000, targets: "星型满规模按秩/路径压缩", reason: "10 万点单块 size" },
        { input: script(100000, 100000), category: "performance", scale: 100000, targets: "随机满规模", reason: "混合三种指令" },
        { input: "6 6\nC 1 2\nC 3 4\nQ2 1\nC 2 3\nQ2 4\nQ1 1 4", category: "adversarial", targets: "两块合并后 size 汇总", reason: "合并根 size 累加方向" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: script(randInt(rng, 2, 20), randInt(rng, 3, 30)), category: "ordinary", targets: "随机小规模", reason: "常规正确性" });
      return cases;
    },
  },
  AW240: { // 食物链：扩展域并查集，输出假话数
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, k] = t;
      const parent = new Int32Array(3 * n + 1);
      for (let i = 1; i <= 3 * n; i++) parent[i] = i;
      const find = (x) => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; } return r; };
      const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
      let lies = 0;
      for (let i = 0; i < k; i++) {
        const d = t[2 + 3 * i], x = t[3 + 3 * i], y = t[4 + 3 * i];
        if (x > n || y > n) { lies++; continue; }
        if (d === 1) {
          if (find(x) === find(y + n) || find(x) === find(y + 2 * n)) { lies++; continue; }
          union(x, y); union(x + n, y + n); union(x + 2 * n, y + 2 * n);
        } else {
          if (x === y) { lies++; continue; }
          if (find(x) === find(y) || find(x) === find(y + n)) { lies++; continue; }
          union(x, y + 2 * n); union(x + n, y); union(x + 2 * n, y + n);
        }
      }
      return String(lies);
    },
    gen(rng) {
      const mk = (n, rows) => `${n} ${rows.length}\n${rows.map((r) => r.join(" ")).join("\n")}`;
      const consistent = (n, k) => {
        // 先随机指派物种(0/1/2)，再只生成与指派一致的真话
        const species = Array.from({ length: n + 1 }, () => randInt(rng, 0, 2));
        const rows = [];
        for (let i = 0; i < k; i++) {
          const x = randInt(rng, 1, n), y = randInt(rng, 1, n);
          if (species[x] === species[y]) rows.push([1, x, y]);
          else if ((species[x] + 1) % 3 === species[y]) rows.push([2, x, y]);
          else rows.push([2, y, x]);
        }
        return rows;
      };
      const cases = [
        { input: mk(2, [[1, 1, 2], [2, 1, 2]]), category: "boundary", targets: "同类后互吃矛盾", reason: "第二句假，共 1" },
        { input: mk(3, [[2, 1, 1]]), category: "boundary", targets: "自己吃自己", reason: "必假" },
        { input: mk(2, [[1, 3, 1], [2, 1, 3]]), category: "special", targets: "编号越界", reason: "X/Y>N 均为假话" },
        { input: mk(5, [[2, 1, 2], [2, 2, 3], [2, 3, 1], [1, 1, 3]]), category: "special", targets: "三元环成立后同类矛盾", reason: "环形食物链推理" },
        { input: mk(50000, consistent(50000, 100000)), category: "performance", scale: 100000, targets: "10 万条全真话满规模", reason: "扩展域三倍点集压缩" },
        { input: mk(50000, [...consistent(50000, 99000), ...Array.from({ length: 1000 }, () => [randInt(rng, 1, 2), 50001, randInt(rng, 1, 50000)])]), category: "performance", scale: 100000, targets: "混入越界假话", reason: "假话在末尾集中" },
        { input: mk(4, [[1, 1, 2], [1, 2, 3], [2, 3, 1], [2, 1, 4], [1, 4, 1]]), category: "adversarial", targets: "先立同类链再翻供", reason: "传递闭包上的矛盾检测" },
      ];
      for (let i = 0; i < 5; i++) {
        const n = randInt(rng, 3, 15);
        const rows = consistent(n, randInt(rng, 2, 10));
        if (rng() < 0.5) rows.push([randInt(rng, 1, 2), randInt(rng, 1, n), randInt(rng, 1, n)]);
        cases.push({ input: mk(n, rows), category: "ordinary", targets: "以一致指派为底的随机话", reason: "常规正确性" });
      }
      return cases;
    },
  },
  AW838: { // 堆排序：前 m 小
    solve(input) {
      const t = tokens(input).map(Number);
      const [n, m] = t;
      return t.slice(2, 2 + n).sort((a, b) => a - b).slice(0, m).join(" ");
    },
    gen(rng) {
      const mk = (arr, m) => `${arr.length} ${m}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([5], 1), category: "boundary", targets: "单元素", reason: "n=m=1" },
        { input: mk([1000000000, 1], 2), category: "boundary", targets: "值域上界全取", reason: "m=n" },
        { input: mk([3, 3, 3, 1], 3), category: "special", targets: "重复值参与前 m", reason: "1 3 3" },
        { input: mk(Array.from({ length: 100000 }, (_, i) => 100000 - i), 100000), category: "performance", scale: 100000, targets: "逆序满规模全量输出", reason: "10 万下沉建堆" },
        { input: mk(randArray(rng, 100000, 1, 1000000000), 1), category: "performance", scale: 100000, targets: "只取最小值", reason: "m=1 的堆顶" },
        { input: mk(randArray(rng, 100000, 1, 1000000000), 50000), category: "performance", scale: 100000, targets: "半量弹出的堆调整吞吐", reason: "5 万次 down 操作" },
        { input: mk(Array.from({ length: 1000 }, () => 7), 500), category: "adversarial", targets: "全等元素", reason: "堆序稳定性无关但值全同" },
      ];
      for (let i = 0; i < 5; i++) { const n = randInt(rng, 2, 50); cases.push({ input: mk(randArray(rng, n, 1, 100), randInt(rng, 1, n)), category: "ordinary", targets: "随机小数组", reason: "常规正确性" }); }
      return cases;
    },
  },
  AW839: { // 模拟堆：I x / PM / DM / D k / C k x
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const n = Number(lines[0]);
      // 惰性删除小根堆：条目 [val, insertId]，current 记录每个插入序号的当前有效值
      const hv = [], hid = [];
      const current = new Map();
      const swap = (i, j) => { [hv[i], hv[j]] = [hv[j], hv[i]]; [hid[i], hid[j]] = [hid[j], hid[i]]; };
      const less = (i, j) => hv[i] < hv[j] || (hv[i] === hv[j] && hid[i] < hid[j]);
      const push = (v, id) => { hv.push(v); hid.push(id); let i = hv.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(i, p)) break; swap(i, p); i = p; } };
      const popTop = () => {
        const lv = hv.pop(), lid = hid.pop();
        if (hv.length) {
          hv[0] = lv; hid[0] = lid;
          let i = 0;
          for (;;) { let s = i; const l = 2 * i + 1, r = 2 * i + 2; if (l < hv.length && less(l, s)) s = l; if (r < hv.length && less(r, s)) s = r; if (s === i) break; swap(s, i); i = s; }
        }
      };
      const settleTop = () => { while (hv.length && current.get(hid[0]) !== hv[0]) popTop(); };
      let insertId = 0;
      const out = [];
      for (let i = 1; i <= n; i++) {
        const parts = lines[i].split(/\s+/);
        if (parts[0] === "I") { insertId++; const v = Number(parts[1]); current.set(insertId, v); push(v, insertId); }
        else if (parts[0] === "PM") { settleTop(); out.push(hv[0]); }
        else if (parts[0] === "DM") { settleTop(); current.delete(hid[0]); popTop(); }
        else if (parts[0] === "D") current.delete(Number(parts[1]));
        else { const k = Number(parts[1]), v = Number(parts[2]); current.set(k, v); push(v, k); }
      }
      return out.join("\n");
    },
    gen(rng) {
      const script = (ops) => {
        const cmds = [];
        const alive = new Map(); // insertId -> value
        let insertId = 0, hasPM = false;
        const values = () => [...alive.values()];
        for (let i = 0; i < ops; i++) {
          const roll = rng();
          if (!alive.size || roll < 0.4) { insertId++; const v = randInt(rng, -1000000000, 1000000000); alive.set(insertId, v); cmds.push(`I ${v}`); }
          else if (roll < 0.6) { cmds.push("PM"); hasPM = true; }
          else if (roll < 0.72) {
            const vals = values();
            const min = Math.min(...vals);
            if (vals.filter((v) => v === min).length !== 1) { cmds.push("PM"); hasPM = true; continue; } // 保证最小值唯一才 DM
            for (const [k, v] of alive) if (v === min) { alive.delete(k); break; }
            cmds.push("DM");
          } else if (roll < 0.85) {
            const keys = [...alive.keys()];
            const k = keys[randInt(rng, 0, keys.length - 1)];
            alive.delete(k);
            cmds.push(`D ${k}`);
          } else {
            const keys = [...alive.keys()];
            const k = keys[randInt(rng, 0, keys.length - 1)];
            const v = randInt(rng, -1000000000, 1000000000);
            alive.set(k, v);
            cmds.push(`C ${k} ${v}`);
          }
        }
        if (!hasPM) { insertId++; alive.set(insertId, 1); cmds.push("I 1", "PM"); }
        return `${cmds.length}\n${cmds.join("\n")}`;
      };
      const cases = [
        { input: "2\nI 5\nPM", category: "boundary", targets: "单元素最小值", reason: "最小操作" },
        { input: "4\nI 3\nI 1\nDM\nPM", category: "boundary", targets: "删最小后回退次小", reason: "DM 语义" },
        { input: "5\nI 9\nI 8\nD 2\nI 7\nPM", category: "special", targets: "删第 k 个插入", reason: "按插入序号删除" },
        { input: "5\nI 5\nI 6\nC 1 10\nPM\nDM", category: "special", targets: "修改后堆序调整", reason: "C 改大原最小值" },
        { input: script(100000), category: "performance", scale: 100000, targets: "满规模混合操作卡 O(n) 扫描求最小", reason: "10 万指令" },
        { input: (() => { const cmds = []; for (let i = 0; i < 40000; i++) cmds.push(`I ${40000 - i}`); for (let i = 0; i < 20000; i++) cmds.push("PM", "DM"); return `${cmds.length}\n${cmds.join("\n")}`; })(), category: "performance", scale: 80000, targets: "逆序灌入后连续弹底", reason: "堆下沉满负荷" },
        { input: "7\nI 4\nI 4\nPM\nD 1\nPM\nC 2 4\nPM", category: "adversarial", targets: "同值不同插入序号的删改", reason: "惰性删除按序号区分" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: script(randInt(rng, 3, 40)), category: "ordinary", targets: "随机合法指令", reason: "影子 Map 保证 DM 唯一最小" });
      return cases;
    },
  },
  AW841: { // 字符串哈希：判断两区间子串是否相同
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const [n, m] = lines[0].split(/\s+/).map(Number);
      const s = lines[1];
      // BigInt 双模哈希：Number 版 H[l-1]*P[len] 会溢出 2^53(正是本题要卡的错误)
      const MOD1 = 1000000007n, MOD2 = 998244353n, B1 = 131n, B2 = 13331n;
      const H1 = new Array(n + 1).fill(0n), H2 = new Array(n + 1).fill(0n);
      const P1 = new Array(n + 1).fill(1n), P2 = new Array(n + 1).fill(1n);
      for (let i = 1; i <= n; i++) {
        const c = BigInt(s.charCodeAt(i - 1));
        H1[i] = (H1[i - 1] * B1 + c) % MOD1;
        H2[i] = (H2[i - 1] * B2 + c) % MOD2;
        P1[i] = (P1[i - 1] * B1) % MOD1;
        P2[i] = (P2[i - 1] * B2) % MOD2;
      }
      const sub1 = (l, r) => (((H1[r] - H1[l - 1] * P1[r - l + 1]) % MOD1) + MOD1) % MOD1;
      const sub2 = (l, r) => (((H2[r] - H2[l - 1] * P2[r - l + 1]) % MOD2) + MOD2) % MOD2;
      const out = [];
      for (let i = 1; i <= m; i++) {
        const [l1, r1, l2, r2] = lines[1 + i].split(/\s+/).map(Number);
        if (r1 - l1 !== r2 - l2) { out.push("No"); continue; }
        out.push(sub1(l1, r1) === sub1(l2, r2) && sub2(l1, r1) === sub2(l2, r2) ? "Yes" : "No");
      }
      return out.join("\n");
    },
    brute(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const m = Number(lines[0].split(/\s+/)[1]);
      const s = lines[1];
      const out = [];
      for (let i = 1; i <= m; i++) {
        const [l1, r1, l2, r2] = lines[1 + i].split(/\s+/).map(Number);
        out.push(s.slice(l1 - 1, r1) === s.slice(l2 - 1, r2) ? "Yes" : "No");
      }
      return out.join("\n");
    },
    gen(rng) {
      const alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const randStr = (n, k) => Array.from({ length: n }, () => alpha[randInt(rng, 0, k - 1)]).join("");
      const mk = (s, qs) => `${s.length} ${qs.length}\n${s}\n${qs.map((q) => q.join(" ")).join("\n")}`;
      const period = "abz".repeat(34000); // 长周期串：相同子串遍地都是
      const periodQs = Array.from({ length: 100000 }, () => {
        const len = randInt(rng, 1, 300);
        const l1 = randInt(rng, 1, period.length - len + 1);
        // 一半构造必相同(同余移位)，一半随机
        if (rng() < 0.5) {
          const shift = 3 * randInt(rng, 1, 100);
          const l2 = l1 + shift <= period.length - len + 1 ? l1 + shift : l1;
          return [l1, l1 + len - 1, l2, l2 + len - 1];
        }
        const l2 = randInt(rng, 1, period.length - len + 1);
        return [l1, l1 + len - 1, l2, l2 + len - 1];
      });
      const cases = [
        { input: mk("aa", [[1, 1, 2, 2]]), category: "boundary", targets: "单字符相等", reason: "Yes" },
        { input: mk("ab", [[1, 1, 2, 2], [1, 2, 1, 2]]), category: "boundary", targets: "不同字符与全串自比", reason: "No 与 Yes" },
        { input: mk("aAbB09", [[1, 2, 3, 4]]), category: "special", targets: "大小写敏感", reason: "aA 与 bB 不同" },
        { input: mk("abcabc", [[1, 3, 4, 6], [1, 3, 2, 4]]), category: "special", targets: "周期串重叠区间", reason: "Yes 与 No" },
        { input: mk("aaaa", [[1, 2, 2, 3], [1, 3, 2, 4]]), category: "special", targets: "重叠自相似", reason: "全 Yes" },
        { input: mk(period, periodQs), category: "performance", scale: 100000, targets: "10 万询问卡逐字符比较", reason: "周期串半数长区间相同" },
        { input: mk(randStr(100000, 62), Array.from({ length: 100000 }, () => { const len = randInt(rng, 1, 50); const l1 = randInt(rng, 1, 100000 - len + 1); const l2 = randInt(rng, 1, 100000 - len + 1); return [l1, l1 + len - 1, l2, l2 + len - 1]; })), category: "performance", scale: 100000, targets: "随机串满规模", reason: "绝大多数 No 的哈希预筛" },
        { input: mk("abab", [[1, 2, 3, 4], [1, 3, 2, 4]]), category: "adversarial", targets: "相同与错位不同并存", reason: "错一位即 No" },
      ];
      for (let i = 0; i < 4; i++) {
        const s = randStr(randInt(rng, 4, 60), 3);
        const qs = Array.from({ length: randInt(rng, 1, 8) }, () => {
          const len = randInt(rng, 1, Math.max(1, s.length >> 1));
          const l1 = randInt(rng, 1, s.length - len + 1), l2 = randInt(rng, 1, s.length - len + 1);
          return [l1, l1 + len - 1, l2, l2 + len - 1];
        });
        cases.push({ input: mk(s, qs), category: "ordinary", targets: "小串随机区间", reason: "与 substring 对拍" });
      }
      return cases;
    },
  },
};
