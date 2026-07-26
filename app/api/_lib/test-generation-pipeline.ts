import { parseGeneratedTests, type GeneratedTest } from "./complexity-tests";
import { AI_TIMEOUT_MS, MAX_EXPANDED_CHARS } from "./constants";
import { validateInput } from "./generator-registry";
import { judge0Submit, type ValidatedReference } from "./reference-solution";
import { validateEndpoint } from "./validate-endpoint";

type UpstreamData = { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
type Category = "boundary" | "special" | "ordinary" | "adversarial" | "performance";

export interface ProblemProfile {
  family: string;
  inputShape: string;
  acceptedComplexity: string;
  spaceComplexity: string;
  rejectedAlgorithms: string[];
  coverageRisks: string[];
  stressScale: number;
}

export interface GenerationReport {
  expectedTimeComplexity: string;
  expectedSpaceComplexity: string;
  stressScale: number;
  performanceCount: number;
  adversarialCount: number;
  requestedCount: number;
  generatedCount: number;
  partial: boolean;
  computedCount: number;
  referenceValidated: boolean;
  draftOutputCount: number;
  categoryQuota: Record<Category, number>;
  categoryCounts: Record<string, number>;
  unmetQuota: Record<string, number>;
  qualityOk: boolean;
  verificationMode: "validated_reference" | "ai_cross_batch" | "ai_structured";
  auditedCount: number;
  batches: number;
  elapsedMs: number;
  profile: ProblemProfile;
  warnings: string[];
}

/**
 * 生成稳定性参数(有回归测试锁)：
 * 预算过短会中途掐断多批次生成；单批超时过短在上游高峰期连环失败；
 * 首批请求过大会撞 max_tokens 把 JSON 截断导致整批报废。
 */
export const GENERATION_BUDGET_MS = 90_000;
export const PER_CALL_TIMEOUT_CAP_MS = 40_000;
export const FIRST_BATCH_CAP = 12;

const CATEGORIES: Category[] = ["boundary", "special", "ordinary", "adversarial", "performance"];
const EMPTY_PROFILE: ProblemProfile = {
  family: "unknown",
  inputShape: "infer from the statement",
  acceptedComplexity: "unknown",
  spaceComplexity: "unknown",
  rejectedAlgorithms: [],
  coverageRisks: [],
  stressScale: 1,
};

// Canonical dedup key: two inputs that differ only by whitespace runs, per-line
// trailing whitespace, CRLF, or blank-line padding are the same test case for
// any whitespace-tokenized stdin (cin>>/scanf). The stored input keeps its
// original formatting; only the dedup fingerprint is canonical.
function canonicalKey(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Run an async mapper over items with a bounded number of concurrent workers,
// preserving result order. Used to verify reference outputs in parallel.
async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}

const REFERENCE_VERIFY_CONCURRENCY = 6;

function categoryOf(value: string): Category {
  const category = String(value || "").toLowerCase();
  if (/performance|stress|large|max|性能|压力/.test(category)) return "performance";
  if (/adversarial|hack|counter|反例|卡常/.test(category)) return "adversarial";
  if (/boundary|edge|limit|边界|极限/.test(category)) return "boundary";
  if (/special|degenerate|特殊|退化/.test(category)) return "special";
  return "ordinary";
}

export function buildCategoryQuota(target: number): Record<Category, number> {
  const count = Math.max(1, Math.min(50, Math.floor(target)));
  if (count === 1) return { boundary: 0, special: 0, ordinary: 1, adversarial: 0, performance: 0 };
  if (count === 2) return { boundary: 1, special: 0, ordinary: 1, adversarial: 0, performance: 0 };
  if (count === 3) return { boundary: 1, special: 1, ordinary: 1, adversarial: 0, performance: 0 };
  if (count === 4) return { boundary: 1, special: 1, ordinary: 1, adversarial: 1, performance: 0 };
  const boundary = Math.max(1, Math.round(count * 0.17));
  const special = Math.max(1, Math.round(count * 0.17));
  const adversarial = Math.max(1, Math.round(count * 0.17));
  const performance = Math.max(1, Math.round(count * 0.17));
  return { boundary, special, adversarial, performance, ordinary: count - boundary - special - adversarial - performance };
}

function compactProblem(problem: Record<string, unknown>): string {
  const joined = [
    `ID: ${String(problem.id || "")}`,
    `Title: ${String(problem.title || "")}`,
    `Limits: ${String(problem.time || "unknown")} | ${String(problem.memory || "unknown")}`,
    `Statement:\n${String(problem.description || "")}`,
    `Input format:\n${String(problem.inputFormat || "")}`,
    `Output format:\n${String(problem.outputFormat || "")}`,
  ].join("\n\n");
  return joined.length <= 24_000 ? joined : `${joined.slice(0, 23_000)}\n\n[statement truncated]`;
}

function jsonObject(content: string): Record<string, unknown> | null {
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const candidate = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(candidate) as Record<string, unknown>; } catch { return null; }
}

