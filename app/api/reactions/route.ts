import { apiError, privateNoStore, readJson, resolveReactionContext, type ResolveReactionContext } from "../../server/notes/note-api-context";

export function createReactionsHandlers(resolveContext: ResolveReactionContext = resolveReactionContext) {
  async function toggle(request: Request, active: boolean) {
    const context = await resolveContext(request);
    if (!context.userId) return apiError(401, "AUTH_REQUIRED", "请先登录");
    const params = new URL(request.url).searchParams;
    const body = active ? await readJson(request) : null;
    const noteId = active ? body?.noteId : params.get("noteId");
    const kind = active ? body?.kind : params.get("kind");
    if (typeof noteId !== "string" || !noteId) return apiError(400, "INVALID_REQUEST", "需要 noteId");
    if (active && body && "userId" in body) return apiError(400, "CLIENT_USER_ID_FORBIDDEN", "不能指定 userId");
    const result = await context.repository.set(context.userId, noteId, kind, active);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.value, { headers: privateNoStore });
  }
  return {
    GET: async (request: Request) => {
      const context = await resolveContext(request);
      const noteId = new URL(request.url).searchParams.get("noteId");
      if (!noteId) return apiError(400, "INVALID_REQUEST", "需要 noteId");
      if (!context.userId) return Response.json({ viewerLiked: false, viewerFavorited: false }, { headers: privateNoStore });
      const state = await context.repository.viewerState(context.userId, noteId);
      return Response.json(state, { headers: privateNoStore });
    },
    POST: (request: Request) => toggle(request, true),
    DELETE: (request: Request) => toggle(request, false),
  };
}

const handlers = createReactionsHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
