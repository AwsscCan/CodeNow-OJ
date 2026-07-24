// Input generator registry: AI returns generator specs, system expands to real input

import { MAX_EXPANDED_CHARS } from "./constants";

export interface GeneratorSpec {
  type: string;
  params: Record<string, unknown>;
}

interface GeneratorContext {
  maxN: number;
  maxValue: number;
  constraints: string; // free-form constraint text from problem
}

interface TestGenerator {
  type: string;
  description: string;
  validateParams(params: unknown, ctx: GeneratorContext): string | null; // null = valid
  generate(params: Record<string, unknown>, ctx: GeneratorContext): string;
}

// ── Registry ──

const registry = new Map<string, TestGenerator>();

function register(g: TestGenerator) { registry.set(g.type, g); }

// ── Utility ──

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ── Array Generators ──

register({
  type: "constant_array",
  description: "Array of identical values",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n); const v = Number((p as any)?.value);
    if (!Number.isFinite(n) || n < 1 || n > ctx.maxN) return `n must be 1..${ctx.maxN}`;
    if (!Number.isFinite(v)) return "value required";
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 1, ctx.maxN);
    const v = Number(p.value);
    return `${n}\n${Array(n).fill(v).join(" ")}\n`;
  },
});

register({
  type: "increasing_array",
  description: "Strictly increasing sequence",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n);
    if (!Number.isFinite(n) || n < 1 || n > ctx.maxN) return `n must be 1..${ctx.maxN}`;
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 1, ctx.maxN);
    const step = clamp(Number(p.step) || 1, 1, 1000);
    const start = clamp(Number(p.start) || 1, -1e9, 1e9);
    return `${n}\n${Array.from({ length: n }, (_, i) => start + i * step).join(" ")}\n`;
  },
});

register({
  type: "decreasing_array",
  description: "Strictly decreasing sequence",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n);
    if (!Number.isFinite(n) || n < 1 || n > ctx.maxN) return `n must be 1..${ctx.maxN}`;
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 1, ctx.maxN);
    const start = clamp(Number(p.start) || n, 1, 1e9);
    const step = clamp(Number(p.step) || 1, 1, 1000);
    return `${n}\n${Array.from({ length: n }, (_, i) => start - i * step).join(" ")}\n`;
  },
});

register({
  type: "random_array",
  description: "Random array within range",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n);
    if (!Number.isFinite(n) || n < 1 || n > ctx.maxN) return `n must be 1..${ctx.maxN}`;
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 1, ctx.maxN);
    const lo = clamp(Number(p.lo) || 0, -1e9, 1e9);
    const hi = clamp(Number(p.hi) || 1e5, lo, 1e9);
    const seed = (Number(p.seed) || 42) | 0;
    const rand = seededRandom(seed);
    return `${n}\n${Array.from({ length: n }, () => Math.floor(lo + rand() * (hi - lo + 1))).join(" ")}\n`;
  },
});

register({
  type: "permutation",
  description: "Random permutation of 1..n",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n);
    if (!Number.isFinite(n) || n < 1 || n > ctx.maxN) return `n must be 1..${ctx.maxN}`;
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 1, ctx.maxN);
    const seed = (Number(p.seed) || 137) | 0;
    const rand = seededRandom(seed);
    const arr = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return `${n}\n${arr.join(" ")}\n`;
  },
});

register({
  type: "many_duplicates",
  description: "Array with many duplicate values",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n);
    if (!Number.isFinite(n) || n < 1 || n > ctx.maxN) return `n must be 1..${ctx.maxN}`;
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 1, ctx.maxN);
    const distinct = clamp(Number(p.distinct) || 5, 1, 10);
    const seed = (Number(p.seed) || 99) | 0;
    const rand = seededRandom(seed);
    const values = Array.from({ length: distinct }, () => Math.floor(rand() * 1e5));
    return `${n}\n${Array.from({ length: n }, () => values[Math.floor(rand() * distinct)]).join(" ")}\n`;
  },
});

// ── Tree Generators ──

register({
  type: "path_tree",
  description: "Linear tree 1-2-3-...-n",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n);
    if (!Number.isFinite(n) || n < 2 || n > ctx.maxN) return `n must be 2..${ctx.maxN}`;
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 2, ctx.maxN);
    let out = `${n}\n`;
    for (let i = 1; i < n; i++) out += `${i} ${i + 1}\n`;
    return out;
  },
});

