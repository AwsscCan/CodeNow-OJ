import { apiError, privateNoStore, resolveNoteContext, type ResolveNoteContext } from "../../server/notes/note-api-context";

export function createTagsHandlers(resolveContext: ResolveNoteContext = resolveNoteContext) {
  return {
    GET: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const tags = await context.repository.listTags(context.userId);
      return Response.json({ tags }, { headers: privateNoStore });
    },
  };
}

const handlers = createTagsHandlers();
export const GET = handlers.GET;
