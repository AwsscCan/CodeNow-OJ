import { getRuntimeServices } from "../../../lib/auth";
import { createAiSettingsRepository } from "../../../server/ai/ai-settings-repository";
import { discoverAiModels } from "../../../server/ai/model-discovery";
import { apiError, privateNoStore } from "../../../server/problems/problem-api-context";

export async function POST(request: Request) {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "AUTH_REQUIRED", "请先登录");
  const settings = await createAiSettingsRepository(services.db, { secret: services.credentialSecret }).resolve(session.user.id);
  if (!settings) return apiError(400, "AI_NOT_CONFIGURED", "请先保存 AI 设置");
  try {
    return Response.json(await discoverAiModels({ endpoint: settings.endpoint, apiKey: settings.apiKey, configuredModel: settings.model, wireApi: settings.wireApi }), { headers: privateNoStore });
  } catch (error) {
    return apiError(502, "MODEL_DISCOVERY_FAILED", error instanceof Error ? error.message : "无法拉取模型");
  }
}
