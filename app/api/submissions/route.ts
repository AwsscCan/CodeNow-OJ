import { createSubmissionRepository, type NewSubmission, type SubmissionRepository } from "../../../db";
import { getRuntimeServices } from "../../lib/auth";
import { MAX_SUBMISSION_SOURCE_LENGTH } from "../_lib/constants";
import { rateLimit } from "../_lib/rate-limit";

type SubmissionContext = { userId: string; repository: SubmissionRepository };
type ResolveContext = (request: Request) => Promise<SubmissionContext | null>;

function error(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

async function resolveRuntimeContext(request: Request): Promise<SubmissionContext | null> {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return {
    userId: session.user.id,
    repository: createSubmissionRepository(services.db),
  };
}

function normalizeInput(data: Record<string, unknown>): NewSubmission {
  const statuses = new Set(["AC", "WA", "RE", "CE", "TLE"]);
  const results = Array.isArray(data.results) ? data.results.slice(0, 100).flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const status = String(item.status ?? "");
    const duration = Number(item.duration);
    if (!statuses.has(status) || !Number.isFinite(duration) || duration < 0) return [];
    return [{
      id: Number.isFinite(Number(item.id)) ? Number(item.id) : index + 1,
      status: status as "AC" | "WA" | "RE" | "CE" | "TLE",
      actual: String(item.actual ?? "").slice(0, 20_000),
      expected: String(item.expected ?? "").slice(0, 20_000),
      duration: Math.round(duration),
    }];
  }) : [];
  const totalDuration = Number(data.totalDurationMs);
  return {
    problemId: String(data.problemId ?? "").trim(),
    problemTitle: String(data.problemTitle ?? "").trim(),
    status: String(data.status ?? "").trim(),
    passed: String(data.passed ?? "").trim(),
    sourceCode: typeof data.sourceCode === "string" ? data.sourceCode : "",
    results,
    totalDurationMs: Number.isFinite(totalDuration) && totalDuration >= 0 ? Math.round(totalDuration) : null,
  };
}

export function createSubmissionHandlers(resolveContext: ResolveContext = resolveRuntimeContext) {
  return {
    GET: async (request: Request) => {
      const rl = rateLimit(request, "submissions");
      if (!rl.allowed) return error("RATE_LIMITED", "请求过于频繁，请稍后重试", 429);
      const context = await resolveContext(request);
      if (!context) return error("AUTH_REQUIRED", "请先登录", 401);
      const problemId = new URL(request.url).searchParams.get("problemId")?.trim() || undefined;
      const history = await context.repository.listSubmissions(context.userId, problemId);
      return Response.json({ history }, { headers: { "Cache-Control": "private, no-store" } });
    },

    POST: async (request: Request) => {
      const rl = rateLimit(request, "submissions");
      if (!rl.allowed) return error("RATE_LIMITED", "请求过于频繁，请稍后重试", 429);
      const context = await resolveContext(request);
      if (!context) return error("AUTH_REQUIRED", "请先登录", 401);
      const input = normalizeInput(await request.json() as Record<string, unknown>);
      if (!input.problemId || !input.problemTitle || !input.status || !input.passed || !input.sourceCode) {
        return error("INVALID_SUBMISSION", "提交记录字段不完整", 400);
      }
      if (input.sourceCode.length > MAX_SUBMISSION_SOURCE_LENGTH) {
        return error("SOURCE_TOO_LARGE", "提交代码过长", 413);
      }
      const record = await context.repository.createSubmission(context.userId, input);
      return Response.json({ record }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    },

    DELETE: async (request: Request) => {
      const rl = rateLimit(request, "submissions");
      if (!rl.allowed) return error("RATE_LIMITED", "请求过于频繁，请稍后重试", 429);
      const context = await resolveContext(request);
      if (!context) return error("AUTH_REQUIRED", "请先登录", 401);
      const id = new URL(request.url).searchParams.get("id")?.trim();
      if (!id) return error("MISSING_ID", "缺少记录编号", 400);
      const deleted = await context.repository.deleteSubmission(context.userId, id);
      if (!deleted) return error("NOT_FOUND", "提交记录不存在", 404);
      return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
    },
  };
}

const handlers = createSubmissionHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
