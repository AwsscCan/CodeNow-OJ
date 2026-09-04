import type { AiSettingsInput } from "./ai-settings-repository";

type ImportedCcSwitchSettings = AiSettingsInput & { source: "ccswitch"; models: string[] };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return object(value);
  try { return object(JSON.parse(value)); } catch { return null; }
}

function tomlValue(config: string, key: string): string {
  return config.match(new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, "m"))?.[1]?.trim() ?? "";
}

function fromCodex(root: Record<string, unknown>): ImportedCcSwitchSettings | null {
  const codex = object(root.codex);
  const providers = object(codex?.providers);
  const current = typeof codex?.current === "string" ? codex.current : "";
  const selected = object(providers?.[current]);
  const settings = object(selected?.settingsConfig) ?? object(selected?.settings_config);
  const auth = object(settings?.auth);
  const config = typeof settings?.config === "string" ? settings.config : "";
  const endpoint = tomlValue(config, "base_url");
  const model = tomlValue(config, "model");
  const wireApi = tomlValue(config, "wire_api") === "responses" ? "responses" as const : "chat_completions" as const;
  const apiKey = typeof auth?.OPENAI_API_KEY === "string" ? auth.OPENAI_API_KEY : "";
  if (!endpoint || !model || !apiKey) return null;
  return { provider: "ccswitch", endpoint, model, apiKey, source: "ccswitch", wireApi, models: [model] };
}

function fromRows(root: Record<string, unknown>): ImportedCcSwitchSettings | null {
  if (!Array.isArray(root.providers)) return null;
  const row = root.providers.map(object).find((item) => item && (item.is_current === 1 || item.isCurrent === true)) ?? root.providers.map(object).find(Boolean);
  if (!row) return null;
  const settings = parseJsonObject(row.settings_config ?? row.settingsConfig);
  const env = object(settings?.env);
  const endpoint = typeof env?.ANTHROPIC_BASE_URL === "string" ? env.ANTHROPIC_BASE_URL : "";
  const apiKey = typeof env?.ANTHROPIC_AUTH_TOKEN === "string" ? env.ANTHROPIC_AUTH_TOKEN : typeof env?.ANTHROPIC_API_KEY === "string" ? env.ANTHROPIC_API_KEY : "";
  const modelKeys = ["ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME"];
  const models = [...new Set(modelKeys.flatMap((key) => typeof env?.[key] === "string" && String(env[key]).trim() ? [String(env[key]).trim()] : []))];
  if (!endpoint || !apiKey || !models.length) return null;
  const providerType = String(row.app_type ?? row.appType ?? row.kind ?? "").toLowerCase();
  const wireApi = providerType === "claude" || Boolean(env?.ANTHROPIC_BASE_URL || env?.ANTHROPIC_AUTH_TOKEN || env?.ANTHROPIC_API_KEY)
    ? "anthropic" as const
    : "chat_completions" as const;
  return { provider: "ccswitch", endpoint, model: models[0], apiKey, source: "ccswitch", wireApi, models };
}

export function parseCcSwitchExport(value: unknown): ImportedCcSwitchSettings {
  const root = object(value);
  const result = root && (fromCodex(root) ?? fromRows(root));
  if (!result) throw new Error("CCSwitch 导出中没有可用的当前 Provider");
  return result;
}
