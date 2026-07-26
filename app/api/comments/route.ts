import { apiError, privateNoStore, readJson, resolveCommentContext, type ResolveCommentContext } from "../../server/notes/note-api-context";

export function createCommentsHandlers(resolveContext: ResolveCommentContext = resolveCommentContext) {
  return {
    POST: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context.userId) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
      if (!idempotencyKey || idempotencyKey.length > 200) return apiError(400, "IDEMPOTENCY_KEY_REQUIRED", "缺少幂等键");
      const body = await readJson(request);
      if (!body || typeof body.noteId !== "string") return apiError(400, "INVALID_REQUEST", "需要 noteId");
      if ("userId" in body) return apiError(400, "CLIENT_USER_ID_FORBIDDEN", "不能指定 userId");
      const result = await context.repository.create(context.userId, body.noteId, body, idempotencyKey);
      if (!result.ok) return apiError(result.status, result.code, result.message, result.field);
      return Response.json({ comment: result.value }, { status: 201, headers: privateNoStore });
    },
  };
}

const handlers = createCommentsHandlers();
export const POST = handlers.POST;
