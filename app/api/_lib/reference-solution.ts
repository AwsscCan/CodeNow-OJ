// Reference solution pipeline: AI candidate -> compile -> samples -> differential tests -> cache.
// Only a validated solution is allowed to compute generated test outputs.

import {
  CPU_TIME_LIMIT_SECONDS,
  MEMORY_LIMIT_KB,
  WALL_TIME_LIMIT_SECONDS,
} from "./constants";
import type { GeneratorArtifact } from "./generator-artifact";
import { decode, encode, getCppLanguageId, submitSingle } from "./judge0-client";
import type { MutantSource } from "./mutant-feedback";
import { validateEndpoint } from "./validate-endpoint";

type RunResult = {
  stdout: string;
  stderr: string;
  compileError: string;
  statusId: number;
  accepted: boolean;
  time: number;
};

export async function judge0Submit(sourceCode: string, stdin: string, languageId: number): Promise<RunResult> {
  const result = await submitSingle({
    language_id: languageId,
    source_code: encode(sourceCode),
    stdin: encode(stdin),
    cpu_time_limit: CPU_TIME_LIMIT_SECONDS,
    wall_time_limit: WALL_TIME_LIMIT_SECONDS,
    memory_limit: MEMORY_LIMIT_KB,
  }, "stdout,stderr,compile_output,message,time,status");
  if (!result) throw new Error("判题轮询超时");

  return {
    // Preserve the exact stdout of the reference program (only CRLF->LF) so the
    // stored ground-truth output is byte-faithful. Leading whitespace is part of
    // the required answer for format-sensitive problems; trailing whitespace is
    // ignored by Judge0 at judge time, so we do NOT strip either here.
    stdout: decode(result.stdout).replace(/\r\n/g, "\n"),
    stderr: decode(result.stderr) || decode(result.message),
    compileError: decode(result.compile_output),
    statusId: result.status.id,
    accepted: result.status.id === 3,
    time: Math.max(1, Math.round(Number(result.time || 0) * 1000)),
  };
}

function normalizeOutput(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

function abortReason(signal: AbortSignal): unknown {
  const reason = signal.reason;
  if (reason && typeof reason === "object" && "name" in reason && String((reason as { name?: unknown }).name) === "AbortError") {
    return reason;
  }
  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function awaitWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

// Run an async mapper with a bounded number of concurrent workers, preserving
// result order. Keeps validation fast without flooding the Judge0 CE queue.
async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      throwIfAborted(signal);
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}

const VALIDATION_CONCURRENCY = 6;

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
  /#include\s*<[^>]*filesystem[^>]*>/, /\b(?:std::|experimental::)?filesystem\b/,
  // C++ file streams — the reference must read stdin / write stdout only.
  /#include\s*<fstream>/, /\bstd::(?:basic_)?(?:i|o)?fstream\b/, /\b(?:i|o)fstream\b/, /\bfstream\b/, /\b(?:basic_)?filebuf\b/,
];

export function staticCheck(code: string): string | null {
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
  mutants?: MutantSource[];
  generator?: GeneratorArtifact;
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
  mutants?: MutantSource[];
  generator?: GeneratorArtifact;
  report: ValidationReport;
}

function parseObject(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 未返回有效的参考程序 JSON");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function parseMutants(value: unknown): MutantSource[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const sources = new Set<string>();
  const mutants: MutantSource[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = String(record.id || "").trim();
    const sourceCode = String(record.sourceCode || "").trim();
    if (!id || !sourceCode || ids.has(id) || sources.has(sourceCode)) continue;
    ids.add(id);
    sources.add(sourceCode);
    mutants.push({ id, sourceCode });
    if (mutants.length >= 8) break;
  }
  return mutants;
}

function parseGenerator(value: unknown): GeneratorArtifact | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const sourceCode = typeof record.sourceCode === "string" ? record.sourceCode.trim() : "";
  if (!sourceCode || !Array.isArray(record.seeds) || staticCheck(sourceCode)) return undefined;
  const seen = new Set<number>();
  const seeds: number[] = [];
  for (const value of record.seeds) {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) continue;
    const seed = value;
    if (seen.has(seed)) continue;
    seen.add(seed);
    seeds.push(seed);
    if (seeds.length >= 8) break;
  }
  return seeds.length ? { sourceCode, seeds } : undefined;
}