register({
  type: "star_tree",
  description: "Star tree with center node 1",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n);
    if (!Number.isFinite(n) || n < 2 || n > ctx.maxN) return `n must be 2..${ctx.maxN}`;
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 2, ctx.maxN);
    let out = `${n}\n`;
    for (let i = 2; i <= n; i++) out += `1 ${i}\n`;
    return out;
  },
});

register({
  type: "random_tree",
  description: "Random labeled tree",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n);
    if (!Number.isFinite(n) || n < 2 || n > ctx.maxN) return `n must be 2..${ctx.maxN}`;
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 2, ctx.maxN);
    const seed = (Number(p.seed) || 42) | 0;
    const rand = seededRandom(seed);
    let out = `${n}\n`;
    for (let i = 2; i <= n; i++) {
      const parent = Math.floor(rand() * (i - 1)) + 1;
      out += `${parent} ${i}\n`;
    }
    return out;
  },
});

// ── Graph Generators ──

register({
  type: "complete_graph",
  description: "Complete undirected graph",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n);
    if (!Number.isFinite(n) || n < 2 || n > ctx.maxN) return `n must be 2..${ctx.maxN}`;
    const maxEdges = n * (n - 1) / 2;
    if (maxEdges * 10 > MAX_EXPANDED_CHARS) return "graph too large";
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 2, ctx.maxN);
    let out = `${n} ${n * (n - 1) / 2}\n`;
    for (let i = 1; i <= n; i++) for (let j = i + 1; j <= n; j++) out += `${i} ${j}\n`;
    return out;
  },
});

// ── String Generators ──

register({
  type: "repeated_char",
  description: "String of repeated character",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n);
    if (!Number.isFinite(n) || n < 1 || n > ctx.maxN) return `n must be 1..${ctx.maxN}`;
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 1, ctx.maxN);
    const ch = String(p.char || "a")[0];
    return `${n}\n${ch.repeat(n)}\n`;
  },
});

register({
  type: "palindrome_string",
  description: "Palindrome string",
  validateParams(p, ctx) {
    const n = Number((p as any)?.n);
    if (!Number.isFinite(n) || n < 1 || n > ctx.maxN) return `n must be 1..${ctx.maxN}`;
    return null;
  },
  generate(p, ctx) {
    const n = clamp(Number(p.n), 1, ctx.maxN);
    const seed = (Number(p.seed) || 7) | 0; const rand = seededRandom(seed);
    const half = Math.floor(n / 2);
    const chars = "abcdefghijklmnopqrstuvwxyz";
    const r: string[] = [];
    for (let i = 0; i < half; i++) r.push(chars[Math.floor(rand() * 26)]);
    const rev = [...r].reverse();
    return `${n}\n${n % 2 ? [...r, chars[Math.floor(rand() * 26)], ...rev] : [...r, ...rev]}\n`.replace(/,/g, "");
  },
});

// ── API ──

export function listGeneratorTypes(): string[] {
  return Array.from(registry.keys());
}

export function getGenerator(type: string): TestGenerator | null {
  return registry.get(type) || null;
}

export function expandGenerator(spec: GeneratorSpec, ctx: GeneratorContext): string {
  const gen = registry.get(spec.type);
  if (!gen) throw new Error(`不支持的生成器类型: ${spec.type}`);
  const err = gen.validateParams(spec.params, ctx);
  if (err) throw new Error(`生成器参数错误(${spec.type}): ${err}`);
  const result = gen.generate(spec.params, ctx);
  if (result.length > MAX_EXPANDED_CHARS) throw new Error("生成结果超过大小限制");
  return result;
}

export function validateInput(input: string, maxLength: number): string | null {
  if (!input.trim()) return "输入不能为空";
  if (input.length > maxLength) return `输入超过 ${maxLength / 1000}KB 限制`;
  if (input.includes("\0")) return "输入包含 NUL 字符";
  // Check for common placeholder patterns
  if (/[（(]?\s*略\s*[)）]?/.test(input)) return "输入包含占位符";
  if (/[.…]{3,}/.test(input) && !/^\d+( \d+)* [.…]{3,} \d+( \d+)*$/.test(input.trim().split("\n")[0] || "")) return "输入包含未展开的省略号";
  return null;
}
