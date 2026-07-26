import { apiError, privateNoStore, readJson, resolveNoteContext, type ResolveNoteContext } from "../../../server/notes/note-api-context";

export function createNoteDetailHandlers(resolveContext: ResolveNoteContext = resolveNoteContext) {
  return {
    GET: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const result = await context.repository.get(context.userId, id);
      if (!result.ok) return apiError(result.status, result.code, result.message);
      return Response.json({ note: result.value }, { headers: privateNoStore });
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
