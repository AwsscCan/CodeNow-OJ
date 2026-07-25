import { validateEndpoint } from "./validate-endpoint";
import { AI_TIMEOUT_MS, AI_JSON_REPAIR_MAX_RAW_LENGTH, MAX_EXPANDED_CHARS } from "./constants";
import { judge0Submit, type ValidatedReference } from "./reference-solution";
import { expandGenerator, validateInput, listGeneratorTypes } from "./generator-registry";

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
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
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

function pickField(object: Record<string, unknown>, keys: string[]) {
  const lowerMap = new Map(Object.keys(object).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const exact = object[key];
    if (exact !== undefined && exact !== null && stringifyField(exact).trim() !== "") return exact;
    const found = lowerMap.get(key.toLowerCase());
    if (found) {
      const value = object[found];
      if (value !== undefined && value !== null && stringifyField(value).trim() !== "") return value;
    }
  }
  return undefined;
}

function testFromObject(item: Record<string, unknown>, maxInputLength: number): GeneratedTest | null {
  const category = String(pickField(item, ["category", "type", "tag", "label", "kind", "??", "??", "??"]) || "ordinary").toLowerCase();
  const scale = Math.max(1, Math.floor(Number(pickField(item, ["scale", "size", "n", "??"])) || 1));
  const targets = String(pickField(item, ["targets", "target", "checks", "purpose", "??", "????"]) || "AI generated case");
  const reason = String(pickField(item, ["reason", "why", "description", "note", "??", "??"]) || "Generated from problem constraints");

  try {
    if (item.generator && typeof item.generator === "object") {
      const gen = item.generator as { type?: unknown; params?: unknown };
      const input = expandGenerator(
        { type: String(gen.type || ""), params: (gen.params || {}) as Record<string, unknown> },
        { maxN: 300000, maxValue: 1e9, constraints: "standard" },
      );
      if (validateInput(input, maxInputLength)) return null;
      return { input, output: "", category, scale, targets, reason };
    }

    const rawInput = pickField(item, ["input", "stdin", "input_data", "inputData", "in", "caseInput", "??", "????"]);
    if (rawInput === undefined) return null;
    const materializedInput = materialize(rawInput, item.inputParts);
    if (!materializedInput.trim() || !isValidTestData(materializedInput)) return null;
    const expandedInput = expandEllipsis(materializedInput);
    if (expandedInput === null || expandedInput.length > maxInputLength || validateInput(expandedInput, maxInputLength)) return null;

    const rawOutput = pickField(item, [
      "output", "stdout", "expected", "expectedOutput", "expected_output", "answer",
      "output_data", "outputData", "out", "caseOutput", "??", "????", "??", "????",
    ]);
    let output = "";
    if (rawOutput !== undefined || item.outputParts !== undefined) {
      try { output = materialize(rawOutput, item.outputParts); } catch { output = ""; }
    }

    return { input: expandedInput, output, category, scale, targets, reason };
  } catch { return null; }
}

function parseStructuredTests(content: string, maxInputLength: number): GeneratedTest[] {
  const parsed = parseJson(content);
  const list = findTestList(parsed);
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const test = testFromObject(item as Record<string, unknown>, maxInputLength);
    return test ? [test] : [];
  });
}

