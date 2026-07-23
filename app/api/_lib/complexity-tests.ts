import { validateEndpoint } from "./validate-endpoint";
import { verifyTests, filterVerifiedTests } from "./verify-tests";
import { AI_TIMEOUT_MS, AI_JSON_REPAIR_MAX_RAW_LENGTH, MAX_EXPANDED_CHARS } from "./constants";

type UpstreamData = { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
type Part = { type?: unknown; value?: unknown; count?: unknown; separator?: unknown; start?: unknown; end?: unknown; step?: unknown; values?: unknown };
type RawTest = {
  input?: unknown; output?: unknown; stdin?: unknown; stdout?: unknown; expected?: unknown; expectedOutput?: unknown; expected_output?: unknown; answer?: unknown;
  input_data?: unknown; output_data?: unknown; in?: unknown; out?: unknown; inputParts?: unknown; outputParts?: unknown;
  category?: unknown; scale?: unknown; targets?: unknown; reason?: unknown;
} & Record<string, unknown>;
type GeneratedTest = { input: string; output: string; category: string; scale: number; targets: string; reason: string };
type ComplexityPlan = { expectedTimeComplexity: string; expectedSpaceComplexity: string; bruteForceToReject: string[]; stressScale: number; stressInputStrategy: string };

function parseJson(content: string): unknown {
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const candidates = extractJsonCandidates(cleaned);
  for (const candidate of candidates) {
    for (const attempt of repairJsonCandidates(candidate)) {
      try { return JSON.parse(attempt); } catch { /* try next repair */ }
    }
  }
  throw new Error("AI 未返回可解析的 JSON");
}

function extractJsonCandidates(text: string) {
  const candidates: string[] = [];
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = text.indexOf(open);
    if (start < 0) continue;
    const end = findMatchingJsonEnd(text, start, open, close);
    if (end > start) candidates.push(text.slice(start, end + 1));
  }
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1));
  return Array.from(new Set(candidates));
}

function findMatchingJsonEnd(text: string, start: number, open: string, close: string) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function repairJsonCandidates(value: string) {
  const normalized = value
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
  const missingCommaFixed = normalized
    .replace(/("(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?|[}\]])\s*\n\s*("[$A-Z_a-z][^"]*"\s*:)/g, "$1,\n$2")
    .replace(/("(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?|[}\]])\s+(?="[$A-Z_a-z][^"]*"\s*:)/g, "$1,");
  const singleQuoteFixed = missingCommaFixed.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, (_, key: string) => `"${key.replace(/"/g, '\\"')}":`);
  return Array.from(new Set([value, normalized, missingCommaFixed, singleQuoteFixed]));
}

function appendWithinLimit(chunks: string[], value: string, size: { value: number }) {
  size.value += value.length;
  if (size.value > MAX_EXPANDED_CHARS) throw new Error("展开后的单个测试点超过 300 KB");
  chunks.push(value);
}

function expandParts(parts: unknown): string {
  if (!Array.isArray(parts)) throw new Error("压缩测试点 parts 必须是数组");
  const chunks: string[] = [];
  const size = { value: 0 };
  for (const raw of parts as Part[]) {
    if (!raw || typeof raw !== "object") throw new Error("测试点 parts 项格式错误");
    const type = String(raw.type || "");
    const separator = typeof raw.separator === "string" ? raw.separator : "";
    if (type === "literal") appendWithinLimit(chunks, String(raw.value ?? ""), size);
    else if (type === "repeat") {
      const count = Math.floor(Number(raw.count));
      if (!Number.isFinite(count) || count < 0 || count > 100_000) throw new Error("repeat count 超出范围");
      const value = String(raw.value ?? "");
      appendWithinLimit(chunks, Array.from({ length: count }, () => value).join(separator), size);
    } else if (type === "cycle") {
      const count = Math.floor(Number(raw.count));
      const values = Array.isArray(raw.values) ? raw.values.map(String) : [];
      if (!values.length || !Number.isFinite(count) || count < 0 || count > 100_000) throw new Error("cycle 参数超出范围");
      appendWithinLimit(chunks, Array.from({ length: count }, (_, index) => values[index % values.length]).join(separator), size);
    } else if (type === "range") {
      const start = Number(raw.start); const end = Number(raw.end); const step = Number(raw.step ?? (end >= start ? 1 : -1));
      if (![start, end, step].every(Number.isFinite) || step === 0) throw new Error("range 参数错误");
      const count = Math.floor((end - start) / step) + 1;
      if (count < 0 || count > 100_000) throw new Error("range 数量超出范围");
      appendWithinLimit(chunks, Array.from({ length: count }, (_, index) => String(start + index * step)).join(separator), size);
    } else throw new Error(`不支持的测试点 parts 类型：${type}`);
  }
  return chunks.join("");
}

function stringifyField(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map((item) => Array.isArray(item) ? item.map(String).join(" ") : String(item)).join("\n");
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["text", "content", "value", "data", "raw", "文本", "内容", "值", "数据"]) {
      const nested = stringifyField(object[key]);
      if (nested.trim()) return nested;
    }
  }
  return "";
}

