import { apiError, privateNoStore, readJson, resolveProblemContext, type ResolveProblemContext } from "../../../../server/problems/problem-api-context";

export function createTestCaseHandlers(resolveContext: ResolveProblemContext = resolveProblemContext) {
  return {
    PUT: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body || typeof body.version !== "number" || !Array.isArray(body.testCases)) return apiError(400, "INVALID_REQUEST", "需要 version 和 testCases");
      if ("userId" in body || body.testCases.some((item) => item && typeof item === "object" && "userId" in item)) return apiError(400, "CLIENT_USER_ID_FORBIDDEN", "不能指定 userId");
      const result = await context.repository.replaceTestCases(context.userId, id, body.version, body.testCases);
      if (!result.ok) return apiError(result.status, result.code, result.message, result.field, { currentVersion: result.currentVersion, updatedAt: result.updatedAt });
      return Response.json({ testCases: result.value, version: result.version, updatedAt: result.updatedAt }, { headers: privateNoStore });
    },
  };
}

const handlers = createTestCaseHandlers();
type RouteContext = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: RouteContext) { return handlers.PUT(request, (await context.params).id); }
