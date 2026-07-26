import { apiError, privateNoStore, readJson, resolveProblemContext, type ResolveProblemContext } from "../../../server/problems/problem-api-context";

export function createProblemDetailHandlers(resolveContext: ResolveProblemContext = resolveProblemContext) {
  return {
    GET: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const problem = await context.repository.getProblem(context.userId, id);
      return problem ? Response.json({ problem }, { headers: privateNoStore }) : apiError(404, "PROBLEM_NOT_FOUND", "题目不存在");
    },
    PATCH: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body || typeof body.version !== "number" || !body.patch || typeof body.patch !== "object") return apiError(400, "INVALID_REQUEST", "需要 version 和 patch");
      const patch = body.patch as Record<string, unknown>;
      if ("userId" in body || "userId" in patch) return apiError(400, "CLIENT_USER_ID_FORBIDDEN", "不能指定 userId");
      const result = await context.repository.updateProblem(context.userId, id, body.version, patch);
      if (!result.ok) return apiError(result.status, result.code, result.message, result.field);
      return Response.json({ problem: result.value, version: result.version, updatedAt: result.updatedAt }, { headers: privateNoStore });
    },
    DELETE: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      const queryVersion = Number(new URL(request.url).searchParams.get("version"));
      const version = typeof body?.version === "number" ? body.version : queryVersion;
      if (!Number.isInteger(version) || version < 1) return apiError(400, "INVALID_VERSION", "需要有效版本号");
      const result = await context.repository.softDeleteProblem(context.userId, id, version);
      if (!result.ok) return apiError(result.status, result.code, result.message, result.field);
      return Response.json({ deleted: result.value, version: result.version, updatedAt: result.updatedAt }, { headers: privateNoStore });
    },
  };
}

const handlers = createProblemDetailHandlers();
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: RouteContext) { return handlers.GET(request, (await context.params).id); }
export async function PATCH(request: Request, context: RouteContext) { return handlers.PATCH(request, (await context.params).id); }
export async function DELETE(request: Request, context: RouteContext) { return handlers.DELETE(request, (await context.params).id); }