function normalizeText(value: string) {
  const text = value.includes("\\n") && !value.includes("\n") ? value.replace(/\\n/g, "\n") : value;
  return text.endsWith("\n") ? text : `${text}\n`;
}

function materialize(value: unknown, parts: unknown) {
  const text = parts !== undefined ? expandParts(parts) : stringifyField(value);
  if (!text || text.length > MAX_EXPANDED_CHARS) throw new Error("测试点输入或输出为空/过大");
  return normalizeText(text);
}

function readFirst(test: RawTest, keys: string[]) {
  for (const key of keys) {
    const value = test[key];
    if (value !== undefined && value !== null && stringifyField(value).trim() !== "") return value;
  }
  return undefined;
}

function findTestList(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  const object = parsed as Record<string, unknown>;
  for (const key of ["tests", "testCases", "testcases", "cases", "samples", "data", "测试点", "测试数据", "用例", "样例"]) {
    if (Array.isArray(object[key])) return object[key] as unknown[];
  }
  const objectValues = Object.values(object);
  if (objectValues.length && objectValues.every((value) => value && typeof value === "object" && !Array.isArray(value))) {
    const likelyTests = objectValues.filter((value) => {
      const item = value as Record<string, unknown>;
      return ["input", "stdin", "输入", "输入数据"].some((key) => stringifyField(item[key]).trim()) &&
        ["output", "stdout", "expectedOutput", "expected_output", "expected", "answer", "输出", "标准输出", "预期输出", "答案"].some((key) => stringifyField(item[key]).trim());
    });
    if (likelyTests.length) return likelyTests;
  }
  for (const value of Object.values(object)) {
    const nested = findTestList(value);
    if (nested) return nested;
  }
  return null;
}

// Patterns that indicate truly unfixable AI laziness (no expansion possible)
const UNFIXABLE_PATTERNS = [
  /[（(]?\s*略\s*[)）]?/,    // "(略)" "略"
  /[（(]?\s*同上\s*[)）]?/,   // "(同上)"
  /[（(]?\s*下同\s*[)）]?/,   // "(下同)"
  /以此类推/,                // "以此类推"
  /\bplaceholder\b/i,       // "placeholder"
  /\bTODO\b/,               // "TODO"
  /\bsame as above\b/i,     // "same as above"
  /\betc\.?\b/i,            // "etc" / "etc."
  /重复.*次/,                // "重复N次" without specifying what
];

// Try to expand "..." or "……" patterns into full data.
// Returns expanded text, or null if the pattern cannot be inferred.
function expandEllipsis(text: string): string | null {
  const normalized = text.replace(/\\n/g, "\n");

  // Check for truly unfixable patterns first
  if (UNFIXABLE_PATTERNS.some((p) => p.test(normalized))) return null;

  // No ellipsis — no expansion needed
  if (!/[.…]{2,}/.test(normalized)) return normalized;

  const lines = normalized.split("\n");
  const expanded: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const ellipsisMatch = line.match(/^(.*?)([.…]{2,})(.*)$/);

    if (!ellipsisMatch) {
      // No ellipsis on this line — check if it's a standalone "..." line
      if (/^[.…]{2,}$/.test(line)) {
        // Multi-line ellipsis: lines before and after define a sequence
        const prevLine = i > 0 ? lines[i - 1].trim() : "";
        const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : "";
        const expandedLines = expandMultiLineEllipsis(prevLine, nextLine);
        if (expandedLines === null) return null;
        expanded.push(...expandedLines);
        continue;
      }
      expanded.push(line);
      continue;
    }

    // Inline ellipsis: "1 2 3 ... 99999 100000"
    const before = ellipsisMatch[1].trim();
    const after = ellipsisMatch[3].trim();
    const expandedInline = expandInlineEllipsis(before, after);
    if (expandedInline === null) return null;
    expanded.push(expandedInline);
  }

  return expanded.join("\n");
}