function profileFrom(content: string, fallback?: ProblemProfile): ProblemProfile {
  const raw = jsonObject(content)?.profile;
  if (!raw || typeof raw !== "object") return fallback || EMPTY_PROFILE;
  const profile = raw as Record<string, unknown>;
  const strings = (value: unknown) => Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 8) : [];
  const rejected = strings(profile.rejectedAlgorithms);
  const risks = strings(profile.coverageRisks);
  return {
    family: String(profile.family || fallback?.family || "unknown"),
    inputShape: String(profile.inputShape || fallback?.inputShape || "infer from the statement"),
    acceptedComplexity: String(profile.acceptedComplexity || fallback?.acceptedComplexity || "unknown"),
    spaceComplexity: String(profile.spaceComplexity || fallback?.spaceComplexity || "unknown"),
    rejectedAlgorithms: rejected.length ? rejected : fallback?.rejectedAlgorithms || [],
    coverageRisks: risks.length ? risks : fallback?.coverageRisks || [],
    stressScale: Math.max(1, Math.floor(Number(profile.stressScale) || fallback?.stressScale || 1)),
  };
}

function testSummary(tests: GeneratedTest[]) {
  return tests.slice(-24).map((test, index) => ({
    index: index + 1,
    category: test.category,
    scale: test.scale,
    input: test.input.slice(0, 220),
    output: test.output.slice(0, 120),
    targets: test.targets.slice(0, 100),
  }));
}

// Show the AI a rotating window of the OLDEST not-yet-audited cases (bounded)
// so every accepted case is re-checked at least once across batches, instead of
// only ever re-auditing the last three.
function auditSummary(tests: GeneratedTest[], auditedCaseIds: Set<string>, limit = 6) {
  const pending: Array<{ caseId: string; input: string; output: string }> = [];
  for (let i = 0; i < tests.length && pending.length < limit; i++) {
    const caseId = `C${i + 1}`;
    if (auditedCaseIds.has(caseId)) continue;
    pending.push({ caseId, input: tests[i].input.slice(0, 1_200), output: tests[i].output.slice(0, 600) });
  }
  return pending;
}

