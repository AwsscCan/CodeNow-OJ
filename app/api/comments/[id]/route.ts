import { apiError, privateNoStore, resolveCommentContext, type ResolveCommentContext } from "../../../server/notes/note-api-context";

export function createCommentDetailHandlers(resolveContext: ResolveCommentContext = resolveCommentContext) {
  return {
    DELETE: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      if (!context.userId) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const result = await context.repository.remove(context.userId, id);
      if (!result.ok) return apiError(result.status, result.code, result.message);
      return Response.json({ deleted: result.value }, { headers: privateNoStore });
    },
  };
}

const handlers = createCommentDetailHandlers();
type RouteContext = { params: Promise<{ id: string }> };
export async function DELETE(request: Request, context: RouteContext) { return handlers.DELETE(request, (await context.params).id); }
