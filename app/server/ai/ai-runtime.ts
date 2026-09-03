import { getRuntimeServices } from "../../lib/auth";
import { createAiSettingsRepository, type RuntimeAiSettings } from "./ai-settings-repository";

export type AiRuntimeResolution =
  | { ok: true; config: RuntimeAiSettings }
  | { ok: false; status: 401 | 400; code: "AUTH_REQUIRED" | "AI_NOT_CONFIGURED"; message: string };

export async function resolveAiRuntime(request: Request): Promise<AiRuntimeResolution> {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  if (!session) return { ok: false, status: 401, code: "AUTH_REQUIRED", message: "请先登录" };
  const repository = createAiSettingsRepository(services.db, { secret: services.credentialSecret });
  const config = await repository.resolve(session.user.id);
  return config
    ? { ok: true, config }
    : { ok: false, status: 400, code: "AI_NOT_CONFIGURED", message: "请先在设置中配置 AI 服务" };
}
