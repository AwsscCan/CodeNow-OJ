import { getRuntimeServices } from "../../../lib/auth";
import { createDraftRepository, type DraftRepository } from "../../../server/problems/draft-repository";
import { apiError, privateNoStore, readJson } from "../../../server/problems/problem-api-context";

type DraftContext = { userId: string; repository: DraftRepository };
type ResolveDraftContext = (request: Request) => Promise<DraftContext | null>;

const resolveDraftContext: ResolveDraftContext = async (request) => {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  return session ? { userId: session.user.id, repository: createDraftRepository(services.db) } : null;
};

export function createDraftHandlers(resolveContext: ResolveDraftContext = resolveDraftContext) {
  return {
    GET: async (request: Request, problemRef: string) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const query = new URL(request.url).searchParams;
      const problemKind = query.get("problemKind") ?? "";
      const language = query.get("language") ?? "";
      if (!problemKind || !language) return apiError(400, "INVALID_DRAFT_KEY", "需要 problemKind 和 language");
      const draft = await context.repository.getDraft(context.userId, problemKind, problemRef, language);
      return draft ? Response.json({ draft, version: draft.version, updatedAt: draft.updatedAt }, { headers: privateNoStore }) : apiError(404, "DRAFT_NOT_FOUND", "草稿不存在");
    },
    PUT: async (request: Request, problemRef: string) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body || typeof body.problemKind !== "string" || typeof body.language !== "string" || typeof body.sourceCode !== "string" || typeof body.expectedVersion !== "number") {
        return apiError(400, "INVALID_DRAFT", "草稿字段不完整");
      }
      if ("userId" in body) return apiError(400, "CLIENT_USER_ID_FORBIDDEN", "不能指定 userId");
      const result = await context.repository.saveDraft(context.userId, {
        problemKind: body.problemKind as "public" | "private", problemRef, language: body.language, sourceCode: body.sourceCode,
      }, body.expectedVersion);
      if (!result.ok) return apiError(result.status, result.code, result.message);
      return Response.json({ draft: result.value, version: result.version, updatedAt: result.updatedAt }, { headers: privateNoStore });
    },
  };
}

const handlers = createDraftHandlers();
type RouteContext = { params: Promise<{ problemRef: string }> };
export async function GET(request: Request, context: RouteContext) { return handlers.GET(request, (await context.params).problemRef); }
export async function PUT(request: Request, context: RouteContext) { return handlers.PUT(request, (await context.params).problemRef); }
