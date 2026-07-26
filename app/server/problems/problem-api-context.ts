import { getRuntimeServices } from "../../lib/auth";
import { createProblemRepository, type ProblemRepository } from "./problem-repository";

export type ProblemContext = { userId: string; repository: ProblemRepository };
export type ResolveProblemContext = (request: Request) => Promise<ProblemContext | null>;

export const resolveProblemContext: ResolveProblemContext = async (request) => {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return { userId: session.user.id, repository: createProblemRepository(services.db) };
};

export const privateNoStore = { "Cache-Control": "private, no-store" };

export function apiError(status: number, code: string, message: string, field?: string) {
  return Response.json({ error: { code, message, ...(field ? { field } : {}) } }, { status, headers: privateNoStore });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

export function resultResponse(result: { ok: boolean; status?: number; code?: string; message?: string; field?: string }, successStatus = 200) {
  if (!result.ok) return apiError(result.status ?? 400, result.code ?? "INVALID_REQUEST", result.message ?? "Invalid request", result.field);
  return Response.json(result, { status: successStatus, headers: privateNoStore });
}