// Expand "1 2 3 ... 99999 100000" type patterns
function expandInlineEllipsis(before: string, after: string): string | null {
  const beforeNums = before.split(/\s+/).filter((s) => /^-?\d+$/.test(s)).map(Number);
  const afterNums = after.split(/\s+/).filter((s) => /^-?\d+$/.test(s)).map(Number);

  if (beforeNums.length === 0 || afterNums.length === 0) return null;

  // Try to detect arithmetic progression from before's tail to after's head
  const lastBefore = beforeNums[beforeNums.length - 1];
  const firstAfter = afterNums[0];

  // Calculate step if we have enough context
  let step = 0;
  if (beforeNums.length >= 2) {
    step = beforeNums[beforeNums.length - 1] - beforeNums[beforeNums.length - 2];
  } else if (afterNums.length >= 2) {
    step = afterNums[1] - afterNums[0];
  } else {
    // Single numbers on both sides — use 1 or -1
    step = firstAfter > lastBefore ? 1 : firstAfter < lastBefore ? -1 : 0;
  }
  if (step === 0) return null;

  // Verify the after sequence starts where we'd expect
  const stepsInBetween = Math.round((firstAfter - lastBefore) / step);
  if (stepsInBetween < 1 || stepsInBetween > MAX_EXPANDED_CHARS / 10) return null;

  // Generate the missing numbers
  const missing: number[] = [];
  for (let j = 1; j < stepsInBetween; j++) {
    missing.push(lastBefore + j * step);
  }

  // Reconstruct the line: replace "..." with the generated numbers
  const beforeTokens = before.split(/\s+/);
  const afterTokens = after.split(/\s+/);

  // Find the numeric suffix of before and prefix of after
  const beforePrefix = beforeTokens.slice(0, beforeTokens.length - beforeNums.length);
  const afterSuffix = afterTokens.slice(afterNums.length);

  return [
    ...beforePrefix,
    ...beforeNums.map(String),
    ...missing.map(String),
    ...afterNums.map(String),
    ...afterSuffix,
  ].filter(Boolean).join(" ");
}

// Expand multi-line patterns like "1\n2\n3\n...\n100000\n"
function expandMultiLineEllipsis(prev: string, next: string): string[] | null {
  const prevNums = prev.trim().split(/\s+/).filter((s) => /^-?\d+$/.test(s)).map(Number);
  const nextNums = next.trim().split(/\s+/).filter((s) => /^-?\d+$/.test(s)).map(Number);

  // Simplest case: single numbers per line
  if (prevNums.length === 1 && nextNums.length === 1) {
    const step = nextNums[0] - prevNums[0];
    const count = Math.abs(nextNums[0] - prevNums[0]);
    if (count < 2 || count > 100000) return null;
    const result: string[] = [];
    for (let v = prevNums[0] + step; v !== nextNums[0]; v += step) {
      result.push(String(v));
    }
    return result;
  }

  // Structured lines: "5 1" ... "5 100000" — first col fixed, second col sequences
  if (prevNums.length === nextNums.length && prevNums.length >= 2) {
    // Check if all columns except last are identical
    let allMatch = true;
    for (let k = 0; k < prevNums.length - 1; k++) {
      if (prevNums[k] !== nextNums[k]) { allMatch = false; break; }
    }
    if (allMatch) {
      const step = nextNums[nextNums.length - 1] - prevNums[prevNums.length - 1];
      const count = Math.abs(nextNums[nextNums.length - 1] - prevNums[prevNums.length - 1]);
      if (count < 2 || count > 100000) return null;
      const prefix = prevNums.slice(0, -1).join(" ");
      const result: string[] = [];
      for (let v = prevNums[prevNums.length - 1] + step; v !== nextNums[nextNums.length - 1]; v += step) {
        result.push(`${prefix} ${v}`);
      }
      return result;
    }
  }

  return null;
}

