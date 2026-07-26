import { getRuntimeServices } from "../../lib/auth";
import { createPreferenceRepository, type PreferenceRepository } from "../../server/preferences/preference-repository";
import { apiError, privateNoStore, readJson } from "../../server/problems/problem-api-context";

type PreferenceContext = { userId: string; repository: PreferenceRepository };
type ResolvePreferenceContext = (request: Request) => Promise<PreferenceContext | null>;

const resolvePreferenceContext: ResolvePreferenceContext = async (request) => {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  return session ? { userId: session.user.id, repository: createPreferenceRepository(services.db) } : null;
};

export function createPreferenceHandlers(resolveContext: ResolvePreferenceContext = resolvePreferenceContext) {
  return {
    GET: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      return Response.json(await context.repository.get(context.userId), { headers: privateNoStore });
    },
    PATCH: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body) return apiError(400, "INVALID_JSON", "请求正文必须是 JSON 对象");
      const result = await context.repository.patch(context.userId, body);
      if (!result.ok) return apiError(result.status, result.code, result.message, undefined, {
        currentVersion: result.currentVersion,
        updatedAt: result.updatedAt,
      });
      return Response.json(result.value, { headers: privateNoStore });
    },
  };
}

const handlers = createPreferenceHandlers();
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;

