import { getRuntimeServices } from "../../../lib/auth";
import { createAiSettingsRepository } from "../../../server/ai/ai-settings-repository";
import { parseCcSwitchExport } from "../../../server/ai/ccswitch-import";
import { apiError, privateNoStore, readJson } from "../../../server/problems/problem-api-context";

export async function POST(request: Request) {
  const services = await getRuntimeServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "AUTH_REQUIRED", "请先登录");
  const body = await readJson(request);
  if (!body || typeof body.version !== "number" || !("config" in body)) return apiError(400, "INVALID_CCSWITCH_EXPORT", "CCSwitch 导入字段不完整");
  try {
    const imported = parseCcSwitchExport(body.config);
    const result = await createAiSettingsRepository(services.db, { secret: services.credentialSecret }).save(session.user.id, imported, body.version);
    if (!result.ok) return apiError(result.status, result.code, result.message, undefined, { currentVersion: result.currentVersion, updatedAt: result.updatedAt });
    return Response.json({ settings: result.value, models: imported.models }, { headers: privateNoStore });
  } catch (error) {
    return apiError(400, "INVALID_CCSWITCH_EXPORT", error instanceof Error ? error.message : "CCSwitch 导入失败");
  }
}