function countsOf(tests: GeneratedTest[]) {
  return tests.reduce<Record<string, number>>((counts, test) => {
    const category = categoryOf(test.category);
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
}

function missingQuota(quota: Record<Category, number>, tests: GeneratedTest[]) {
  const counts = countsOf(tests);
  return Object.fromEntries(CATEGORIES.map((category) => [category, Math.max(0, quota[category] - (counts[category] || 0))])) as Record<Category, number>;
}

function normalizeCandidate(test: GeneratedTest): GeneratedTest | null {
  const input = test.input.replace(/\r\n/g, "\n");
  const output = test.output.replace(/\r\n/g, "\n");
  if (validateInput(input, MAX_EXPANDED_CHARS)) return null;
  if (/\b(?:todo|placeholder|unknown|omitted|same as above)\b|省略|同上|略/i.test(input) || /\.{3}|…/.test(input)) return null;
  if (output.length > MAX_EXPANDED_CHARS || /\b(?:todo|placeholder|unknown|omitted|same as above)\b|省略|同上/i.test(output)) return null;
  return {
    input: input.endsWith("\n") ? input : `${input}\n`,
    output: output && !output.endsWith("\n") ? `${output}\n` : output,
    category: categoryOf(test.category),
    scale: Math.max(1, Math.floor(Number(test.scale) || input.trim().split(/\s+/).length)),
    targets: String(test.targets || "检查常见边界与错误算法").slice(0, 240),
    reason: String(test.reason || "依据题目约束生成").slice(0, 320),
  };
}

function enforceCategoryEvidence(test: GeneratedTest, profile: ProblemProfile): GeneratedTest {
  if (test.category !== "performance") return test;
  const minimumScale = profile.stressScale > 1 ? Math.max(2, Math.floor(profile.stressScale * 0.5)) : 2;
  const namesSlowAlgorithm = /O\s*\(|brute|quadratic|exponential|timeout|TLE|暴力|枚举|超时|复杂度/i.test(`${test.targets} ${test.reason}`);
  if (test.scale >= minimumScale && namesSlowAlgorithm) return test;
  return {
    ...test,
    category: "ordinary",
    reason: `${test.reason}; performance label downgraded because scale/complexity evidence was insufficient`,
  };
}

function selectByQuota(candidates: GeneratedTest[], target: number, quota: Record<Category, number>) {
  const selected: GeneratedTest[] = [];
  const used = new Set<string>();
  const take = (category?: Category, limit = target) => {
    for (const test of candidates) {
      if (selected.length >= target || limit <= 0) break;
      if (category && test.category !== category) continue;
      const key = canonicalKey(test.input);
      if (used.has(key)) continue;
      used.add(key);
      selected.push(test);
      limit -= 1;
    }
  };
  for (const category of CATEGORIES) take(category, quota[category]);
  take(undefined, target);
  return selected;
}

function batchPrompt(args: {
  problemDigest: string;
  requested: number;
  quota: Record<Category, number>;
  accepted: GeneratedTest[];
  existing: GeneratedTest[];
  profile: ProblemProfile;
  hasReference: boolean;
  first: boolean;
  generationContext: string;
  auditedCaseIds: Set<string>;
}) {
  const exactOutput = args.hasReference
    ? "Output may be omitted only when necessary; a validated C++ reference program will recompute it."
    : "Every case MUST contain the exact non-empty output. Compute it carefully; no draft or explanation is accepted.";
  const partsRule = args.hasReference
    ? "Large cases may use inputParts or a generator."
    : "For large cases, use lossless inputParts/outputParts with literal/repeat/cycle/range parts instead of ellipsis; both must expand to exact data.";
  return [
    "You are the test-data engineer of a serious C++17 online judge. Return one JSON object only, without Markdown.",
    args.first ? `First classify the problem in profile, then generate exactly ${args.requested} NEW cases.` : `Continue the previous batch and generate exactly ${args.requested} NEW cases. Do not repeat earlier inputs.`,
    `Required remaining category mix: ${JSON.stringify(args.quota)}. Categories are boundary, special, ordinary, adversarial, performance.`,
    "Schema: {\"profile\":{\"family\":\"array|string|graph|tree|dp|math|geometry|simulation|other\",\"inputShape\":\"exact concise grammar\",\"acceptedComplexity\":\"O(...)\",\"spaceComplexity\":\"O(...)\",\"rejectedAlgorithms\":[\"...\"],\"coverageRisks\":[\"...\"],\"stressScale\":1},\"audits\":[{\"caseId\":\"C1\",\"valid\":true,\"correctedOutput\":\"only when the previous output is wrong\"}],\"tests\":[{\"input\":\"complete stdin\",\"output\":\"exact stdout\",\"category\":\"ordinary\",\"scale\":1,\"targets\":\"specific bug/algorithm killed\",\"reason\":\"why this data exposes it\"}]}",
    "Compressed field alternative: replace input with inputParts and/or output with outputParts. Each parts item is {type:'literal',value:'...'}, {type:'repeat',value:'...',count:1,separator:' '}, {type:'cycle',values:['1','2'],count:1,separator:' '}, or {type:'range',start:1,end:10,step:1,separator:' '}. Use valid JSON double quotes.",
    exactOutput,
    partsRule,
    "A performance case must be near the legal maximum and large enough to time out the rejected brute-force complexity. Its targets must name that complexity.",
    "Use the exact input grammar, testcase count, indexing, value ranges, and output rules. Never use ..., ellipsis, omitted data, pseudo-data, comments in stdin, or invented fields.",
    !args.first && !args.hasReference ? `Re-check these earlier small cases. Return one audit per listed case; set valid=false for an invalid input and correctedOutput when its expected output is wrong: ${JSON.stringify(auditSummary(args.accepted, args.auditedCaseIds))}` : "",
    `Current profile: ${JSON.stringify(args.profile)}`,
    args.generationContext ? `User batch context: ${args.generationContext}` : "",
    `Already accepted cases (avoid and broaden coverage): ${JSON.stringify(testSummary([...args.existing, ...args.accepted]))}`,
    `Problem:\n${args.problemDigest}`,
  ].filter(Boolean).join("\n\n");
}

let cppLanguageId: number | null = null;

/** Test-only: clear the memoized Judge0 language id so fetch stubs take effect. */
export function __resetLanguageCacheForTests() { cppLanguageId = null; }

async function getCppLanguageId() {
  if (cppLanguageId !== null) return cppLanguageId;
  const response = await fetch("https://ce.judge0.com/languages", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("Cannot read the Judge0 C++ compiler list.");
  const languages = await response.json() as Array<{ id: number; name: string }>;
  const cpp = languages.find((item) => item.name.includes("C++ (GCC 14"))
    || languages.find((item) => item.name.includes("C++ (GCC 9"))
    || languages.find((item) => item.name.includes("C++"));
  if (!cpp) throw new Error("No C++ compiler is available.");
  cppLanguageId = cpp.id;
  return cppLanguageId;
}

export async function generateComplexityAwareTests(options: {
  apiKey: string;
  endpoint: string;
  model: string;
  problem: Record<string, unknown>;
  count: number;
  referenceSolution?: string;
  validatedRef?: ValidatedReference;
}) {
  const startedAt = Date.now();
  const overallDeadline = startedAt + Math.max(AI_TIMEOUT_MS, GENERATION_BUDGET_MS);
  const target = Math.max(1, Math.min(50, Math.floor(options.count || 12)));
  const quota = buildCategoryQuota(target);
  const chatUrl = validateEndpoint(options.endpoint);
  const isDeepSeek = /(^|\.)api\.deepseek\.com$/i.test(chatUrl.hostname);
  const referenceSolution = options.referenceSolution || options.validatedRef?.solutionCode || "";
  const hasReference = Boolean(referenceSolution.trim());
  const warnings: string[] = [];
  const problemDigest = compactProblem(options.problem);
  const generationContext = String(options.problem.generationContext || "").slice(0, 1200);
  const rawExisting = Array.isArray(options.problem.samples) ? options.problem.samples : [];
  const existing = rawExisting.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const sample = item as Record<string, unknown>;
    const input = String(sample.input || "");
    if (!input.trim()) return [];
    return [{ input, output: String(sample.output || ""), category: categoryOf(String(sample.category || "ordinary")), scale: Number(sample.scale) || 1, targets: "existing sample", reason: "already stored" } as GeneratedTest];
  });

  async function callAi(messages: Array<{ role: string; content: string }>, requested: number) {
    const remaining = overallDeadline - Date.now();
    if (remaining < 2_000) throw new Error("Generation time budget exhausted.");
    const perCallTimeout = Math.max(1_500, Math.min(PER_CALL_TIMEOUT_CAP_MS, remaining));
    const body: Record<string, unknown> = {
      model: options.model,
      temperature: 0.04,
      max_tokens: Math.min(8000, Math.max(1800, 900 + requested * 480)),
      stream: false,
      response_format: { type: "json_object" },
      messages,
    };
    if (isDeepSeek) body.thinking = { type: "disabled" };
    const send = async () => fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(perCallTimeout),
    });
    let response = await send();
    if (!response.ok && (response.status === 400 || response.status === 422)) {
      delete body.response_format;
      response = await send();
    }
    const envelope = await response.text();
    let data: UpstreamData;
    try { data = JSON.parse(envelope) as UpstreamData; } catch { throw new Error(`AI service returned an invalid HTTP response (${response.status}).`); }
    if (!response.ok) throw new Error(data.error?.message || `Upstream AI request failed (HTTP ${response.status}).`);
    const content = data.choices?.[0]?.message?.content || "";
    if (!content.trim()) throw new Error("AI returned an empty response.");
    return content;
  }

  const candidates: GeneratedTest[] = [];
  const fingerprints = new Set(existing.map((test) => canonicalKey(test.input)));
  let profile: ProblemProfile = options.validatedRef ? {
    ...EMPTY_PROFILE,
    acceptedComplexity: options.validatedRef.expectedTimeComplexity,
    spaceComplexity: options.validatedRef.expectedSpaceComplexity,
    rejectedAlgorithms: ["brute-force reference"],
  } : EMPTY_PROFILE;
  let previousRaw = "";
  let batches = 0;
  let stagnant = 0;
  const auditedCases = new Set<string>();
  const maxAttempts = Math.min(10, Math.max(4, Math.ceil(target / 6) + 2));

  // Run a single AI generation batch: prompt, parse, dedupe, append. Returns
  // how many brand-new candidates were accepted. Shared by the main generation
  // loop and the reference backfill loop.
  async function runBatch(requested: number, gaps: Record<Category, number>): Promise<number> {
    const prompt = batchPrompt({ problemDigest, requested, quota: gaps, accepted: candidates, existing, profile, hasReference, first: batches === 0, generationContext, auditedCaseIds: auditedCases });
    const messages = previousRaw
      ? [{ role: "assistant", content: previousRaw.slice(-14_000) }, { role: "user", content: prompt }]
      : [{ role: "system", content: prompt }, { role: "user", content: "Generate the first usable batch now." }];
    batches += 1;
    try {
      const raw = await callAi(messages, requested);
      profile = profileFrom(raw, profile);
      if (!hasReference) {
        const audits = jsonObject(raw)?.audits;
        if (Array.isArray(audits)) {
          const rejectedIndexes: number[] = [];
          for (const audit of audits) {
            if (!audit || typeof audit !== "object") continue;
            const record = audit as Record<string, unknown>;
            const match = String(record.caseId || "").match(/^C(\d+)$/i);
            if (!match) continue;
            const index = Number(match[1]) - 1;
            if (!Number.isInteger(index) || index < 0 || index >= candidates.length) continue;
            auditedCases.add(String(record.caseId).toUpperCase());
            if (record.valid === false) {
              rejectedIndexes.push(index);
              continue;
            }
            const correctedOutput = String(record.correctedOutput || "");
            if (correctedOutput.trim()) {
              candidates[index] = { ...candidates[index], output: correctedOutput.endsWith("\n") ? correctedOutput : `${correctedOutput}\n` };
            }
          }
          for (const index of rejectedIndexes.sort((a, b) => b - a)) {
            fingerprints.delete(canonicalKey(candidates[index].input));
            candidates.splice(index, 1);
          }
        }
      }
      const parsed = parseGeneratedTests(raw);
      let added = 0;
      for (const rawTest of parsed) {
        const normalized = normalizeCandidate(rawTest);
        if (!normalized || (!hasReference && !normalized.output.trim())) continue;
        const test = enforceCategoryEvidence(normalized, profile);
        const key = canonicalKey(test.input);
        if (fingerprints.has(key)) continue;
        fingerprints.add(key);
        candidates.push(test);
        added += 1;
      }
      previousRaw = raw;
      stagnant = added ? 0 : stagnant + 1;
      if (!added) warnings.push(`batch ${batches} returned no new valid cases`);
      return added;
    } catch (error) {
      stagnant += 1;
      warnings.push(`batch ${batches} failed: ${error instanceof Error ? error.message : String(error)}`);
      previousRaw = "";
      return 0;
    }
  }

  const stillNeedsCases = () => candidates.length < target || Object.values(missingQuota(quota, candidates)).some((value) => value > 0);
  while (stillNeedsCases() && batches < maxAttempts && stagnant < 3 && Date.now() < overallDeadline - 1_500) {
    const remainingCount = Math.max(0, target - candidates.length);
    const gaps = missingQuota(quota, candidates);
    const missingCategories = Object.values(gaps).reduce((sum, value) => sum + value, 0);
    const baseRequest = Math.max(remainingCount, missingCategories);
    // First batch is capped small: a huge single request hits max_tokens and the
    // truncated JSON wastes the whole round-trip. Later batches over-ask slightly.
    const requested = batches === 0
      ? Math.min(FIRST_BATCH_CAP, Math.max(1, baseRequest))
      : Math.min(FIRST_BATCH_CAP, Math.max(1, Math.ceil(baseRequest * 1.2)));
    await runBatch(requested, gaps);
  }

  let selected: GeneratedTest[];
  let computedCount = 0;
  if (hasReference) {
    let languageId: number | null = null;
    try {
      languageId = await getCppLanguageId();
    } catch (error) {
      warnings.push(`reference verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (languageId === null) {
      // Cannot reach the compiler — keep whatever draft outputs exist. Filter to
      // output-bearing candidates BEFORE quota selection so selection fills up to
      // target from the usable subset instead of selecting-then-truncating.
      selected = selectByQuota(candidates.filter((test) => test.output.trim()), target, quota);
    } else {
      const lang = languageId;
      const verified: GeneratedTest[] = [];
      const usedKeys = new Set<string>();
      const verify = async (pool: GeneratedTest[]) => {
        if (verified.length >= target) return;
        // Collect fresh, de-duplicated cases from the pool, capped to ~2x what we
        // still need so a few reference rejections can be absorbed in one round
        // without over-submitting the whole candidate set.
        const pending: Array<{ test: GeneratedTest; key: string }> = [];
        const seen = new Set<string>();
        const cap = Math.max(1, (target - verified.length) * 2);
        for (const test of pool) {
          if (pending.length >= cap) break;
          const key = canonicalKey(test.input);
          if (usedKeys.has(key) || seen.has(key)) continue;
          seen.add(key);
          pending.push({ test, key });
        }
        // Run Judge0 for the whole pending set concurrently, preserving order.
        const results = await mapConcurrent(pending, REFERENCE_VERIFY_CONCURRENCY, async ({ test }) => {
          try { return await judge0Submit(referenceSolution, test.input, lang); }
          catch { return null; }
        });
        // Accept in pool (quota-priority) order, up to the target.
        for (let i = 0; i < pending.length; i++) {
          if (verified.length >= target) break;
          const result = results[i];
          if (!result || !result.accepted) continue;
          usedKeys.add(pending[i].key);
          verified.push({ ...pending[i].test, output: result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n` });
          computedCount += 1;
        }
      };

      // Verify in quota-priority order first, then the rest of the pool.
      await verify(selectByQuota(candidates, target, quota));
      if (verified.length < target) await verify(candidates);

      // Backfill: reference verification may drop malformed inputs, so keep
      // generating and verifying fresh cases until we reach the exact target.
      let backfillAttempts = 0;
      let backfillStagnant = 0;
      while (verified.length < target && backfillAttempts < maxAttempts && backfillStagnant < 2 && Date.now() < overallDeadline - 2_000) {
        const before = candidates.length;
        const gaps = missingQuota(quota, verified);
        const need = target - verified.length;
        const missingCategories = Object.values(gaps).reduce((sum, value) => sum + value, 0);
        const requested = Math.min(12, Math.max(1, Math.ceil(Math.max(need, missingCategories) * 1.2)));
        await runBatch(requested, gaps);
        backfillAttempts += 1;
        if (candidates.length > before) {
          const fresh = candidates.slice(before);
          // Verify still-missing categories first so a valid quota-filling case
          // is not starved by an earlier-listed case that reaches the target.
          await verify(selectByQuota(fresh, need, gaps));
          await verify(fresh);
          backfillStagnant = 0;
        } else {
          backfillStagnant += 1;
        }
      }
      selected = verified;
    }
  } else {
    selected = selectByQuota(candidates, target, quota);

    // Count self-check: the main loop can bail early (stagnation / attempt
    // budget) with fewer than `target` usable cases. Make dedicated backfill
    // attempts with a fresh budget that chase the missing count until we hit
    // the target or genuinely run out of new material.
    let fillAttempts = 0;
    let fillStagnant = 0;
    while (selected.length < target && fillAttempts < maxAttempts && fillStagnant < 3 && Date.now() < overallDeadline - 1_500) {
      const before = candidates.length;
      const gaps = missingQuota(quota, candidates);
      const need = target - candidates.length;
      const missingCategories = Object.values(gaps).reduce((sum, value) => sum + value, 0);
      const requested = Math.min(20, Math.max(1, Math.ceil(Math.max(need, missingCategories) * 1.2)));
      await runBatch(requested, gaps);
      fillAttempts += 1;
      fillStagnant = candidates.length > before ? 0 : fillStagnant + 1;
      selected = selectByQuota(candidates, target, quota);
    }
  }

  // Final count self-check: if we still could not reach the target, say so
  // explicitly so the caller/UI surfaces the shortfall instead of silently
  // returning fewer test points.
  if (selected.length < target) {
    warnings.unshift(`只生成了 ${selected.length}/${target} 个测试点：模型未能提供更多不重复的有效数据，可再次点击继续补足。`);
  }

  const categoryCounts = countsOf(selected);
  const unmetQuota = missingQuota(quota, selected);
  const draftOutputCount = selected.filter((test) => !test.output.trim()).length;
  // When a reference was expected but nothing was actually verified (e.g. the
  // compiler was unreachable), the outputs are unverified AI drafts — do not
  // report reference-grade trust.
  const referenceExpectedButUnverified = hasReference && computedCount === 0;
  const qualityOk = selected.length === target
    && draftOutputCount === 0
    && Object.values(unmetQuota).every((value) => value === 0)
    && !referenceExpectedButUnverified;
  const report: GenerationReport = {
    expectedTimeComplexity: profile.acceptedComplexity,
    expectedSpaceComplexity: profile.spaceComplexity,
    stressScale: profile.stressScale,
    performanceCount: categoryCounts.performance || 0,
    adversarialCount: categoryCounts.adversarial || 0,
    requestedCount: target,
    generatedCount: selected.length,
    partial: !qualityOk,
    computedCount,
    referenceValidated: hasReference && computedCount === selected.length && selected.length > 0,
    draftOutputCount,
    categoryQuota: quota,
    categoryCounts,
    unmetQuota,
    qualityOk,
    verificationMode: hasReference && computedCount > 0 ? "validated_reference" : auditedCases.size ? "ai_cross_batch" : "ai_structured",
    auditedCount: auditedCases.size,
    batches,
    elapsedMs: Date.now() - startedAt,
    profile,
    warnings: warnings.slice(0, 8),
  };
  if (!selected.length) throw new Error(warnings[0] || "AI did not return any complete, parseable test cases.");
  return { tests: selected, report };
}