export async function generateReferenceCandidate(
  apiKey: string,
  endpoint: string,
  model: string,
  problemDigest: string,
  existingSamples: Array<{ input: string; output: string }>,
  signal?: AbortSignal,
): Promise<ReferenceCandidate> {
  throwIfAborted(signal);
  const chatUrl = validateEndpoint(endpoint);
  const isDeepSeek = /api\.deepseek\.com$/i.test(chatUrl.hostname);
  const prompt = `You are an OJ reference-solution engineer. Return only one JSON object.

Problem:
${problemDigest}

Official samples:
${JSON.stringify(existingSamples.slice(0, 6))}

Return this exact shape:
{"solutionCode":"complete efficient C++17 code","bruteCode":"complete simple C++17 code","expectedTimeComplexity":"O(...)","expectedSpaceComplexity":"O(...)","bruteMaxScale":10,"algorithmSummary":"short","assumptions":["short"],"validationInputs":["valid small input 1","valid small input 2"],"mutants":[{"id":"wrong-boundary","sourceCode":"complete plausible but incorrect C++17 code"}],"generator":{"sourceCode":"standalone C++17 generator reading one integer seed from stdin and writing one complete problem input","seeds":[1,7,42]}}

Rules:
- solution and brute must be independent, deterministic, stdin/stdout only.
- brute must use a simpler algorithm and be valid for the listed validationInputs.
- validationInputs must contain 8 to 16 complete small valid inputs for this exact problem.
- No file, network, process, environment, clock, randomness, debug output, or unsafe APIs.
- mutants must be plausible complete incorrect solutions that compile, use stdin/stdout only, and each target a different rejected algorithm or boundary mistake. Return at most 8.
- generator is optional; if returned it must be standalone C++17, read one integer seed from stdin, write exactly one complete problem input to stdout, use no files/network, and return at most 8 deterministic integer seeds.
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
  const timeoutSignal = AbortSignal.timeout(60_000);
  const response = await fetch(chatUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
  });
  throwIfAborted(signal);
  const data = await response.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  throwIfAborted(signal);
  if (!response.ok || !data.choices?.[0]?.message?.content) throw new Error(data.error?.message || "AI 生成参考程序失败");

  const parsed = parseObject(data.choices[0].message.content);
  const solutionCode = String(parsed.solutionCode || "");
  const bruteCode = String(parsed.bruteCode || "");
  const validationInputs = Array.isArray(parsed.validationInputs) ? parsed.validationInputs.map(String).filter((input) => input.trim()).slice(0, 16) : [];
  const mutants = parseMutants(parsed.mutants);
  const generator = parseGenerator(parsed.generator);
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
    mutants,
    ...(generator ? { generator } : {}),
  };
}

export async function validateReference(
  candidate: ReferenceCandidate,
  samples: Array<{ input: string; output: string }>,
  differentialRounds = 16,
  signal?: AbortSignal,
): Promise<{ report: ValidationReport; validated?: ValidatedReference }> {
  throwIfAborted(signal);
  const errors: string[] = [];
  const solutionDanger = staticCheck(candidate.solutionCode);
  const bruteDanger = staticCheck(candidate.bruteCode);
  if (solutionDanger || bruteDanger) {
    return { report: { status: "rejected", compiled: false, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors: [solutionDanger, bruteDanger].filter(Boolean) as string[] } };
  }

  let languageId: number;
  try {
    languageId = await awaitWithAbort(getCppLanguageId(), signal);
    throwIfAborted(signal);
  } catch (error) {
    if (signal?.aborted) throw abortReason(signal);
    return { report: { status: "compile_failed", compiled: false, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors: [error instanceof Error ? error.message : "编译器获取失败"] } };
  }

  // Probe with empty stdin ONLY to surface genuine compile errors. A runtime
  // error / TLE on empty input is expected for any program that reads stdin and
  // must NOT be treated as a compile failure — correctness is checked below via
  // the official samples and the differential (solution-vs-brute) rounds.
  const [solutionCompile, bruteCompile] = await awaitWithAbort(Promise.all([
    judge0Submit(candidate.solutionCode, "", languageId),
    judge0Submit(candidate.bruteCode, "", languageId),
  ]), signal);
  throwIfAborted(signal);
  if (solutionCompile.compileError) errors.push(`solution 编译失败: ${solutionCompile.compileError}`);
  if (bruteCompile.compileError) errors.push(`brute 编译失败: ${bruteCompile.compileError}`);
  if (errors.length) return { report: { status: "compile_failed", compiled: false, samplesPassed: false, differentialTestsPassed: 0, differentialTestsFailed: 0, errors } };

  // Both implementations must pass all official samples — checked concurrently.
  const sampleResults = await awaitWithAbort(mapConcurrent(samples.slice(0, 6), VALIDATION_CONCURRENCY, async (sample) => {
    throwIfAborted(signal);
    const [solutionRun, bruteRun] = await Promise.all([
      judge0Submit(candidate.solutionCode, sample.input, languageId),
      judge0Submit(candidate.bruteCode, sample.input, languageId),
    ]);
    throwIfAborted(signal);
    return {
      solutionOk: solutionRun.accepted && normalizeOutput(solutionRun.stdout) === normalizeOutput(sample.output),
      bruteOk: bruteRun.accepted && normalizeOutput(bruteRun.stdout) === normalizeOutput(sample.output),
    };
  }, signal), signal);
  throwIfAborted(signal);
  for (const result of sampleResults) {
    if (!result.solutionOk) errors.push("solution 未通过官方样例");
    if (!result.bruteOk) errors.push("brute 未通过官方样例");
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
        mutants: candidate.mutants || [],
        ...(candidate.generator ? { generator: candidate.generator } : {}),
        report,
      },
    };
  }

  const validationInputs = Array.from(new Set(candidate.validationInputs.filter((input) => input.length <= 100_000 && !input.includes("\0")))).slice(0, 16);
  if (validationInputs.length < 4) errors.push("有效对拍输入少于 4 个");

  // Differential (solution-vs-brute) rounds run concurrently with a bounded
  // worker pool so a full validation set finishes in ~one Judge0 round instead
  // of N serial ones.
  let passed = 0;
  let failed = 0;
  const diffResults = await awaitWithAbort(mapConcurrent(validationInputs, VALIDATION_CONCURRENCY, async (input) => {
    throwIfAborted(signal);
    const [solutionRun, bruteRun] = await Promise.all([
      judge0Submit(candidate.solutionCode, input, languageId),
      judge0Submit(candidate.bruteCode, input, languageId),
    ]);
    throwIfAborted(signal);
    if (!solutionRun.accepted || !bruteRun.accepted) return { ok: false, error: `对拍输入导致程序异常: ${input.slice(0, 120)}` };
    if (normalizeOutput(solutionRun.stdout) !== normalizeOutput(bruteRun.stdout)) return { ok: false, error: `solution/brute 输出不一致: ${input.slice(0, 120)}` };
    return { ok: true, error: "" };
  }, signal), signal);
  throwIfAborted(signal);
  for (const result of diffResults) {
    if (result.ok) passed++;
    else { failed++; errors.push(result.error); }
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
      mutants: candidate.mutants || [],
      ...(candidate.generator ? { generator: candidate.generator } : {}),
      report,
    },
  };
}

type CachedReference = {
  reference: ValidatedReference;
  validatedAt: number;
};

const referenceCache = new Map<string, CachedReference>();

function cacheTimestamp(reference: ValidatedReference): number {
  const value = reference.report.validatedAt ? Date.parse(reference.report.validatedAt) : 0;
  return Number.isFinite(value) ? value : 0;
}

function cacheableReference(reference: ValidatedReference): boolean {
  if (!reference || typeof reference.solutionCode !== "string" || typeof reference.bruteCode !== "string") return false;
  if (!reference.solutionCode.trim() || !reference.bruteCode.trim() || reference.report?.status !== "validated") return false;
  if (staticCheck(reference.solutionCode) || staticCheck(reference.bruteCode)) return false;
  if (!reference.generator) return true;
  return typeof reference.generator.sourceCode === "string"
    && Array.isArray(reference.generator.seeds)
    && !staticCheck(reference.generator.sourceCode);
}

function cloneValidatedReference(reference: ValidatedReference): ValidatedReference {
  const generator = reference.generator && typeof reference.generator.sourceCode === "string" && Array.isArray(reference.generator.seeds)
    ? { sourceCode: reference.generator.sourceCode, seeds: [...reference.generator.seeds] }
    : undefined;
  const mutants = Array.isArray(reference.mutants)
    ? reference.mutants.map((mutant) => ({ id: mutant.id, sourceCode: mutant.sourceCode }))
    : undefined;
  return {
    ...reference,
    ...(mutants ? { mutants } : {}),
    ...(generator ? { generator } : {}),
    report: { ...reference.report, errors: [...reference.report.errors] },
  };
}

export function getCachedReference(problemDigest: string): ValidatedReference | null {
  const cached = referenceCache.get(problemDigest);
  return cached ? cloneValidatedReference(cached.reference) : null;
}

export function setCachedReference(problemDigest: string, reference: ValidatedReference): void {
  if (!problemDigest || !cacheableReference(reference)) return;
  const validatedAt = cacheTimestamp(reference);
  const existing = referenceCache.get(problemDigest);
  if (existing && existing.validatedAt >= validatedAt) return;
  referenceCache.set(problemDigest, { reference: cloneValidatedReference(reference), validatedAt });
}

export function invalidateCache(problemDigest: string): void { referenceCache.delete(problemDigest); }
