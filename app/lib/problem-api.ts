export class ProblemApiError extends Error {
  constructor(public status: number, public code: string, message: string, public currentVersion?: number) { super(message); }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string; currentVersion?: number } } & T;
  if (!response.ok) throw new ProblemApiError(response.status, body.error?.code ?? "REQUEST_FAILED", body.error?.message ?? "Request failed", body.error?.currentVersion);
  return body;
}

const jsonHeaders = { "Content-Type": "application/json" };

export const ProblemApi = {
  list: (signal?: AbortSignal) => json<{ problems: CloudProblemSummary[]; nextCursor: string | null }>("/api/problems", { signal }),
  get: (id: string, signal?: AbortSignal) => json<{ problem: CloudProblem }>(`/api/problems/${encodeURIComponent(id)}`, { signal }),
  create: (problem: Record<string, unknown>, signal?: AbortSignal) => json<{ problem: CloudProblemSummary; version: number; updatedAt: string }>("/api/problems", { method: "POST", headers: jsonHeaders, body: JSON.stringify(problem), signal }),
  update: (id: string, version: number, patch: Record<string, unknown>, idempotencyKey: string, signal?: AbortSignal) => json<{ problem: CloudProblemSummary; version: number; updatedAt: string }>(`/api/problems/${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...jsonHeaders, "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ version, patch }), signal }),
  replaceTests: (id: string, version: number, testCases: CloudTestCaseInput[], idempotencyKey: string, signal?: AbortSignal) => json<{ testCases: unknown[]; version: number; updatedAt: string }>(`/api/problems/${encodeURIComponent(id)}/test-cases`, { method: "PUT", headers: { ...jsonHeaders, "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ version, testCases }), signal }),
  getDraft: (problemKind: string, problemRef: string, language: string, signal?: AbortSignal) => json<{ draft: { sourceCode: string }; version: number; updatedAt: string }>(`/api/drafts/${encodeURIComponent(problemRef)}?problemKind=${encodeURIComponent(problemKind)}&language=${encodeURIComponent(language)}`, { signal }),
  saveDraft: (problemKind: string, problemRef: string, language: string, sourceCode: string, expectedVersion: number, idempotencyKey: string, signal?: AbortSignal) => json<{ draft: { sourceCode: string }; version: number; updatedAt: string }>(`/api/drafts/${encodeURIComponent(problemRef)}`, { method: "PUT", headers: { ...jsonHeaders, "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ problemKind, language, sourceCode, expectedVersion }), signal }),
};

export type CloudProblemSummary = {
  id: string; problemCode: string; title: string; difficulty: "入门" | "普及" | "提高"; timeLimit: string; memoryLimit: string;
  description: string; inputFormat: string; outputFormat: string; folderId: string | null; version: number; updatedAt: string;
  sourceUrl?: string | null; extractionStatus?: "complete" | "needs_review" | null;
};
export type CloudProblem = CloudProblemSummary & { testCases: Array<{ id: string; input: string; expectedOutput: string; category?: string | null; scale?: number | null; targets?: string | null; reason?: string | null }> };
export type CloudTestCaseInput = { input: string; expectedOutput: string; category?: string; scale?: number; targets?: string; reason?: string };
