import { getRuntimeServices } from "../../lib/auth";
import { createConversationRepository, type ConversationRepository } from "../../server/conversations/conversation-repository";
import { apiError, privateNoStore, readJson } from "../../server/problems/problem-api-context";

type ConversationContext = { userId: string; repository: ConversationRepository };
export type ResolveConversationContext = (request: Request) => Promise<ConversationContext | null>;

export const resolveConversationContext: ResolveConversationContext = async (request) => {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  return session ? { userId: session.user.id, repository: createConversationRepository(services.db) } : null;
};

function failure(result: { status: number; code: string; message: string; currentVersion?: number; updatedAt?: string }) {
  return apiError(result.status, result.code, result.message, undefined, { currentVersion: result.currentVersion, updatedAt: result.updatedAt });
}
export function createConversationHandlers(resolveContext: ResolveConversationContext = resolveConversationContext) {
  return {
    GET: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get("limit") ?? 50);
      return Response.json(await context.repository.list(context.userId, url.searchParams.get("cursor"), limit), { headers: privateNoStore });
    },
    POST: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body) return apiError(400, "INVALID_JSON", "请求正文必须是 JSON 对象");
      const result = await context.repository.create(context.userId, body);
      return result.ok ? Response.json({ conversation: result.value }, { status: 201, headers: privateNoStore }) : failure(result);
    },
    PATCH: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body || typeof body.id !== "string") return apiError(400, "INVALID_REQUEST", "需要会话 id");
      if (Object.keys(body).some((key) => key !== "id" && key !== "version" && key !== "title")) return apiError(400, "INVALID_REQUEST", "会话字段无效");
      const result = await context.repository.updateTitle(context.userId, body.id, body.version, body.title);
      return result.ok ? Response.json({ conversation: result.value }, { headers: privateNoStore }) : failure(result);
    },
    DELETE: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const id = new URL(request.url).searchParams.get("id");
      if (!id) return apiError(400, "MISSING_ID", "缺少会话 id");
      const result = await context.repository.delete(context.userId, id);
      return result.ok ? Response.json({ deleted: result.value }, { headers: privateNoStore }) : failure(result);
    },
  };
}

const handlers = createConversationHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
