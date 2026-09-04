import { getRuntimeServices } from "../../lib/auth";
import { createAiSettingsRepository, type AiProvider, type AiSettingsRepository } from "../../server/ai/ai-settings-repository";
import { apiError, privateNoStore, readJson } from "../../server/problems/problem-api-context";

type AiSettingsContext = { userId: string; repository: AiSettingsRepository };
type ResolveAiSettingsContext = (request: Request) => Promise<AiSettingsContext | null>;

const resolveAiSettingsContext: ResolveAiSettingsContext = async (request) => {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  return session ? {
    userId: session.user.id,
    repository: createAiSettingsRepository(services.db, { secret: services.credentialSecret }),
  } : null;
};

export function createAiSettingsHandlers(resolveContext: ResolveAiSettingsContext = resolveAiSettingsContext) {
  return {
    GET: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      return Response.json(await context.repository.get(context.userId), { headers: privateNoStore });
    },
    PUT: async (request: Request) => {
      const context = await resolveContext(request);
      if (!context) return apiError(401, "AUTH_REQUIRED", "请先登录");
      const body = await readJson(request);
      if (!body || typeof body.version !== "number" || typeof body.provider !== "string" || typeof body.endpoint !== "string" || typeof body.model !== "string") {
        return apiError(400, "INVALID_AI_SETTINGS", "AI 设置字段不完整");
      }
      const result = await context.repository.save(context.userId, {
        provider: body.provider as AiProvider,
        endpoint: body.endpoint,
        model: body.model,
        apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
        clearApiKey: body.clearApiKey === true,
        source: body.source === "ccswitch" ? "ccswitch" : "manual",
        wireApi: body.wireApi === "responses" || body.wireApi === "anthropic" ? body.wireApi : "chat_completions",
      }, body.version);
      if (!result.ok) return apiError(result.status, result.code, result.message, undefined, { currentVersion: result.currentVersion, updatedAt: result.updatedAt });
      return Response.json(result.value, { headers: privateNoStore });
    },
  };
}

const handlers = createAiSettingsHandlers();
export const GET = handlers.GET;
export const PUT = handlers.PUT;
