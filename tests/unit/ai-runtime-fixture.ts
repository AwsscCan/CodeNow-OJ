import type { AiRuntimeResolution } from "../../app/server/ai/ai-runtime";

export const TEST_AI_CONFIG = {
  provider: "custom" as const,
  endpoint: "https://example.com/v1",
  model: "test-model",
  apiKey: "server-side-test-key",
  source: "manual" as const,
  wireApi: "chat_completions" as const,
};

export async function resolveTestAiConfig(): Promise<AiRuntimeResolution> {
  return { ok: true, config: TEST_AI_CONFIG };
}

export async function resolveMissingAiConfig(): Promise<AiRuntimeResolution> {
  return { ok: false, status: 400, code: "AI_NOT_CONFIGURED", message: "请先在设置中配置 AI 服务" };
}