function parseLooseTextTests(content: string, maxInputLength: number): GeneratedTest[] {
  const cleaned = content.replace(/```(?:json|text|txt)?/gi, "```").replace(/```/g, "").trim();
  if (!cleaned) return [];

  const blocks = cleaned
    .split(/(?:^|\n)\s*(?:#{1,4}\s*)?(?:test\s*case|case|sample|???|??|??)\s*\d*\s*[:?-]?\s*\n/gi)
    .map((block) => block.trim())
    .filter(Boolean);
  const sourceBlocks = blocks.length > 1 ? blocks : [cleaned];

  const tests: GeneratedTest[] = [];
  for (const block of sourceBlocks) {
    const inputMatch = block.match(/(?:input|stdin|??|????)\s*[:?]\s*([\s\S]*?)(?=\n\s*(?:output|stdout|expected|answer|??|????|??)\s*[:?]|$)/i);
    const outputMatch = block.match(/(?:output|stdout|expected\s*output|expected|answer|??|????|??)\s*[:?]\s*([\s\S]*?)(?=\n\s*(?:category|type|reason|target|??|??|??|??)\s*[:?]|$)/i);
    if (!inputMatch) continue;
    const input = normalizeText(inputMatch[1].trim());
    if (!input.trim() || input.length > maxInputLength || validateInput(input, maxInputLength)) continue;
    tests.push({
      input,
      output: outputMatch ? normalizeText(outputMatch[1].trim()) : "",
      category: /performance|large|??|??|??/i.test(block) ? "performance" : /adversarial|hack|??|?/i.test(block) ? "adversarial" : "ordinary",
      scale: 1,
      targets: "AI generated loose text case",
      reason: "Recovered from non-standard AI response",
    });
  }

  return tests;
}

function parseTests(content: string, maxInputLength = MAX_EXPANDED_CHARS): GeneratedTest[] {
  const structured = (() => { try { return parseStructuredTests(content, maxInputLength); } catch { return []; } })();
  if (structured.length) return structured;
  return parseLooseTextTests(content, maxInputLength);
}

function buildProblemDigest(problem: Record<string, unknown>) {
  const id = String(problem.id || "");
  const title = String(problem.title || "");
  const timeLimit = String(problem.time || "unknown");
  const memoryLimit = String(problem.memory || "unknown");
  const description = String(problem.description || "");
  const inputFormat = String(problem.inputFormat || "");
  const outputFormat = String(problem.outputFormat || "");
  return [
    `Problem ID: ${id}`,
    `Title: ${title}`,
    `Time limit: ${timeLimit}`,
    `Memory limit: ${memoryLimit}`,
    "",
    `Statement:\n${description}`,
    "",
    `Input format:\n${inputFormat}`,
    "",
    `Output format:\n${outputFormat}`,
  ].join("\n");
}

function makePlan(parsed: unknown): ComplexityPlan {
  const planRaw = (parsed && typeof parsed === "object" ? (parsed as { analysis?: Partial<ComplexityPlan> }).analysis : {}) || {};
  return {
    expectedTimeComplexity: String(planRaw.expectedTimeComplexity || "unknown"),
    expectedSpaceComplexity: String(planRaw.expectedSpaceComplexity || "unknown"),
    bruteForceToReject: Array.isArray(planRaw.bruteForceToReject) ? planRaw.bruteForceToReject.map(String).filter(Boolean).slice(0, 6) : [],
    stressScale: Math.max(1, Math.floor(Number(planRaw.stressScale) || 1)),
    stressInputStrategy: String(planRaw.stressInputStrategy || "use large valid cases within the constraints"),
  };
}

function buildStrictPrompt(options: {
  target: number;
  requiredPerformance: number;
  requiredAdversarial: number;
  problemDigest: string;
  existingTestsJson: string;
  generationContext: string;
  algorithmSummary: string;
  hasReferenceSolution: boolean;
}) {
  const {
    target, requiredPerformance, requiredAdversarial,
    problemDigest, existingTestsJson, generationContext,
    algorithmSummary, hasReferenceSolution,
  } = options;
  const ctxLine = generationContext ? `\nBatch context: ${generationContext}` : "";
  const generatorList = listGeneratorTypes().join(", ");
  const outputRule = hasReferenceSolution
    ? "A validated reference solution is available. You may omit output for raw input tests; the system will compute it. Generator specs are allowed for large cases."
    : "No validated reference solution is available. Every test MUST include both input and output. Do NOT use generator specs, because the system cannot compute their output.";
  const schema = hasReferenceSolution
    ? `{"analysis":{"expectedTimeComplexity":"","expectedSpaceComplexity":"","bruteForceToReject":[],"stressScale":1,"stressInputStrategy":""},"tests":[{"input":"complete stdin text","category":"boundary","scale":1,"targets":"what this case checks","reason":"why it is needed"},{"generator":{"type":"random_array","params":{}},"category":"performance","scale":100000,"targets":"large valid case","reason":"why it is needed"}]}`
    : `{"analysis":{"expectedTimeComplexity":"","expectedSpaceComplexity":"","bruteForceToReject":[],"stressScale":1,"stressInputStrategy":""},"tests":[{"input":"complete stdin text","output":"complete expected stdout text","category":"boundary","scale":1,"targets":"what this case checks","reason":"why it is needed"}]}`;

  return [
    "You are designing real online-judge test cases for a C++ programming problem.",
    "Return ONLY one valid JSON object. Do not use markdown. Do not add comments.",
    "",
    `Problem:\n${problemDigest}`,
    "",
    `Reference/expected algorithm summary: ${algorithmSummary}`,
    `Existing samples/tests to avoid duplicating: ${existingTestsJson}${ctxLine}`,
    "",
    `Required JSON schema:\n${schema}`,
    "",
    "Rules:",
    `- Generate exactly ${target} tests.`,
    `- Include at least ${requiredPerformance} performance tests and at least ${requiredAdversarial} adversarial tests when those numbers are positive.`,
    "- Use categories only from: boundary, special, ordinary, adversarial, performance.",
    "- Each input must be a complete stdin text matching the statement exactly.",
    "- Each output, when required, must be the exact expected stdout text.",
    "- Cover edge cases, minimum values, maximum values, duplicate values, sorted/reversed order, special graph/tree/string structures when relevant, and cases that reject naive brute force under the stated time limit.",
    "- Avoid duplicate inputs. Avoid placeholders such as same as above, TODO, unknown, omitted, ellipsis, or explanations inside input/output.",
    `- ${outputRule}`,
    hasReferenceSolution ? `- Available generator types: ${generatorList}` : "- Do not use generator in this mode.",
  ].join("\n");
}

export async function generateComplexityAwareTests(options: { apiKey: string; endpoint: string; model: string; problem: Record<string, unknown>; count: number; referenceSolution?: string; validatedRef?: ValidatedReference }) {
  const { apiKey, endpoint, model, problem } = options;
  const referenceSolution = options.referenceSolution || options.validatedRef?.solutionCode || "";
  const validatedRef = options.validatedRef;
  const hasReference = referenceSolution.trim().length > 0;
  const target = Math.max(1, Math.min(24, Math.floor(options.count || 6)));
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
    try { data = JSON.parse(text) as UpstreamData; } catch { throw new Error(`AI service returned invalid JSON envelope (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(data.error?.message || `Upstream AI request failed (HTTP ${response.status}).`);
    return data.choices?.[0]?.message?.content || "";
  }

  const requiredPerformance = target >= 6 ? Math.max(1, Math.ceil(target / 8)) : 0;
  const requiredAdversarial = target >= 6 ? Math.max(1, Math.ceil(target / 8)) : 0;
  const existingInputs = Array.isArray(problem.samples) ? problem.samples : [];
  const compactExisting = (items: unknown[]) => items.slice(-24).map((raw) => {
    const item = raw as { input?: unknown; output?: unknown; category?: unknown };
    return { input: String(item.input || "").slice(0, 240), output: String(item.output || "").slice(0, 160), category: String(item.category || "") };
  });

  const problemDigest = buildProblemDigest(problem);
  const genCtx = typeof problem.generationContext === "string" && problem.generationContext.trim() ? problem.generationContext.trim() : "";
  const existingJson = JSON.stringify(compactExisting(existingInputs));

  const primaryPrompt = buildStrictPrompt({
    target,
    requiredPerformance,
    requiredAdversarial,
    problemDigest,
    existingTestsJson: existingJson,
    generationContext: genCtx,
    algorithmSummary: validatedRef?.algorithmSummary || "infer the intended accepted algorithm from the statement",
    hasReferenceSolution: false,
  });

  async function safeGenerate(prompt: string, countHint: number, temperature: number) {
    const content = await callAi([
      { role: "system", content: prompt },
      { role: "user", content: "Generate tests now. Prefer JSON, but make sure every case has clear Input and Output sections." },
    ], Math.max(4200, countHint * 560), temperature);
    const tests = parseTests(content);
    const parsed = (() => { try { return parseJson(content); } catch { return { analysis: {} }; } })();
    return { parsed, tests, raw: content };
  }

  let parsed: unknown = { analysis: {} };
  let candidates: GeneratedTest[] = [];
  let lastRaw = "";
  const warnings: string[] = [];

  try {
    const result = await safeGenerate(primaryPrompt, target, 0.08);
    parsed = result.parsed;
    candidates = result.tests;
    lastRaw = result.raw;
  } catch (error) {
    warnings.push(`primary generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const withOutputCount = () => candidates.filter((test) => test.input.trim() && test.output.trim()).length;
  if (candidates.length < Math.min(target, 3) || withOutputCount() === 0) {
    const repairPrompt = [
      "The previous response was not usable enough.",
      "Return ONLY one JSON object with a tests array.",
      "Every test MUST contain exact input and exact output. Do not use generators. Do not omit output.",
      `Need ${target} tests. Categories: boundary, special, ordinary, adversarial, performance.`,
      `Problem:\n${problemDigest}`,
      `Existing tests to avoid duplicating: ${existingJson}`,
      genCtx ? `Batch context: ${genCtx}` : "",
      lastRaw ? `Previous bad response excerpt:\n${lastRaw.slice(0, 1800)}` : "",
    ].filter(Boolean).join("\n\n");
    try {
      const content = await callAi([{ role: "user", content: repairPrompt }], Math.max(4200, target * 620), 0.03);
      const repaired = parseTests(content);
      parsed = (() => { try { return parseJson(content); } catch { return parsed; } })();
      candidates = [...candidates, ...repaired];
    } catch (error) {
      warnings.push(`repair generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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

  const fingerprints = new Set<string>((existingInputs as { input?: unknown }[]).map((test) => String(test.input || "").trim()));
  const unique: GeneratedTest[] = [];
  for (const test of candidates) {
    const inputKey = test.input.trim();
    if (!inputKey || fingerprints.has(inputKey)) continue;
    fingerprints.add(inputKey);
    unique.push({
      input: test.input,
      output: test.output,
      category: ["boundary", "special", "ordinary", "adversarial", "performance"].includes(test.category) ? test.category : "ordinary",
      scale: Math.max(1, Math.floor(Number(test.scale) || 1)),
      targets: test.targets || "AI generated case",
      reason: test.reason || "Generated from problem constraints",
    });
    if (unique.length >= target) break;
  }

  if (!unique.length) {
    throw new Error("AI did not return any parseable test input. Please check whether the problem statement contains clear input/output formats, or try a stronger model.");
  }

  const selected: GeneratedTest[] = [];
  const seen = new Set<string>();
  function select(items: GeneratedTest[], limit: number) {
    for (const test of items) {
      if (selected.length >= target || limit <= 0) break;
      const key = test.input.trim();
      if (!seen.has(key)) { seen.add(key); selected.push(test); limit -= 1; }
    }
  }
  select(unique.filter(qualifiesPerformance), requiredPerformance);
  select(unique.filter(qualifiesAdversarial), requiredAdversarial);
  select(unique, target);

  let computedCount = 0;
  if (hasReference) {
    try {
      const langId = await getCppLangId();
      const withOutputs = await Promise.all(selected.map(async (test) => {
        if (test.output.trim()) return test;
        try {
          const result = await judge0Submit(referenceSolution, test.input, langId);
          const output = result.stdout.trim();
          if (output) computedCount += 1;
          return output ? { ...test, output } : test;
        } catch { return test; }
      }));
      selected.splice(0, selected.length, ...withOutputs);
    } catch (error) {
      warnings.push(`reference output computation skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const missingOutputIndexes = selected.map((test, index) => test.output.trim() ? -1 : index).filter((index) => index >= 0);
  if (missingOutputIndexes.length) {
    const fillPrompt = [
      "Fill expected outputs for these online-judge inputs.",
      "Return ONLY JSON: {\"outputs\":[\"output for case 1\",\"output for case 2\"]}",
      "The number and order of outputs must match the inputs exactly. Preserve line breaks. Do not explain.",
      `Problem:\n${problemDigest}`,
      `Inputs:\n${JSON.stringify(missingOutputIndexes.map((index) => ({ index: index + 1, input: selected[index].input })))}`,
    ].join("\n\n");
    try {
      const fillContent = await callAi([{ role: "user", content: fillPrompt }], Math.max(2200, missingOutputIndexes.length * 420), 0.02);
      const filled = parseJson(fillContent) as { outputs?: unknown[]; tests?: Array<{ output?: unknown; stdout?: unknown; expected?: unknown }> };
      const outputs = Array.isArray(filled.outputs)
        ? filled.outputs.map((value) => normalizeText(stringifyField(value)))
        : Array.isArray(filled.tests)
          ? filled.tests.map((value) => normalizeText(stringifyField(value.output ?? value.stdout ?? value.expected)))
          : [];
      missingOutputIndexes.forEach((testIndex, outIndex) => {
        const output = outputs[outIndex] || "";
        if (output.trim()) selected[testIndex] = { ...selected[testIndex], output };
      });
    } catch (error) {
      warnings.push(`output fill failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const draftOutputCount = selected.filter((test) => !test.output.trim()).length;
  const finalTests = selected.map((test) => ({
    ...test,
    output: test.output.trim() ? test.output : "",
    targets: test.output.trim() ? test.targets : `${test.targets || "AI generated case"} (expected output needs manual check)`,
    reason: test.output.trim() ? test.reason : `${test.reason || "Generated from problem constraints"}; output left blank for manual editing`,
  }));

  return {
    tests: finalTests,
    report: {
      expectedTimeComplexity: validatedRef?.algorithmSummary || plan.expectedTimeComplexity,
      expectedSpaceComplexity: plan.expectedSpaceComplexity,
      stressScale: plan.stressScale,
      performanceCount: finalTests.filter(qualifiesPerformance).length,
      adversarialCount: finalTests.filter(qualifiesAdversarial).length,
      requestedCount: target,
      generatedCount: finalTests.length,
      partial: finalTests.length < target || draftOutputCount > 0,
      computedCount,
      referenceValidated: hasReference && computedCount > 0,
      draftOutputCount,
      warnings: warnings.slice(0, 5),
    },
  };
}

// Helper: get C++ language ID from Judge0
async function getCppLangId(): Promise<number> {
  const res = await fetch("https://ce.judge0.com/languages", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("无法获取编译器列表");
  const langs = await res.json() as { id: number; name: string }[];
  const cpp = langs.find((l: { name: string }) => l.name.includes("C++ (GCC 14"))
    || langs.find((l: { name: string }) => l.name.includes("C++ (GCC 9"))
    || langs.find((l: { name: string }) => l.name.includes("C++"));
  if (!cpp) throw new Error("没有可用 C++ 编译器");
  return cpp.id;
}
