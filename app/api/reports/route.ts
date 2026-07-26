import { apiError, privateNoStore, readJson, resolveReportContext, type ResolveReportContext } from "../../server/notes/note-api-context";

export function createReportsHandlers(resolveContext: ResolveReportContext = resolveReportContext) {
  return {
    POST: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context.userId) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body) return apiError(400, "INVALID_JSON", "请求正文必须是 JSON 对象");
      if ("userId" in body) return apiError(400, "CLIENT_USER_ID_FORBIDDEN", "不能指定 userId");
      const result = await context.repository.create(context.userId, body.targetKind, body.targetId, body.reason);
      if (!result.ok) return apiError(result.status, result.code, result.message, result.field);
      return Response.json(result.value, { status: 201, headers: privateNoStore });
    },
  };
}

const handlers = createReportsHandlers();
export const POST = handlers.POST;
