/* CodeNow OJ · AcWing 参考解批次2a：链表/栈/队列/表达式/单调栈/KMP · Bamzc */

import { randArray, randInt, tokens } from "./lib.mjs";

export const ACWING_SOLVERS_2A = {
  AW826: { // 单链表：H x / D k / I k x，末了输出链表
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const m = Number(lines[0]);
      const value = [], next = [];
      let head = -1, idx = 0;
      for (let i = 1; i <= m; i++) {
        const parts = lines[i].split(/\s+/);
        if (parts[0] === "H") { value[idx] = Number(parts[1]); next[idx] = head; head = idx; idx++; }
        else if (parts[0] === "D") {
          const k = Number(parts[1]);
          if (k === 0) head = next[head];
          else next[k - 1] = next[next[k - 1]];
        } else { const k = Number(parts[1]); value[idx] = Number(parts[2]); next[idx] = next[k - 1]; next[k - 1] = idx; idx++; }
      }
      const out = [];
      for (let p = head; p !== -1 && p !== undefined; p = next[p]) out.push(value[p]);
      return out.join(" ");
    },
    gen(rng) {
      // 影子模拟保证指令合法(被操作的第 k 个插入数仍在链上)
      const script = (ops, maxVal = 1000000000) => {
        const cmds = [];
        let inserted = 0;
        const alive = new Set(); // 在链上的插入序号
        const chain = []; // 简易影子链(存插入序号)
        for (let i = 0; i < ops; i++) {
          const roll = rng();
          if (inserted === 0 || roll < 0.45) {
            inserted++; alive.add(inserted); chain.unshift(inserted);
            cmds.push(`H ${randInt(rng, -maxVal, maxVal)}`);
          } else if (roll < 0.75 && chain.length) {
            const anchors = [...alive];
            const k = anchors[randInt(rng, 0, anchors.length - 1)];
            inserted++; alive.add(inserted);
            chain.splice(chain.indexOf(k) + 1, 0, inserted);
            cmds.push(`I ${k} ${randInt(rng, -maxVal, maxVal)}`);
          } else if (chain.length) {
            if (rng() < 0.3) { const removed = chain.shift(); alive.delete(removed); cmds.push("D 0"); }
            else {
              const pos = randInt(rng, 0, chain.length - 1);
              const k = chain[pos];
              if (pos + 1 < chain.length) { const removed = chain[pos + 1]; alive.delete(removed); chain.splice(pos + 1, 1); }
              cmds.push(`D ${k}`);
            }
          } else { inserted++; alive.add(inserted); chain.unshift(inserted); cmds.push(`H ${randInt(rng, -maxVal, maxVal)}`); }
          if (!chain.length && i === ops - 1) { inserted++; alive.add(inserted); chain.unshift(inserted); cmds.push(`H 1`); }
        }
        if (!chain.length) cmds.push("H 1");
        return `${cmds.length}\n${cmds.join("\n")}`;
      };
      const headOnly = (n) => `${n}\n${Array.from({ length: n }, (_, i) => `H ${i + 1}`).join("\n")}`;
      const cases = [
        { input: "1\nH 5", category: "boundary", targets: "单次头插", reason: "最小操作序列" },
        { input: "3\nH 1\nD 0\nH 2", category: "boundary", targets: "删空头后再插", reason: "头指针复位" },
        { input: "4\nH 3\nI 1 2\nD 1\nI 1 9", category: "special", targets: "删后原位再插", reason: "next 指针重接" },
        { input: headOnly(15000), category: "performance", scale: 10000, targets: "1.5 万次头插卡 O(n) 单次插入实现", reason: "满规模构建" },
        { input: script(15000), category: "performance", scale: 10000, targets: "满规模混合操作", reason: "插删交错压力" },
        { input: script(30), category: "adversarial", targets: "高频删除的短链", reason: "频繁触碰头结点" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: script(randInt(rng, 4, 30)), category: "ordinary", targets: "随机合法操作序列", reason: "影子模拟保证合法" });
      return cases;
    },
  },
  AW827: { // 双链表：L x / R x / D k / IL k x / IR k x
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const m = Number(lines[0]);
      const value = [0, 0], left = [0, 0], right = [1, 1];
      right[0] = 1; left[1] = 0;
      let idx = 2;
      const insertAfter = (p, x) => { value[idx] = x; left[idx] = p; right[idx] = right[p]; left[right[p]] = idx; right[p] = idx; idx++; };
      const remove = (p) => { right[left[p]] = right[p]; left[right[p]] = left[p]; };
      for (let i = 1; i <= m; i++) {
        const parts = lines[i].split(/\s+/);
        if (parts[0] === "L") insertAfter(0, Number(parts[1]));
        else if (parts[0] === "R") insertAfter(left[1], Number(parts[1]));
        else if (parts[0] === "D") remove(Number(parts[1]) + 1);
        else if (parts[0] === "IL") insertAfter(left[Number(parts[1]) + 1], Number(parts[2]));
        else insertAfter(Number(parts[1]) + 1, Number(parts[2]));
      }
      const out = [];
      for (let p = right[0]; p !== 1; p = right[p]) out.push(value[p]);
      return out.join(" ");
    },
    gen(rng) {
      const script = (ops) => {
        const cmds = [];
        let inserted = 0;
        const alive = [];
        for (let i = 0; i < ops; i++) {
          const roll = rng();
          if (!alive.length || roll < 0.5) {
            inserted++;
            alive.push(inserted);
            cmds.push(`${rng() < 0.5 ? "L" : "R"} ${randInt(rng, -1000000, 1000000)}`);
          } else if (roll < 0.8) {
            const k = alive[randInt(rng, 0, alive.length - 1)];
            inserted++; alive.push(inserted);
            cmds.push(`${rng() < 0.5 ? "IL" : "IR"} ${k} ${randInt(rng, -1000000, 1000000)}`);
          } else {
            const pos = randInt(rng, 0, alive.length - 1);
            cmds.push(`D ${alive[pos]}`);
            alive.splice(pos, 1);
          }
        }
        if (!alive.length) cmds.push("L 1");
        return `${cmds.length}\n${cmds.join("\n")}`;
      };
      const cases = [
        { input: "1\nR 9", category: "boundary", targets: "单次右插", reason: "最小序列" },
        { input: "3\nL 1\nD 1\nR 7", category: "boundary", targets: "插入即删除后再插", reason: "删空后哨兵指针复位" },
        { input: "4\nR 2\nL 5\nD 2\nIR 1 6", category: "special", targets: "删除后按插入序号邻位插入", reason: "已删结点不影响其它序号定位" },
        { input: "5\nR 1\nIL 1 2\nIR 1 3\nD 1\nIL 3 4", category: "special", targets: "围绕已删结点的邻位插入", reason: "L/R 指针交叉重接" },
        { input: `${10000}\n${Array.from({ length: 10000 }, (_, i) => (i % 2 ? `L ${i}` : `R ${i}`)).join("\n")}`, category: "performance", scale: 10000, targets: "双端交替满规模", reason: "10 万次端点插入" },
        { input: script(15000), category: "performance", scale: 10000, targets: "满规模混合操作", reason: "增删平衡压力" },
        { input: script(25), category: "adversarial", targets: "高删除率短链", reason: "反复删至将空" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: script(randInt(rng, 3, 30)), category: "ordinary", targets: "随机合法操作", reason: "影子结构保证合法" });
      return cases;
    },
  },
  AW828: { // 模拟栈
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const m = Number(lines[0]);
      const stack = [];
      const out = [];
      for (let i = 1; i <= m; i++) {
        const parts = lines[i].split(/\s+/);
        if (parts[0] === "push") stack.push(parts[1]);
        else if (parts[0] === "pop") stack.pop();
        else if (parts[0] === "empty") out.push(stack.length ? "NO" : "YES");
        else out.push(stack[stack.length - 1]);
      }
      return out.join("\n");
    },
    gen(rng) {
      const script = (ops) => {
        const cmds = [];
        let depth = 0;
        for (let i = 0; i < ops; i++) {
          const roll = rng();
          if (!depth || roll < 0.4) { cmds.push(`push ${randInt(rng, -1000000000, 1000000000)}`); depth++; }
          else if (roll < 0.6) { cmds.push("pop"); depth--; }
          else if (roll < 0.8) cmds.push("empty");
          else cmds.push("query");
        }
        if (!cmds.some((c) => c === "empty" || c === "query")) cmds.push("empty");
        return `${cmds.length}\n${cmds.join("\n")}`;
      };
      const deep = () => {
        const cmds = [];
        for (let i = 0; i < 12000; i++) cmds.push(`push ${i}`);
        cmds.push("query");
        for (let i = 0; i < 11999; i++) cmds.push("pop");
        cmds.push("query", "empty");
        return `${cmds.length}\n${cmds.join("\n")}`;
      };
      const cases = [
        { input: "2\nempty\npush 1", category: "boundary", targets: "空栈判定", reason: "初始 YES" },
        { input: "3\npush 5\npop\nempty", category: "boundary", targets: "弹空后判空", reason: "回到 YES" },
        { input: "4\npush -1000000000\nquery\npush 1000000000\nquery", category: "special", targets: "值域两端", reason: "负数栈顶" },
        { input: deep(), category: "performance", scale: 10000, targets: "深压深弹满规模", reason: "10 万次操作" },
        { input: script(15000), category: "performance", scale: 10000, targets: "随机满规模", reason: "混合指令压力" },
        { input: "6\npush 1\npush 2\npop\nquery\npop\nempty", category: "adversarial", targets: "弹出后栈顶回退", reason: "query 读到旧顶即错" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: script(randInt(rng, 2, 30)), category: "ordinary", targets: "随机指令", reason: "构造保证不弹空栈" });
      return cases;
    },
  },
  AW3302: { // 表达式求值：+ - * / 与括号，C++ 整除(向零取整)
    solve(input) {
      const expr = input.trim();
      const nums = [], ops = [];
      const prio = { "+": 1, "-": 1, "*": 2, "/": 2 };
      const apply = () => {
        const b = nums.pop(), a = nums.pop(), op = ops.pop();
        if (op === "+") nums.push(a + b);
        else if (op === "-") nums.push(a - b);
        else if (op === "*") nums.push(a * b);
        else nums.push(Math.trunc(a / b));
      };
      for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (ch >= "0" && ch <= "9") {
          let j = i, v = 0;
          while (j < expr.length && expr[j] >= "0" && expr[j] <= "9") { v = v * 10 + Number(expr[j]); j++; }
          nums.push(v); i = j - 1;
        } else if (ch === "(") ops.push(ch);
        else if (ch === ")") { while (ops[ops.length - 1] !== "(") apply(); ops.pop(); }
        else { while (ops.length && ops[ops.length - 1] !== "(" && prio[ops[ops.length - 1]] >= prio[ch]) apply(); ops.push(ch); }
      }
      while (ops.length) apply();
      return String(nums[0]);
    },
    gen(rng) {
      // 随机生成合法表达式(结果与中间值控制在安全范围)
      const genExpr = (depth) => {
        if (depth <= 0 || rng() < 0.35) return String(randInt(rng, 1, 99));
        const op = "+-*/"[randInt(rng, 0, 3)];
        const left = genExpr(depth - 1);
        let right = genExpr(depth - 1);
        if (op === "/" ) right = String(randInt(rng, 1, 30)); // 避免除零
        const body = `${left}${op}${right}`;
        return rng() < 0.5 ? `(${body})` : body;
      };
      const chain = (n, op) => Array.from({ length: n }, () => randInt(rng, 1, 9)).join(op);
      const cases = [
        { input: "7", category: "boundary", targets: "单数字", reason: "无运算符" },
        { input: "2+3*4", category: "special", targets: "乘法优先级", reason: "答案 14 非 20" },
        { input: "(2+3)*4", category: "special", targets: "括号提升优先级", reason: "答案 20" },
        { input: "7/2", category: "special", targets: "整除向零取整", reason: "答案 3" },
        { input: "1-2-3", category: "special", targets: "同级左结合", reason: "答案 -4，右结合会得 2" },
        { input: "8-6/3*2", category: "special", targets: "乘除混合左结合", reason: "答案 4" },
        { input: `(${"(".repeat(200)}1${")".repeat(200)}+1)`, category: "adversarial", targets: "200 层嵌套括号", reason: "深栈括号匹配" },
        { input: chain(20000, "+"), category: "performance", scale: 20000, targets: "两万项连加", reason: "长表达式线性求值" },
        { input: chain(20000, "-"), category: "performance", scale: 20000, targets: "两万项连减左结合", reason: "结合性大规模验证" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: genExpr(4), category: "ordinary", targets: "随机嵌套表达式", reason: "综合优先级与括号" });
      return cases;
    },
  },
  AW829: { // 模拟队列
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const m = Number(lines[0]);
      const queue = [];
      let head = 0;
      const out = [];
      for (let i = 1; i <= m; i++) {
        const parts = lines[i].split(/\s+/);
        if (parts[0] === "push") queue.push(parts[1]);
        else if (parts[0] === "pop") head++;
        else if (parts[0] === "empty") out.push(queue.length - head ? "NO" : "YES");
        else out.push(queue[head]);
      }
      return out.join("\n");
    },
    gen(rng) {
      const script = (ops) => {
        const cmds = [];
        let size = 0;
        for (let i = 0; i < ops; i++) {
          const roll = rng();
          if (!size || roll < 0.4) { cmds.push(`push ${randInt(rng, -1000000000, 1000000000)}`); size++; }
          else if (roll < 0.6) { cmds.push("pop"); size--; }
          else if (roll < 0.8) cmds.push("empty");
          else cmds.push("query");
        }
        if (!cmds.some((c) => c === "empty" || c === "query")) cmds.push("empty");
        return `${cmds.length}\n${cmds.join("\n")}`;
      };
      const rolling = () => {
        const cmds = [];
        for (let i = 0; i < 12000; i++) { cmds.push(`push ${i}`); if (i % 2) { cmds.push("pop"); } }
        cmds.push("query", "empty");
        return `${cmds.length}\n${cmds.join("\n")}`;
      };
      const cases = [
        { input: "2\nempty\npush 3", category: "boundary", targets: "初始空队", reason: "YES" },
        { input: "4\npush 1\npop\nempty\npush 2", category: "boundary", targets: "弹空判定", reason: "队头回收" },
        { input: "5\npush 4\npush 5\npop\nquery\nempty", category: "special", targets: "FIFO 语义", reason: "query 应为 5，栈实现会错" },
        { input: rolling(), category: "performance", scale: 10000, targets: "滚动进出满规模卡数组头删 O(n)", reason: "shift 实现退化 O(n²)" },
        { input: script(15000), category: "performance", scale: 10000, targets: "随机满规模", reason: "混合指令压力" },
        { input: "6\npush 9\npush 8\npop\npop\nempty\npush 7", category: "adversarial", targets: "清空后复用", reason: "head/tail 指针复位" },
      ];
      for (let i = 0; i < 6; i++) cases.push({ input: script(randInt(rng, 2, 30)), category: "ordinary", targets: "随机指令", reason: "构造保证不弹空队" });
      return cases;
    },
  },
  AW830: { // 单调栈：左边第一个更小的数
    solve(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const stack = [];
      const out = [];
      for (let i = 0; i < n; i++) {
        const v = t[1 + i];
        while (stack.length && stack[stack.length - 1] >= v) stack.pop();
        out.push(stack.length ? stack[stack.length - 1] : -1);
        stack.push(v);
      }
      return out.join(" ");
    },
    brute(input) {
      const t = tokens(input).map(Number);
      const n = t[0];
      const a = t.slice(1, 1 + n);
      const out = [];
      for (let i = 0; i < n; i++) {
        let ans = -1;
        for (let j = i - 1; j >= 0; j--) if (a[j] < a[i]) { ans = a[j]; break; }
        out.push(ans);
      }
      return out.join(" ");
    },
    gen(rng) {
      const mk = (arr) => `${arr.length}\n${arr.join(" ")}`;
      const cases = [
        { input: mk([1]), category: "boundary", targets: "单元素", reason: "-1" },
        { input: mk([1000000000, 1]), category: "boundary", targets: "值域上界与下降", reason: "大值后无更小前驱" },
        { input: mk([2, 2, 2]), category: "special", targets: "全等严格小于判定", reason: "相等不算更小，全 -1" },
        { input: mk(Array.from({ length: 10000 }, (_, i) => i + 1)), category: "performance", scale: 10000, targets: "严格递增栈只进不出", reason: "答案为前一项" },
        { input: mk(Array.from({ length: 10000 }, (_, i) => 100000 - i)), category: "performance", scale: 10000, targets: "严格递减卡 O(n²) 回扫", reason: "全 -1 且逐个弹栈" },
        { input: mk(randArray(rng, 15000, 1, 1000000000)), category: "performance", scale: 10000, targets: "随机满规模", reason: "均摊弹栈压力" },
        { input: mk([5, 3, 4, 2, 6, 1, 7]), category: "adversarial", targets: "锯齿弹栈保留", reason: "栈内跨层查找" },
      ];
      for (let i = 0; i < 5; i++) cases.push({ input: mk(randArray(rng, randInt(rng, 2, 50), 1, 30)), category: "ordinary", targets: "随机小数组", reason: "与回扫暴力对拍" });
      return cases;
    },
  },
  AW831: { // KMP：输出所有出现起始下标(0-based)，空格分隔
    solve(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const p = lines[1], s = lines[3];
      const n = p.length, m = s.length;
      const fail = new Int32Array(n);
      for (let i = 1, j = 0; i < n; i++) {
        while (j > 0 && p[i] !== p[j]) j = fail[j - 1];
        if (p[i] === p[j]) j++;
        fail[i] = j;
      }
      const out = [];
      for (let i = 0, j = 0; i < m; i++) {
        while (j > 0 && s[i] !== p[j]) j = fail[j - 1];
        if (s[i] === p[j]) j++;
        if (j === n) { out.push(i - n + 1); j = fail[j - 1]; }
      }
      return out.join(" ");
    },
    brute(input) {
      const lines = input.split("\n").filter((l) => l.trim());
      const p = lines[1], s = lines[3];
      const out = [];
      for (let i = 0; i + p.length <= s.length; i++) if (s.slice(i, i + p.length) === p) out.push(i);
      return out.join(" ");
    },
    gen(rng) {
      const alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const randStr = (n, k = 62) => Array.from({ length: n }, () => alpha[randInt(rng, 0, k - 1)]).join("");
      const mk = (p, s) => `${p.length}\n${p}\n${s.length}\n${s}`;
      const cases = [
        { input: mk("a", "a"), category: "boundary", targets: "单字符全匹配", reason: "下标 0" },
        { input: mk("ab", "abab"), category: "boundary", targets: "首尾双现", reason: "0 与 2" },
        { input: mk("aa", "aaaa"), category: "special", targets: "重叠出现", reason: "0 1 2，卡跳过式匹配" },
        { input: mk("aab", "aaab"), category: "special", targets: "失配回退", reason: "前缀函数回跳" },
        { input: mk("a".repeat(1000), "a".repeat(200000)), category: "performance", scale: 20000, targets: "全同字符卡 O(n·m) 朴素", reason: "百万文本重叠爆炸" },
        { input: mk(`${"ab".repeat(400)}c`, `${"ab".repeat(90000)}c${"ab".repeat(99)}`), category: "performance", scale: 20000, targets: "近周期高频失配", reason: "KMP 跳转吞吐" },
        { input: mk("aBc9", `xx${"aBc9".repeat(3)}yaBc9`), category: "adversarial", targets: "大小写与数字混合", reason: "62 字符表" },
      ];
      for (let i = 0; i < 5; i++) {
        const s = randStr(randInt(rng, 8, 100), 3);
        const st = randInt(rng, 0, s.length - 3);
        cases.push({ input: mk(s.slice(st, st + randInt(rng, 1, 3)), s), category: "ordinary", targets: "取自文本的模式", reason: "保证有解并与朴素对拍" });
      }
      return cases;
    },
  },
};
