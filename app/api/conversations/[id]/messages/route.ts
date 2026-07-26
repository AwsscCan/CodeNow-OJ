import { apiError, privateNoStore, readJson } from "../../../../server/problems/problem-api-context";
import { resolveConversationContext, type ResolveConversationContext } from "../../route";

function failure(result: { status: number; code: string; message: string; currentVersion?: number; updatedAt?: string }) {
  return apiError(result.status, result.code, result.message, undefined, { currentVersion: result.currentVersion, updatedAt: result.updatedAt });
}

export function createConversationMessageHandlers(resolveContext: ResolveConversationContext = resolveConversationContext) {
  return {
    GET: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const url = new URL(request.url);
      const cursorValue = url.searchParams.get("cursor");
      const cursor = cursorValue === null ? null : Number(cursorValue);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      const result = await context.repository.listMessages(context.userId, id, cursor, limit);
      return result.ok ? Response.json(result.value, { headers: privateNoStore }) : failure(result);
    },
    POST: async (request: Request, id: string) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
      if (!idempotencyKey || idempotencyKey.length > 200) return apiError(400, "IDEMPOTENCY_KEY_REQUIRED", "需要有效的 Idempotency-Key");
      const contentLength = Number(request.headers.get("Content-Length") ?? 0);
      if (contentLength > 70 * 1024) return apiError(413, "REQUEST_TOO_LARGE", "请求正文过大");
      const body = await readJson(request);
      if (!body) return apiError(400, "INVALID_JSON", "请求正文必须是 JSON 对象");
      const result = await context.repository.appendMessage(context.userId, id, body, idempotencyKey);
      return result.ok ? Response.json(result.value, { status: 201, headers: privateNoStore }) : failure(result);
    },
  };
}

const handlers = createConversationMessageHandlers();
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) => handlers.GET(request, (await context.params).id);
export const POST = async (request: Request, context: { params: Promise<{ id: string }> }) => handlers.POST(request, (await context.params).id);