function isValidTestData(value: string): boolean {
  if (UNFIXABLE_PATTERNS.some((p) => p.test(value))) return false;
  return true;
}

function parseTests(content: string): GeneratedTest[] {
  const parsed = parseJson(content);
  const list = findTestList(parsed);
  if (!Array.isArray(list)) throw new Error("AI 返回的 JSON 缺少 tests 数组");
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const test = item as RawTest;
    const input = readFirst(test, ["input", "stdin", "input_data", "in", "输入", "输入数据", "标准输入", "测试输入", "样例输入"]);
    const output = readFirst(test, ["output", "stdout", "expectedOutput", "expected_output", "expected", "answer", "output_data", "out", "输出", "输出数据", "标准输出", "预期输出", "期望输出", "答案", "样例输出"]);
    try {
      let materializedInput = materialize(input, test.inputParts);
      let materializedOutput = materialize(output, test.outputParts);

      // Validate truly unfixable patterns
      if (!isValidTestData(materializedInput) || !isValidTestData(materializedOutput)) {
        return [];
      }

      // Try to expand ellipsis patterns into full data
      const expandedInput = expandEllipsis(materializedInput);
      const expandedOutput = expandEllipsis(materializedOutput);
      if (expandedInput === null || expandedOutput === null) {
        return []; // Cannot infer the pattern — reject
      }

      return [{
        input: expandedInput,
        output: expandedOutput,
        category: String(test.category || "ordinary").toLowerCase(),
        scale: Math.max(1, Math.floor(Number(test.scale) || 1)),
        targets: String(test.targets || ""),
        reason: String(test.reason || ""),
      }];
    } catch { return []; }
  });
}

function buildProblemText(problem: Record<string, unknown>) {
  return `题号：${String(problem.id || "")}
标题：${String(problem.title || "")}
时间限制：${String(problem.time || "未知")}
内存限制：${String(problem.memory || "未知")}
题目描述：
${String(problem.description || "")}

输入格式：
${String(problem.inputFormat || "")}

输出格式：
${String(problem.outputFormat || "")}`;
}

function makePlan(parsed: unknown): ComplexityPlan {
  const planRaw = (parsed && typeof parsed === "object" ? (parsed as { analysis?: Partial<ComplexityPlan> }).analysis : {}) || {};
  return {
    expectedTimeComplexity: String(planRaw.expectedTimeComplexity || "未明确"),
    expectedSpaceComplexity: String(planRaw.expectedSpaceComplexity || "未明确"),
    bruteForceToReject: Array.isArray(planRaw.bruteForceToReject) ? planRaw.bruteForceToReject.map(String).filter(Boolean).slice(0, 6) : [],
    stressScale: Math.max(1, Math.floor(Number(planRaw.stressScale) || 1)),
    stressInputStrategy: String(planRaw.stressInputStrategy || "在题面约束内取较大规模"),
  };
}

function buildStrictPrompt(options: { target: number; requiredPerformance: number; requiredAdversarial: number; schema: string }) {
  const { target, requiredPerformance, requiredAdversarial, schema } = options;
  // Optimized prompt: concise, token-efficient, with strict JSON output constraints
  return `你是 OJ 测试数据生成器。只输出一个 JSON 对象，无 Markdown/代码块/解释。

结构要求：顶层的 analysis 和 tests。tests 数组长度=${target}。键名必须英文(input/output/category/scale/targets/reason)。

输出格式：
${schema}

硬性规则：
- input/output 必须是 UTF-8 字符串，不能为空、不能写”略/待计算/unknown”
- 字符串内换行用 \\n，禁止字符串内物理换行
- category: 至少${requiredPerformance}个performance、${requiredAdversarial}个adversarial，其余boundary/special/ordinary
- input/output 必须是完整的可执行字符串
- 大规模数据（>50行或>200个值）可用"..."表达等差/等间隔序列（如"1 2 3 ... 99999 100000"），系统会自动展开。但禁止"略""同上""以此类推"等非数值省略
- 严禁重复已有测试点
- 只输出纯 JSON，无前后缀`;
}

