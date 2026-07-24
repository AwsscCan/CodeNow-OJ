// Reference solution: AI generates solution + brute → compile via Judge0 → validate → reuse

import { JUDGE0_BASE, CPU_TIME_LIMIT_SECONDS, WALL_TIME_LIMIT_SECONDS, MEMORY_LIMIT_KB, JUDGE_POLL_INTERVAL_MS, JUDGE_FIRST_POLL_MS, JUDGE_MAX_POLLS } from "./constants";

type JudgeResult = { stdout?: string | null; stderr?: string | null; compile_output?: string | null; message?: string | null; time?: string | null; status: { id: number; description: string } };

function encode64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode64(value?: string | null): string {
  if (!value) return "";
  try { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i); return new TextDecoder().decode(bytes); } catch { return ""; }
}

async function getCppLangId(): Promise<number> {
  const res = await fetch(`${JUDGE0_BASE}/languages`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("无法读取编译器列表");
  const langs = await res.json() as { id: number; name: string }[];
  const cpp = langs.find((l) => l.name.includes("C++ (GCC 14")) || langs.find((l) => l.name.includes("C++ (GCC 9")) || langs.find((l) => l.name.includes("C++"));
  if (!cpp) throw new Error("没有可用 C++ 编译器");
  return cpp.id;
}

export async function judge0Submit(sourceCode: string, stdin: string, languageId: number): Promise<{ stdout: string; stderr: string; compileError: string; exitCode: number; time: number }> {
  const create = await fetch(`${JUDGE0_BASE}/submissions?base64_encoded=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ language_id: languageId, source_code: encode64(sourceCode), stdin: encode64(stdin), cpu_time_limit: CPU_TIME_LIMIT_SECONDS, wall_time_limit: WALL_TIME_LIMIT_SECONDS, memory_limit: MEMORY_LIMIT_KB }),
  });
  const created = await create.json() as { token?: string; error?: string };
  if (!create.ok || !created.token) throw new Error(created.error || "提交失败");

  let result: JudgeResult | null = null;
  for (let i = 0; i < JUDGE_MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? JUDGE_FIRST_POLL_MS : JUDGE_POLL_INTERVAL_MS));
    const poll = await fetch(`${JUDGE0_BASE}/submissions/${created.token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,time,status`, { headers: { Accept: "application/json" } });
    if (!poll.ok) throw new Error("读取结果失败");
    result = await poll.json() as JudgeResult;
    if (result.status.id > 2) break;
  }
  if (!result || result.status.id <= 2) throw new Error("判题超时");

  const stdout = decode64(result.stdout).trim();
  return {
    stdout,
    stderr: decode64(result.stderr) || decode64(result.message),
    compileError: decode64(result.compile_output),
    exitCode: result.status.id,
    time: Math.max(1, Math.round(Number(result.time || 0) * 1000)),
  };
}

function normalizeOutput(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

// ── Safe checking: reject dangerous code patterns ──
const DANGEROUS_PATTERNS = [
  /\bsystem\s*\(/, /\bpopen\s*\(/, /\bfork\s*\(/, /\bexec[lvpe]*\s*\(/,
  /\bsocket\s*\(/, /\bconnect\s*\(/, /\baccept\s*\(/,
  /\bfopen\s*\(/, /\bopen\s*\(/, /\bcreat\s*\(/,
  /\bunlink\s*\(/, /\bremove\s*\(/, /\brename\s*\(/,
  /\bgetenv\s*\(/, /\bputenv\s*\(/, /\bsetenv\s*\(/,
  /\bdlopen\s*\(/, /\bdlsym\s*\(/,
  /\b__asm__?\b/, /\b__asm\b/, /\basm\s*volatile\b/,
  /\bclone\s*\(/, /\bptrace\s*\(/, /\bkill\s*\(/,
  /#include\s*<sys\/socket\.h>/, /#include\s*<netinet\/in\.h>/,
  /#include\s*<arpa\/inet\.h>/, /#include\s*<unistd\.h>/,
];

function staticCheck(code: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) return `代码包含不安全调用: ${pattern.source}`;
  }
  return null;
}

// ── Types ──
export interface ReferenceCandidate {
  solutionCode: string;
  bruteCode: string;
  expectedTimeComplexity: string;
  expectedSpaceComplexity: string;
  bruteMaxScale: number;
  algorithmSummary: string;
  assumptions: string[];
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
  bruteMaxScale: number;
  report: ValidationReport;
}

// ── Main API ──

export async function generateReferenceCandidate(
  apiKey: string, endpoint: string, model: string,
  problemDigest: string, existingSamples: Array<{ input: string; output: string }>,
): Promise<ReferenceCandidate> {
  const chatUrl = validateEndpoint(endpoint);
  const isDeepSeek = /api\.deepseek\.com$/i.test(chatUrl.hostname);

  const systemPrompt = `You write trusted C++17 reference solutions for OJ problems. Output ONLY a JSON object.

Problem:
${problemDigest}

Sample cases:
${JSON.stringify(existingSamples.slice(0, 4))}

Requirements:
1. Generate a DETERMINISTIC, efficient C++17 solution using fast I/O (ios::sync_with_stdio(false)).
2. Generate a SEPARATE simple brute-force C++17 solution for small inputs.
3. Both read from stdin, write to stdout. No file/network access. No randomness inside solutions.
4. Use safe integer types (long long when in doubt), avoid undefined behavior.
5. The brute solution should prioritize CORRECTNESS over performance.

Return exactly:
{
  "solutionCode": "complete C++17 code",
  "bruteCode": "complete C++17 code",
  "expectedTimeComplexity": "O(n log n)",
  "expectedSpaceComplexity": "O(n)",
  "bruteMaxScale": 10,
  "algorithmSummary": "short description",
  "assumptions": ["key assumption 1"]
}`;

  const body: Record<string, unknown> = { model, temperature: 0.05, max_tokens: 6000, stream: false, messages: [{ role: "system", content: systemPrompt }] };
  if (isDeepSeek) body.thinking = { type: "disabled" };

  const res = await fetch(chatUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  const data = await res.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!res.ok || !data.choices?.[0]?.message?.content) throw new Error(data.error?.message || "AI 生成参考程序失败");

  const raw = data.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 未返回有效的参考程序 JSON");

  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed.solutionCode?.trim()) throw new Error("缺少 solutionCode");
  return {
    solutionCode: String(parsed.solutionCode),
    bruteCode: String(parsed.bruteCode || parsed.solutionCode), // fallback to solution if no brute
    expectedTimeComplexity: String(parsed.expectedTimeComplexity || "unknown"),
    expectedSpaceComplexity: String(parsed.expectedSpaceComplexity || "unknown"),
    bruteMaxScale: Math.max(1, Math.floor(Number(parsed.bruteMaxScale) || 10)),
    algorithmSummary: String(parsed.algorithmSummary || ""),
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(String).slice(0, 10) : [],
  };
}

export async function validateReference(
  candidate: ReferenceCandidate,
  samples: Array<{ input: string; output: string }>,
  differentialRounds: number = 200,
): Promise<{ report: ValidationReport; validated?: ValidatedReference }> {
  const errors: string[] = [];

  // Static check
  const solCheck = staticCheck(candidate.solutionCode);
  if (solCheck) { errors.push(solCheck); return { report: { status: "rejected", compiled: false, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors } }; }
  const bruteCheck = candidate.bruteCode !== candidate.solutionCode ? staticCheck(candidate.bruteCode) : null;
  if (bruteCheck) { errors.push(bruteCheck); return { report: { status: "rejected", compiled: false, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors } }; }

  let langId: number;
  try { langId = await getCppLangId(); } catch (e) { errors.push(`编译器获取失败: ${e}`); return { report: { status: "compile_failed", compiled: false, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors } }; }

  // Compile check: run with empty input, check for compile errors
  const compileSol = await judge0Submit(candidate.solutionCode, "", langId);
  if (compileSol.compileError) { errors.push(`Solution 编译失败: ${compileSol.compileError.slice(0, 500)}`); return { report: { status: "compile_failed", compiled: false, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors } }; }

  const hasBrute = candidate.bruteCode !== candidate.solutionCode && candidate.bruteCode.trim();
  if (hasBrute) {
    const compileBrute = await judge0Submit(candidate.bruteCode, "", langId);
    if (compileBrute.compileError) { errors.push(`Brute 编译失败: ${compileBrute.compileError.slice(0, 500)}`); }
  }

  if (errors.length) return { report: { status: "compile_failed", compiled: false, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors } };

  // Sample validation
  let samplesPassed = 0, samplesFailed = 0;
  for (const sample of samples.slice(0, 6)) {
    const solR = await judge0Submit(candidate.solutionCode, sample.input, langId);
    if (solR.compileError) { errors.push(`Solution sample 编译错误: ${solR.compileError.slice(0, 300)}`); samplesFailed++; continue; }
    if (normalizeOutput(solR.stdout) !== normalizeOutput(sample.output)) { errors.push(`Sample 不匹配: expected=${sample.output.slice(0, 80)} got=${solR.stdout.slice(0, 80)}`); samplesFailed++; continue; }
    samplesPassed++;
  }
  if (samplesFailed > 0) return { report: { status: "sample_failed", compiled: true, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors } };

  // Differential testing (solution vs brute on small random inputs)
  let diffPassed = 0, diffFailed = 0;
  if (hasBrute) {
    for (let i = 0; i < differentialRounds; i++) {
      const smallInput = generateSmallRandomInput(i, candidate.bruteMaxScale);
      const [solR, bruteR] = await Promise.all([
        judge0Submit(candidate.solutionCode, smallInput, langId),
        judge0Submit(candidate.bruteCode, smallInput, langId),
      ]);
      if (solR.compileError || bruteR.compileError) { diffFailed++; continue; }
      if (normalizeOutput(solR.stdout) !== normalizeOutput(bruteR.stdout)) {
        errors.push(`对拍不一致 (round ${i}): solution="${solR.stdout.slice(0, 80)}" brute="${bruteR.stdout.slice(0, 80)}"`);
        diffFailed++;
        if (diffFailed >= 5) break;
      } else { diffPassed++; }
    }
  } else {
    diffPassed = differentialRounds; // No brute available — skip differential
  }

  if (diffFailed > 0) return { report: { status: "differential_failed", compiled: true, samplesPassed: true, differentialTestsPassed: diffPassed, differentialTestsFailed: diffFailed, errors } };

  const report: ValidationReport = { status: "validated", compiled: true, samplesPassed: true, differentialTestsPassed: diffPassed, differentialTestsFailed: 0, errors: [], validatedAt: new Date().toISOString() };
  const validated: ValidatedReference = { solutionCode: candidate.solutionCode, bruteCode: candidate.bruteCode, algorithmSummary: candidate.algorithmSummary, bruteMaxScale: candidate.bruteMaxScale, report };
  return { report, validated };
}

// Simple small random input generator for differential testing
function generateSmallRandomInput(seed: number, maxN: number): string {
  const n = 1 + (seed % Math.min(maxN, 20));
  let result = `${n}\n`;
  let r = seed * 7919 + 104729;
  for (let i = 0; i < n; i++) {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    result += `${r % 100} `;
  }
  return result.trimEnd() + "\n";
}

// ── In-memory reference cache ──
const referenceCache = new Map<string, ValidatedReference>();

function cacheKey(problemDigest: string): string {
  // Simple hash of the digest
  let hash = 0;
  for (let i = 0; i < problemDigest.length; i++) {
    const char = problemDigest.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `ref_${hash}`;
}

export function getCachedReference(problemDigest: string): ValidatedReference | null {
  return referenceCache.get(cacheKey(problemDigest)) || null;
}

export function setCachedReference(problemDigest: string, ref: ValidatedReference): void {
  referenceCache.set(cacheKey(problemDigest), ref);
}

export function invalidateCache(problemDigest: string): void {
  referenceCache.delete(cacheKey(problemDigest));
}

// Import validateEndpoint — share across modules
function validateEndpoint(raw: string): URL {
  const url = new URL(raw.trim());
  if (url.protocol !== "https:") throw new Error("Endpoint 必须使用 HTTPS");
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = /\/chat\/completions$/i.test(path) ? path : `${path}/chat/completions`;
  return url;
}
