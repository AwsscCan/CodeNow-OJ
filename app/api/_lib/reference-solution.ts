// Reference solution pipeline: AI candidate -> compile -> samples -> differential tests -> cache.
// Only a validated solution is allowed to compute generated test outputs.

import {
  CPU_TIME_LIMIT_SECONDS,
  JUDGE0_BASE,
  JUDGE_FIRST_POLL_MS,
  JUDGE_MAX_POLLS,
  JUDGE_POLL_INTERVAL_MS,
  MEMORY_LIMIT_KB,
  WALL_TIME_LIMIT_SECONDS,
} from "./constants";
import { validateEndpoint } from "./validate-endpoint";

type JudgeResult = {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  status: { id: number; description: string };
};

type RunResult = {
  stdout: string;
  stderr: string;
  compileError: string;
  statusId: number;
  accepted: boolean;
  time: number;
};

let cachedCppLanguageId: number | null = null;

function encode64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode64(value?: string | null): string {
  if (!value) return "";
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

async function getCppLanguageId(): Promise<number> {
  if (cachedCppLanguageId !== null) return cachedCppLanguageId;
  const response = await fetch(`${JUDGE0_BASE}/languages`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("无法读取 C++ 编译器列表");
  const languages = await response.json() as { id: number; name: string }[];
  const cpp = languages.find((item) => item.name.includes("C++ (GCC 14"))
    || languages.find((item) => item.name.includes("C++ (GCC 9"))
    || languages.find((item) => item.name.includes("C++"));
  if (!cpp) throw new Error("没有可用 C++ 编译器");
  cachedCppLanguageId = cpp.id;
  return cpp.id;
}

export async function judge0Submit(sourceCode: string, stdin: string, languageId: number): Promise<RunResult> {
  const create = await fetch(`${JUDGE0_BASE}/submissions?base64_encoded=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      language_id: languageId,
      source_code: encode64(sourceCode),
      stdin: encode64(stdin),
      cpu_time_limit: CPU_TIME_LIMIT_SECONDS,
      wall_time_limit: WALL_TIME_LIMIT_SECONDS,
      memory_limit: MEMORY_LIMIT_KB,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const created = await create.json() as { token?: string; error?: string };
  if (!create.ok || !created.token) throw new Error(created.error || "提交进入判题队列失败");

  let result: JudgeResult | null = null;
  for (let attempt = 0; attempt < JUDGE_MAX_POLLS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? JUDGE_FIRST_POLL_MS : JUDGE_POLL_INTERVAL_MS));
    const poll = await fetch(`${JUDGE0_BASE}/submissions/${created.token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,time,status`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!poll.ok) throw new Error("读取判题结果失败");
    result = await poll.json() as JudgeResult;
    if (result.status.id > 2) break;
  }
  if (!result || result.status.id <= 2) throw new Error("判题轮询超时");

  return {
    stdout: decode64(result.stdout).trim(),
    stderr: decode64(result.stderr) || decode64(result.message),
    compileError: decode64(result.compile_output),
    statusId: result.status.id,
    accepted: result.status.id === 3,
    time: Math.max(1, Math.round(Number(result.time || 0) * 1000)),
  };
}

function normalizeOutput(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

const DANGEROUS_PATTERNS = [
  /\bsystem\s*\(/, /\bpopen\s*\(/, /\bfork\s*\(/, /\bexec[lvpe]*\s*\(/,
  /\bsocket\s*\(/, /\bconnect\s*\(/, /\baccept\s*\(/,
  /\bfopen\s*\(/, /\bfreopen\s*\(/, /\bopen\s*\(/, /\bcreat\s*\(/,
  /\bunlink\s*\(/, /\bremove\s*\(/, /\brename\s*\(/,
  /\bgetenv\s*\(/, /\bputenv\s*\(/, /\bsetenv\s*\(/,
  /\bdlopen\s*\(/, /\bdlsym\s*\(/, /\bptrace\s*\(/,
  /\b__asm__?\b/, /\basm\s+volatile\b/,
  /#include\s*<sys\/socket\.h>/, /#include\s*<netinet\/in\.h>/,
  /#include\s*<arpa\/inet\.h>/, /#include\s*<unistd\.h>/,
];

function staticCheck(code: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) return `代码包含不安全调用: ${pattern.source}`;
  }
  return null;
}

export interface ReferenceCandidate {
  solutionCode: string;
  bruteCode: string;
  expectedTimeComplexity: string;
  expectedSpaceComplexity: string;
  bruteMaxScale: number;
  algorithmSummary: string;
  assumptions: string[];
  validationInputs: string[];
}

export interface ValidationReport {
  status: "validated" | "compile_failed" | "sample_failed" | "differential_failed" | "rejected" | "not_attempted";
  compiled: boolean;
  samplesPassed: boolean;
  differentialTestsPassed: number;
  differentialTestsFailed: number;
  errors: string[];
  validatedAt?: string;
}

export interface ValidatedReference {
  solutionCode: string;
  bruteCode: string;
  algorithmSummary: string;
  expectedTimeComplexity: string;
  expectedSpaceComplexity: string;
  bruteMaxScale: number;
  report: ValidationReport;
}

function parseObject(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 未返回有效的参考程序 JSON");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

export async function generateReferenceCandidate(
  apiKey: string,
  endpoint: string,
  model: string,
  problemDigest: string,
  existingSamples: Array<{ input: string; output: string }>,
): Promise<ReferenceCandidate> {
  const chatUrl = validateEndpoint(endpoint);
  const isDeepSeek = /api\.deepseek\.com$/i.test(chatUrl.hostname);
  const prompt = `You are an OJ reference-solution engineer. Return only one JSON object.

Problem:
${problemDigest}

Official samples:
${JSON.stringify(existingSamples.slice(0, 6))}

Return this exact shape:
{"solutionCode":"complete efficient C++17 code","bruteCode":"complete simple C++17 code","expectedTimeComplexity":"O(...)","expectedSpaceComplexity":"O(...)","bruteMaxScale":10,"algorithmSummary":"short","assumptions":["short"],"validationInputs":["valid small input 1","valid small input 2"]}

Rules:
- solution and brute must be independent, deterministic, stdin/stdout only.
- brute must use a simpler algorithm and be valid for the listed validationInputs.
- validationInputs must contain 8 to 16 complete small valid inputs for this exact problem.
- No file, network, process, environment, clock, randomness, debug output, or unsafe APIs.
- Use exact C++17 and safe integer types. Never invent an input format.
- Do not include Markdown or extra JSON fields.`;
  const body: Record<string, unknown> = {
    model,
    temperature: 0.02,
    max_tokens: 7000,
    stream: false,
    messages: [{ role: "system", content: prompt }],
  };
  if (isDeepSeek) body.thinking = { type: "disabled" };
  const response = await fetch(chatUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!response.ok || !data.choices?.[0]?.message?.content) throw new Error(data.error?.message || "AI 生成参考程序失败");

  const parsed = parseObject(data.choices[0].message.content);
  const solutionCode = String(parsed.solutionCode || "");
  const bruteCode = String(parsed.bruteCode || "");
  const validationInputs = Array.isArray(parsed.validationInputs) ? parsed.validationInputs.map(String).filter((input) => input.trim()).slice(0, 16) : [];
  if (!solutionCode.trim() || !bruteCode.trim()) throw new Error("参考程序必须同时包含 solutionCode 和 bruteCode");
  if (solutionCode.trim() === bruteCode.trim()) throw new Error("solution 和 brute 必须是独立实现");
  if (validationInputs.length < 4) throw new Error("参考程序缺少足够的 validationInputs");

  return {
    solutionCode,
    bruteCode,
    expectedTimeComplexity: String(parsed.expectedTimeComplexity || "unknown"),
    expectedSpaceComplexity: String(parsed.expectedSpaceComplexity || "unknown"),
    bruteMaxScale: Math.max(1, Math.floor(Number(parsed.bruteMaxScale) || 10)),
    algorithmSummary: String(parsed.algorithmSummary || ""),
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(String).slice(0, 10) : [],
    validationInputs,
  };
}

export async function validateReference(
  candidate: ReferenceCandidate,
  samples: Array<{ input: string; output: string }>,
  differentialRounds = 16,
): Promise<{ report: ValidationReport; validated?: ValidatedReference }> {
  const errors: string[] = [];
  const solutionDanger = staticCheck(candidate.solutionCode);
  const bruteDanger = staticCheck(candidate.bruteCode);
  if (solutionDanger || bruteDanger) {
    return { report: { status: "rejected", compiled: false, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors: [solutionDanger, bruteDanger].filter(Boolean) as string[] } };
  }

  let languageId: number;
  try { languageId = await getCppLanguageId(); } catch (error) {
    return { report: { status: "compile_failed", compiled: false, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors: [error instanceof Error ? error.message : "编译器获取失败"] } };
  }

  const [solutionCompile, bruteCompile] = await Promise.all([
    judge0Submit(candidate.solutionCode, "", languageId),
    judge0Submit(candidate.bruteCode, "", languageId),
  ]);
  if (solutionCompile.compileError || !solutionCompile.accepted) errors.push(`solution 编译/启动失败: ${solutionCompile.compileError || solutionCompile.stderr || solutionCompile.statusId}`);
  if (bruteCompile.compileError || !bruteCompile.accepted) errors.push(`brute 编译/启动失败: ${bruteCompile.compileError || bruteCompile.stderr || bruteCompile.statusId}`);
  if (errors.length) return { report: { status: "compile_failed", compiled: false, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors } };

  // Both implementations must pass all official samples.
  for (const sample of samples.slice(0, 6)) {
    const [solutionRun, bruteRun] = await Promise.all([
      judge0Submit(candidate.solutionCode, sample.input, languageId),
      judge0Submit(candidate.bruteCode, sample.input, languageId),
    ]);
    if (!solutionRun.accepted || normalizeOutput(solutionRun.stdout) !== normalizeOutput(sample.output)) errors.push("solution 未通过官方样例");
    if (!bruteRun.accepted || normalizeOutput(bruteRun.stdout) !== normalizeOutput(sample.output)) errors.push("brute 未通过官方样例");
  }
  if (errors.length) return { report: { status: "sample_failed", compiled: true, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors } };

  if (differentialRounds <= 0) {
    const report: ValidationReport = { status: "validated", compiled: true, samplesPassed: true, differentialTestsPassed: 0, differentialTestsFailed: 0, errors: [], validatedAt: new Date().toISOString() };
    return {
      report,
      validated: {
        solutionCode: candidate.solutionCode,
        bruteCode: candidate.bruteCode,
        algorithmSummary: candidate.algorithmSummary,
        expectedTimeComplexity: candidate.expectedTimeComplexity,
        expectedSpaceComplexity: candidate.expectedSpaceComplexity,
        bruteMaxScale: candidate.bruteMaxScale,
        report,
      },
    };
  }

  const validationInputs = Array.from(new Set(candidate.validationInputs.filter((input) => input.length <= 100_000 && !input.includes("\0")))).slice(0, 16);
  if (validationInputs.length < 4) errors.push("有效对拍输入少于 4 个");

  let passed = 0;
  let failed = 0;
  for (const input of validationInputs) {
    const [solutionRun, bruteRun] = await Promise.all([
      judge0Submit(candidate.solutionCode, input, languageId),
      judge0Submit(candidate.bruteCode, input, languageId),
    ]);
    if (!solutionRun.accepted || !bruteRun.accepted) {
      failed++;
      errors.push(`对拍输入导致程序异常: ${input.slice(0, 120)}`);
    } else if (normalizeOutput(solutionRun.stdout) !== normalizeOutput(bruteRun.stdout)) {
      failed++;
      errors.push(`solution/brute 输出不一致: ${input.slice(0, 120)}`);
    } else {
      passed++;
    }
  }
  if (failed > 0 || errors.length) return { report: { status: "differential_failed", compiled: true, samplesPassed: true, differentialTestsPassed: passed, differentialTestsFailed: failed, errors: errors.slice(0, 8) } };

  const report: ValidationReport = { status: "validated", compiled: true, samplesPassed: true, differentialTestsPassed: passed, differentialTestsFailed: 0, errors: [], validatedAt: new Date().toISOString() };
  return {
    report,
    validated: {
      solutionCode: candidate.solutionCode,
      bruteCode: candidate.bruteCode,
      algorithmSummary: candidate.algorithmSummary,
      expectedTimeComplexity: candidate.expectedTimeComplexity,
      expectedSpaceComplexity: candidate.expectedSpaceComplexity,
      bruteMaxScale: candidate.bruteMaxScale,
      report,
    },
  };
}

const referenceCache = new Map<string, ValidatedReference>();
function cacheKey(problemDigest: string): string {
  let hash = 0;
  for (let i = 0; i < problemDigest.length; i++) hash = ((hash << 5) - hash + problemDigest.charCodeAt(i)) | 0;
  return `ref_${hash}`;
}
export function getCachedReference(problemDigest: string): ValidatedReference | null { return referenceCache.get(cacheKey(problemDigest)) || null; }
export function setCachedReference(problemDigest: string, reference: ValidatedReference): void { referenceCache.set(cacheKey(problemDigest), reference); }
export function invalidateCache(problemDigest: string): void { referenceCache.delete(cacheKey(problemDigest)); }
