import { apiError, publicNoStore, resolveCommentContext, type ResolveCommentContext } from "../../../../server/notes/note-api-context";

export function createNoteCommentsHandlers(resolveContext: ResolveCommentContext = resolveCommentContext) {
  return {
    GET: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      const cursor = new URL(request.url).searchParams.get("cursor");
      const result = await context.repository.listByNote(id, cursor);
      if (!result.ok) return apiError(result.status, result.code, result.message);
      return Response.json(result.value, { headers: publicNoStore });
    },
  };
}

const handlers = createNoteCommentsHandlers();
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: RouteContext) { return handlers.GET(request, (await context.params).id); }
