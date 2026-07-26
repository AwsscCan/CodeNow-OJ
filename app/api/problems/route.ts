import { apiError, privateNoStore, readJson, resolveProblemContext, type ResolveProblemContext } from "../../server/problems/problem-api-context";

export function createProblemsHandlers(resolveContext: ResolveProblemContext = resolveProblemContext) {
  return {
    GET: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
      const result = await context.repository.listProblems(context.userId, cursor);
      return Response.json({ problems: result.items, nextCursor: result.nextCursor }, { headers: privateNoStore });
    },
    POST: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body) return apiError(400, "INVALID_JSON", "请求正文必须是 JSON 对象");
      if ("userId" in body) return apiError(400, "CLIENT_USER_ID_FORBIDDEN", "不能指定 userId");
      const result = await context.repository.createProblem(context.userId, body as never);
      if (!result.ok) return apiError(result.status, result.code, result.message, result.field);
      return Response.json({ problem: result.value, version: result.version, updatedAt: result.updatedAt }, { status: 201, headers: privateNoStore });
    },
  };
}

const handlers = createProblemsHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;

