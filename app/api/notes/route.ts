import {
  apiError, privateNoStore, publicNoStore, readJson,
  resolveNoteContext, resolvePublicRepository,
  type ResolveNoteContext, type ResolvePublicRepository,
} from "../../server/notes/note-api-context";

export function createNotesHandlers(
  resolveContext: ResolveNoteContext = resolveNoteContext,
  resolvePublicRepo: ResolvePublicRepository = resolvePublicRepository,
) {
  return {
    GET: async (request: Request) => {
      const params = new URL(request.url).searchParams;
      const view = params.get("view") ?? "mine";
      if (view === "public") {
        const repository = await resolvePublicRepo(request);
        const result = await repository.listPublic({
          cursor: params.get("cursor"),
          problemRef: params.get("problemRef"),
          requestedLimit: Number(params.get("limit") ?? 50),
        });
        return Response.json(result, { headers: publicNoStore });
      }
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const result = await context.repository.list(context.userId, {
        cursor: params.get("cursor"),
        problemRef: params.get("problemRef"),
        problemKind: params.get("problemKind"),
        visibility: params.get("visibility"),
        requestedLimit: Number(params.get("limit") ?? 50),
      });
      return Response.json(result, { headers: privateNoStore });
    },
    POST: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body) return apiError(400, "INVALID_JSON", "请求正文必须是 JSON 对象");
      if ("userId" in body) return apiError(400, "CLIENT_USER_ID_FORBIDDEN", "不能指定 userId");
      const result = await context.repository.create(context.userId, body);
      if (!result.ok) return apiError(result.status, result.code, result.message, result.field);
      return Response.json({ note: result.value, version: result.version, updatedAt: result.updatedAt }, { status: 201, headers: privateNoStore });
    },
  };
}

const handlers = createNotesHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
