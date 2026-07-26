import {
  apiError, privateNoStore, publicNoStore, readJson,
  resolveNoteContext, resolvePublicRepository,
  type ResolveNoteContext, type ResolvePublicRepository,
} from "../../../server/notes/note-api-context";

export function createNoteDetailHandlers(
  resolveContext: ResolveNoteContext = resolveNoteContext,
  resolvePublicRepo: ResolvePublicRepository = resolvePublicRepository,
) {
  return {
    GET: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      if (context) {
        const result = await context.repository.get(context.userId, id);
        if (result.ok) return Response.json({ note: result.value }, { headers: privateNoStore });
      }
      // 非作者或游客：回退到公开读，仅命中已发布可见的公开笔记，否则统一 404。
      const publicRepository = await resolvePublicRepo(request);
      const note = await publicRepository.readPublic(id);
      return note ? Response.json({ note }, { headers: publicNoStore }) : apiError(404, "NOTE_NOT_FOUND", "笔记不存在");
    },
    PATCH: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body) return apiError(400, "INVALID_JSON", "请求正文必须是 JSON 对象");
      if ("userId" in body) return apiError(400, "CLIENT_USER_ID_FORBIDDEN", "不能指定 userId");
      const result = await context.repository.update(context.userId, id, body.version, body);
      if (!result.ok) return apiError(result.status, result.code, result.message, result.field, { currentVersion: result.currentVersion, updatedAt: result.updatedAt });
      return Response.json({ note: result.value, version: result.version, updatedAt: result.updatedAt }, { headers: privateNoStore });
    },
    DELETE: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      const queryVersion = Number(new URL(request.url).searchParams.get("version"));
      const version = typeof body?.version === "number" ? body.version : queryVersion;
      if (!Number.isInteger(version) || version < 1) return apiError(400, "INVALID_VERSION", "需要有效版本号");
      const result = await context.repository.softDelete(context.userId, id, version);
      if (!result.ok) return apiError(result.status, result.code, result.message, result.field, { currentVersion: result.currentVersion, updatedAt: result.updatedAt });
      return Response.json({ deleted: result.value, version: result.version, updatedAt: result.updatedAt }, { headers: privateNoStore });
    },
  };
}

const handlers = createNoteDetailHandlers();
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: RouteContext) { return handlers.GET(request, (await context.params).id); }
export async function PATCH(request: Request, context: RouteContext) { return handlers.PATCH(request, (await context.params).id); }
export async function DELETE(request: Request, context: RouteContext) { return handlers.DELETE(request, (await context.params).id); }