export async function generateComplexityAwareTests(options: { apiKey: string; endpoint: string; model: string; problem: Record<string, unknown>; count: number; referenceSolution?: string }) {
  const { apiKey, endpoint, model, problem } = options;
  const referenceSolution = options.referenceSolution || "";
  const target = Math.max(1, Math.min(24, Math.floor(options.count)));
  const chatUrl = validateEndpoint(endpoint);
  const isDeepSeek = /(^|\.)api\.deepseek\.com$/i.test(chatUrl.hostname);

  async function callAi(messages: { role: string; content: string }[], maxTokens: number, temperature = 0.1) {
    const deadline = Date.now() + AI_TIMEOUT_MS;
    async function send(jsonMode: boolean) {
      const body: Record<string, unknown> = { model, temperature, max_tokens: maxTokens, stream: false, messages };
      if (jsonMode) body.response_format = { type: "json_object" };
      if (isDeepSeek) body.thinking = { type: "disabled" };
      const remaining = Math.max(1_000, deadline - Date.now());
      return fetch(chatUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(remaining) });
    }
    let response = await send(true);
    if (!response.ok && (response.status === 400 || response.status === 422)) response = await send(false);
    const text = await response.text();
    let data: UpstreamData;
    try { data = JSON.parse(text) as UpstreamData; } catch { throw new Error(`AI 服务返回异常（HTTP ${response.status}）`); }
    if (!response.ok) throw new Error(data.error?.message || `上游 AI 服务请求失败（HTTP ${response.status}）`);
    return data.choices?.[0]?.message?.content || "";
  }

  const requiredPerformance = target >= 6 ? Math.max(1, Math.ceil(target / 8)) : 0;
  const requiredAdversarial = target >= 6 ? Math.max(1, Math.ceil(target / 8)) : 0;
  const existingInputs = Array.isArray(problem.samples) ? problem.samples : [];
  const compactExisting = (items: unknown[]) => items.slice(-18).map((raw) => {
    const item = raw as { input?: unknown; output?: unknown };
    return { input: String(item.input || "").slice(0, 180), output: String(item.output || "").slice(0, 100) };
  });

  const schema = `{
  "analysis": {
    "expectedTimeComplexity": "例如 O(n log n)",
    "expectedSpaceComplexity": "例如 O(n)",
    "bruteForceToReject": ["会被压力点卡掉的错误/暴力算法"],
    "stressScale": 100000,
    "stressInputStrategy": "压力数据构造策略"
  },
  "tests": [
    {
      "input": "完整输入文本，必须可直接运行",
      "output": "正确输出文本",
      "category": "boundary|special|ordinary|adversarial|performance",
      "scale": 1,
      "targets": "针对什么错误算法或边界遗漏",
      "reason": "为什么这个测试点必要"
    }
  ]
}`;

  const systemPrompt = buildStrictPrompt({ target, requiredPerformance, requiredAdversarial, schema });

  const userPrompt = `${buildProblemText(problem)}

已有测试点摘要（不要重复）：
${JSON.stringify(compactExisting(existingInputs), null, 2)}`;
  const generationContext = typeof problem.generationContext === "string" && problem.generationContext.trim()
    ? `\n\n分批生成上下文（必须遵守）：\n${problem.generationContext.trim()}`
    : "";

  let content = await callAi([
    { role: "system", content: systemPrompt },
    { role: "user", content: `${userPrompt}${generationContext}` },
  ], Math.max(3000, target * 280), 0.08);

  let parsed: unknown;
  let candidates: GeneratedTest[];
  try {
    parsed = parseJson(content);
    candidates = parseTests(content);
    if (!candidates.length) throw new Error("empty-tests");
  } catch {
    const repairPrompt = `上次返回没有产生有效测试点。请重新生成${target}个。必须英文键名，只输出JSON。
题面：${buildProblemText(problem).split("\n").slice(0, 12).join("\n")}
已有(勿重复)：${JSON.stringify(compactExisting(existingInputs))}${generationContext}
上次错误输出参考：${content.slice(0, AI_JSON_REPAIR_MAX_RAW_LENGTH)}`;
    content = await callAi([{ role: "user", content: repairPrompt }], Math.max(4200, target * 300), 0.03);
    parsed = parseJson(content);
    candidates = parseTests(content);
  }

  const plan = makePlan(parsed);
  const minimumStressScale = Math.max(2, Math.floor(plan.stressScale * 0.7));

  function qualifiesPerformance(test: GeneratedTest) {
    const compactLength = test.input.replace(/\s/g, "").length;
    const scaleIsPresent = test.input.includes(String(test.scale)) || compactLength >= test.scale;
    return test.category === "performance" && test.scale >= minimumStressScale && scaleIsPresent && test.targets.trim().length >= 4;
  }
  function qualifiesAdversarial(test: GeneratedTest) {
    return test.category === "adversarial" && test.targets.trim().length >= 4 && test.reason.trim().length >= 4;
  }

  const fingerprints = new Set<string>((existingInputs as { input?: unknown; output?: unknown }[]).map((test) => `${String(test.input || "")}\u0000${String(test.output || "")}`));
  const unique: GeneratedTest[] = [];
  function addUniqueTests(tests: GeneratedTest[]) {
    for (const test of tests) {
      const key = `${test.input}\u0000${test.output}`;
      if (!fingerprints.has(key)) {
        fingerprints.add(key);
        unique.push(test);
        if (unique.length >= target) break;
      }
    }
  }
  addUniqueTests(candidates);

  if (unique.length < target) {
    const missing = target - unique.length;
    const refillPrompt = `补足${missing}个新测试点。只输出JSON。禁止重复这些：${JSON.stringify(compactExisting([...existingInputs, ...unique]))}
题面：${buildProblemText(problem).split("\n").slice(0, 12).join("\n")}${generationContext}`;
    try {
      const refillContent = await callAi([{ role: "user", content: refillPrompt }], Math.max(2200, missing * 360), 0.04);
      addUniqueTests(parseTests(refillContent));
    } catch {
      /* keep the usable tests already generated; the caller may continue with another batch */
    }
  }

  if (!unique.length) {
    throw new Error(`AI 没有生成可用测试点：收到的返回中没有同时包含 input 和 output 的测试点。请确认题面有完整输入输出格式，或换用更强模型后重试。`);
  }

  const performance = unique.filter(qualifiesPerformance);
  const adversarial = unique.filter(qualifiesAdversarial);
  const selected: GeneratedTest[] = [];
  const selectedKeys = new Set<string>();
  function select(items: GeneratedTest[], limit: number) {
    for (const test of items) {
      if (selected.length >= target || limit <= 0) break;
      const key = `${test.input}\u0000${test.output}`;
      if (!selectedKeys.has(key)) { selectedKeys.add(key); selected.push(test); limit -= 1; }
    }
  }
  select(performance, requiredPerformance);
  select(adversarial, requiredAdversarial);
  select(unique, target);

  const finalSelected = selected.slice(0, target).map(({ input, output, category, scale, targets, reason }) => ({ input, output, category, scale, targets, reason }));

  // Judge0-based verification when a reference solution is provided
  let verifiedCount = 0;
  if (referenceSolution.trim()) {
    try {
      const verified = await verifyTests(finalSelected, referenceSolution);
      const good = filterVerifiedTests(verified);
      verifiedCount = good.length;
      if (good.length > 0) {
        // Replace with verified tests only; fall back to unverified if none pass
        const performanceAfter = good.filter(qualifiesPerformance).length;
        const adversarialAfter = good.filter(qualifiesAdversarial).length;
        const partialAfter = good.length < target || performanceAfter < requiredPerformance || adversarialAfter < requiredAdversarial;
        return {
          tests: good,
          report: {
            expectedTimeComplexity: plan.expectedTimeComplexity,
            expectedSpaceComplexity: plan.expectedSpaceComplexity,
            stressScale: plan.stressScale,
            performanceCount: performanceAfter,
            adversarialCount: adversarialAfter,
            requestedCount: target,
            generatedCount: good.length,
            partial: partialAfter,
            verifiedCount: good.length,
            totalVerified: verified.length,
          },
        };
      }
    } catch {
      // Verification failed (e.g. Judge0 down) — return tests unverified, this is OK
    }
  }

  return {
    tests: finalSelected,
    report: {
      expectedTimeComplexity: plan.expectedTimeComplexity,
      expectedSpaceComplexity: plan.expectedSpaceComplexity,
      stressScale: plan.stressScale,
      performanceCount: selected.filter(qualifiesPerformance).length,
      adversarialCount: selected.filter(qualifiesAdversarial).length,
      requestedCount: target,
      generatedCount: finalSelected.length,
      partial: finalSelected.length < target || performance.length < requiredPerformance || adversarial.length < requiredAdversarial,
      verifiedCount,
    },
  };
}
