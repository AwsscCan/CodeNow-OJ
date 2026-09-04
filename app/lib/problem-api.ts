export class ProblemApiError extends Error {
  constructor(public status: number, public code: string, message: string, public currentVersion?: number, public updatedAt?: string) { super(message); }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string; currentVersion?: number; updatedAt?: string } } & T;
  if (!response.ok) throw new ProblemApiError(response.status, body.error?.code ?? "REQUEST_FAILED", body.error?.message ?? "Request failed", body.error?.currentVersion, body.error?.updatedAt);
  return body;
}

const jsonHeaders = { "Content-Type": "application/json" };

export const ProblemApi = {
  list: (signal?: AbortSignal) => json<{ problems: CloudProblemSummary[]; nextCursor: string | null }>("/api/problems", { signal }),
  listDeleted: (signal?: AbortSignal) => json<{ problems: CloudProblemSummary[] }>("/api/problems?deleted=1", { signal }),
  get: (id: string, signal?: AbortSignal) => json<{ problem: CloudProblem }>(`/api/problems/${encodeURIComponent(id)}`, { signal }),
  create: (problem: Record<string, unknown>, signal?: AbortSignal) => json<{ problem: CloudProblemSummary; version: number; updatedAt: string }>("/api/problems", { method: "POST", headers: jsonHeaders, body: JSON.stringify(problem), signal }),
  update: (id: string, version: number, patch: Record<string, unknown>, idempotencyKey: string, signal?: AbortSignal) => json<{ problem: CloudProblemSummary; version: number; updatedAt: string }>(`/api/problems/${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...jsonHeaders, "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ version, patch }), signal }),
  replaceTests: (id: string, version: number, testCases: CloudTestCaseInput[], idempotencyKey: string, signal?: AbortSignal) => json<{ testCases: unknown[]; version: number; updatedAt: string }>(`/api/problems/${encodeURIComponent(id)}/test-cases`, { method: "PUT", headers: { ...jsonHeaders, "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ version, testCases }), signal }),
  remove: (id: string, version: number, signal?: AbortSignal) => json<{ deleted: { id: string }; version: number; updatedAt: string }>(`/api/problems/${encodeURIComponent(id)}`, { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ version }), signal }),
  restore: (id: string, version: number, signal?: AbortSignal) => json<{ problem: CloudProblemSummary; version: number; updatedAt: string }>(`/api/problems/${encodeURIComponent(id)}`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ version }), signal }),
  getDraft: (problemKind: string, problemRef: string, language: string, signal?: AbortSignal) => json<{ draft: { sourceCode: string }; version: number; updatedAt: string }>(`/api/drafts/${encodeURIComponent(problemRef)}?problemKind=${encodeURIComponent(problemKind)}&language=${encodeURIComponent(language)}`, { signal }),
  saveDraft: (problemKind: string, problemRef: string, language: string, sourceCode: string, expectedVersion: number, idempotencyKey: string, signal?: AbortSignal) => json<{ draft: { sourceCode: string }; version: number; updatedAt: string }>(`/api/drafts/${encodeURIComponent(problemRef)}`, { method: "PUT", headers: { ...jsonHeaders, "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ problemKind, language, sourceCode, expectedVersion }), signal }),
  listFolders: (signal?: AbortSignal) => json<{ folders: CloudFolder[] }>("/api/folders", { signal }),
  createFolder: (name: string, parentId: string | null, signal?: AbortSignal) => json<{ folder: CloudFolder }>("/api/folders", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ name, parentId }), signal }),
  updateFolder: (id: string, patch: { name?: string; parentId?: string | null; sortOrder?: number }, signal?: AbortSignal) => json<{ folder: CloudFolder }>("/api/folders", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ id, ...patch }), signal }),
  deleteFolder: (id: string, signal?: AbortSignal) => json<{ deleted: { id: string } }>(`/api/folders?id=${encodeURIComponent(id)}`, { method: "DELETE", signal }),
};

export type CloudProblemSummary = {
  id: string; problemCode: string; title: string; difficulty: "入门" | "普及" | "提高"; timeLimit: string; memoryLimit: string;
  description: string; inputFormat: string; outputFormat: string; folderId: string | null; version: number; updatedAt: string;
  deletedAt?: string | null;
  sourceUrl?: string | null; extractionStatus?: "complete" | "needs_review" | null;
};
export type CloudProblem = CloudProblemSummary & { testCases: Array<{ id: string; input: string; expectedOutput: string; category?: string | null; scale?: number | null; targets?: string | null; reason?: string | null }> };
export type CloudTestCaseInput = { input: string; expectedOutput: string; category?: string; scale?: number; targets?: string; reason?: string };
export type CloudFolder = { id: string; parentId: string | null; name: string; sortOrder?: number };

export function buildCloudFolderPaths(folders: CloudFolder[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const resolved = new Map<string, string | null>();

  function pathFor(id: string, visiting: Set<string>): string | null {
    if (resolved.has(id)) return resolved.get(id) ?? null;
    const folder = byId.get(id);
    if (!folder || visiting.has(id)) return null;
    if (!folder.parentId) {
      resolved.set(id, folder.name);
      return folder.name;
    }
    visiting.add(id);
    const parentPath = pathFor(folder.parentId, visiting);
    visiting.delete(id);
    const path = parentPath ? `${parentPath}/${folder.name}` : null;
    resolved.set(id, path);
    return path;
  }

  const paths: Record<string, string> = {};
  for (const folder of folders) {
    const path = pathFor(folder.id, new Set());
    if (path) paths[path] = folder.id;
  }
  return paths;
}
