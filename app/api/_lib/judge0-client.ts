// Shared Judge0 client: base64 codec, language lookup, and the batch/single
// submit + adaptive-poll kernel. Consumed by the judge route (and reusable by
// any server path that talks to Judge0) so polling/backoff logic lives in one place.

import {
  JUDGE0_BASE,
  JUDGE_BACKOFF_MS,
  JUDGE_BATCH_SIZE,
  JUDGE_MAX_POLLS,
  JUDGE_POLL_BUDGET_MS,
} from "./constants";

export type Judge0Status = { id: number; description?: string };
export type Judge0Result = {
  token?: string;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  status: Judge0Status;
};

export type SubmissionPayload = {
  language_id: number;
  source_code: string;
  stdin: string;
  expected_output?: string;
  cpu_time_limit: number;
  wall_time_limit: number;
  memory_limit: number;
};

export type PollOptions = {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  budgetMs?: number;
  maxPolls?: number;
  backoff?: readonly number[];
};

export class BatchUnsupportedError extends Error {
  constructor(message = "Judge0 batch endpoint is unavailable") {
    super(message);
    this.name = "BatchUnsupportedError";
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

export function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

export function decode(value?: string | null): string {
  if (!value) return "";
  const clean = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return "";
  return Buffer.from(clean, "base64").toString("utf8");
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const defaultNow = () => Date.now();

function resolvePoll(options: PollOptions) {
  return {
    sleep: options.sleep ?? defaultSleep,
    now: options.now ?? defaultNow,
    budgetMs: options.budgetMs ?? JUDGE_POLL_BUDGET_MS,
    maxPolls: options.maxPolls ?? JUDGE_MAX_POLLS,
    backoff: options.backoff ?? JUDGE_BACKOFF_MS,
  };
}

function backoffAt(backoff: readonly number[], attempt: number): number {
  return backoff[Math.min(attempt, backoff.length - 1)];
}

// 429/5xx are transient on the shared public instance — retry, honouring Retry-After.
function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

async function safeText(response: Response): Promise<string> {
  try { return await response.text(); } catch { return ""; }
}

// ── Language id (shared cache) ──
let cachedCppLanguageId: number | null = null;
export function __resetLanguageCacheForTests(): void { cachedCppLanguageId = null; }

export async function getCppLanguageId(): Promise<number> {
  if (cachedCppLanguageId !== null) return cachedCppLanguageId;
  const response = await fetch(`${JUDGE0_BASE}/languages`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error("无法读取 C++ 编译器列表");
  const languages = await response.json() as { id: number; name: string }[];
  const preferred = languages.find((item) => item.name.includes("C++ (GCC 14"))
    || languages.find((item) => item.name.includes("C++ (GCC 13"))
    || languages.find((item) => item.name.includes("C++ (GCC 12"))
    || languages.find((item) => item.name.includes("C++ (GCC 9"))
    || languages.find((item) => item.name.includes("C++"));
  if (!preferred) throw new Error("判题服务没有可用的 C++ 编译器");
  cachedCppLanguageId = preferred.id;
  return preferred.id;
}

// ── Batch create ──
let batchSupported: boolean | null = null;
export function __resetBatchSupportForTests(): void { batchSupported = null; }

/**
 * 批量创建判题任务。按 JUDGE_BATCH_SIZE 分块 POST /submissions/batch，
 * 返回与输入严格位置对齐的数组：成功项 {token}，字段错误项 {error}（无 token）。
 * batch 端点不可用（404 / 含 batch 的 400）时置标志并抛 BatchUnsupportedError 供上层回退。
 */
export async function createBatch(submissions: SubmissionPayload[]): Promise<Array<{ token?: string; error?: unknown }>> {
  if (batchSupported === false) throw new BatchUnsupportedError();
  const out: Array<{ token?: string; error?: unknown }> = new Array(submissions.length);
  let offset = 0;
  for (const group of chunk(submissions, JUDGE_BATCH_SIZE)) {
    const response = await fetch(`${JUDGE0_BASE}/submissions/batch?base64_encoded=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ submissions: group }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404 || (response.status === 400 && /batch/i.test(await safeText(response)))) {
      batchSupported = false;
      throw new BatchUnsupportedError();
    }
    if (!response.ok) throw new Error("批量创建判题任务失败");
    const items = await response.json() as Array<Record<string, unknown>>;
    for (let i = 0; i < group.length; i += 1) {
      const item = items[i];
      const token = item && typeof item.token === "string" ? item.token : undefined;
      out[offset + i] = token ? { token } : { error: item ?? { error: "missing submission" } };
    }
    batchSupported = true;
    offset += group.length;
  }
  return out;
}

/**
 * 批量轮询：对 tokens 按 JUDGE_BATCH_SIZE 分块 GET /submissions/batch?tokens=，
 * 逐 token 收敛（终态落入结果 Map 并从后续轮询剔除），自适应退避，
 * 429/5xx 退避重试而不失败整批，累计耗时达预算即停。返回 token→结果 的 Map。
 */
export async function pollBatchUntilDone(tokens: string[], fields: string, options: PollOptions = {}): Promise<Map<string, Judge0Result>> {
  const { sleep, now, budgetMs, maxPolls, backoff } = resolvePoll(options);
  const fieldSpec = fields.split(",").includes("token") ? fields : `${fields},token`;
  const results = new Map<string, Judge0Result>();
  let pending = Array.from(new Set(tokens));
  const start = now();
  let attempt = 0;
  let extraDelay = 0;

  while (pending.length && attempt < maxPolls && now() - start < budgetMs) {
    await sleep(Math.max(backoffAt(backoff, attempt), extraDelay));
    extraDelay = 0;
    attempt += 1;

    const stillPending: string[] = [];
    for (const group of chunk(pending, JUDGE_BATCH_SIZE)) {
      const url = `${JUDGE0_BASE}/submissions/batch?tokens=${group.join(",")}&base64_encoded=true&fields=${fieldSpec}`;
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.status === 429 || response.status >= 500) {
        extraDelay = Math.max(extraDelay, retryAfterMs(response));
        stillPending.push(...group);
        continue;
      }
      if (!response.ok) throw new Error("读取判题结果失败");
      const data = await response.json() as { submissions?: Judge0Result[] };
      const seen = new Set<string>();
      for (const submission of data.submissions ?? []) {
        if (!submission.token) continue;
        seen.add(submission.token);
        if (submission.status && submission.status.id > 2) results.set(submission.token, submission);
        else stillPending.push(submission.token);
      }
      for (const token of group) if (!seen.has(token)) stillPending.push(token);
    }
    pending = stillPending;
  }
  return results;
}

/** 单条轮询：创建后的 fallback 与其他调用点复用，退避/429/预算逻辑与批量一致。 */
export async function pollSingleUntilDone(token: string, fields: string, options: PollOptions = {}): Promise<Judge0Result | null> {
  const { sleep, now, budgetMs, maxPolls, backoff } = resolvePoll(options);
  const start = now();
  let attempt = 0;
  let extraDelay = 0;

  while (attempt < maxPolls && now() - start < budgetMs) {
    await sleep(Math.max(backoffAt(backoff, attempt), extraDelay));
    extraDelay = 0;
    attempt += 1;
    const response = await fetch(`${JUDGE0_BASE}/submissions/${token}?base64_encoded=true&fields=${fields}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (response.status === 429 || response.status >= 500) { extraDelay = retryAfterMs(response); continue; }
    if (!response.ok) throw new Error("读取判题结果失败");
    const result = await response.json() as Judge0Result;
    if (result.status && result.status.id > 2) return result;
  }
  return null;
}

/** 单条提交 + 轮询（fallback 路径）。超时返回 null，由调用方按位回填。 */
export async function submitSingle(payload: SubmissionPayload, fields: string, options: PollOptions = {}): Promise<Judge0Result | null> {
  const create = await fetch(`${JUDGE0_BASE}/submissions?base64_encoded=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const created = await create.json() as { token?: string; error?: string };
  if (!create.ok || !created.token) throw new Error(created.error || "提交进入判题队列失败");
  return pollSingleUntilDone(created.token, fields, options);
}
