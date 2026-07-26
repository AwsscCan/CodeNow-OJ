import { apiError, privateNoStore, readJson, resolveProblemContext, type ResolveProblemContext } from "../../server/problems/problem-api-context";

export function createFolderHandlers(resolveContext: ResolveProblemContext = resolveProblemContext) {
  return {
    GET: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      return Response.json({ folders: await context.repository.listFolders(context.userId) }, { headers: privateNoStore });
    },
    POST: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body) return apiError(400, "INVALID_JSON", "请求正文必须是 JSON 对象");
      if ("userId" in body) return apiError(400, "CLIENT_USER_ID_FORBIDDEN", "不能指定 userId");
      const result = await context.repository.createFolder(context.userId, body);
      if (!result.ok) return apiError(result.status, result.code, result.message);
      return Response.json({ folder: result.value }, { status: 201, headers: privateNoStore });
    },
    PATCH: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body || typeof body.id !== "string") return apiError(400, "INVALID_REQUEST", "需要文件夹 id");
      if ("userId" in body) return apiError(400, "CLIENT_USER_ID_FORBIDDEN", "不能指定 userId");
      const result = await context.repository.updateFolder(context.userId, body.id, body);
      if (!result.ok) return apiError(result.status, result.code, result.message);
      return Response.json({ folder: result.value }, { headers: privateNoStore });
    },
    DELETE: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const id = new URL(request.url).searchParams.get("id");
      if (!id) return apiError(400, "MISSING_ID", "缺少文件夹 id");
      const result = await context.repository.deleteFolder(context.userId, id);
      if (!result.ok) return apiError(result.status, result.code, result.message);
      return Response.json({ deleted: result.value }, { headers: privateNoStore });
    },
  };
}

const handlers = createFolderHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
