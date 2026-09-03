import type { AiProvider } from "./ai-settings-repository";

const providerHosts: Partial<Record<AiProvider, string>> = {
  deepseek: "api.deepseek.com",
  openai: "api.openai.com",
};

function isPrivateIpv4(host: string) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function validateAiEndpoint(raw: string, provider: AiProvider = "custom"): URL {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error("API Endpoint 格式无效"); }
  if (url.protocol !== "https:") throw new Error("API Endpoint 必须使用 HTTPS");
  if (url.username || url.password) throw new Error("API Endpoint 不允许包含凭据");
  if (url.port && url.port !== "443") throw new Error("API Endpoint 只允许 HTTPS 标准端口");
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" || host.includes(":") || (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isPrivateIpv4(host))) {
    throw new Error("不安全的 API Endpoint");
  }
  if (providerHosts[provider] && host !== providerHosts[provider]) throw new Error(`${provider} 必须使用官方 API Endpoint`);
  return url;
}

function modelsUrl(endpoint: string): URL {
  const url = validateAiEndpoint(endpoint);
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/chat\/completions$/i, "").replace(/\/responses$/i, "");
  url.pathname = `${path}/models`.replace(/\/+/g, "/");
  url.search = "";
  url.hash = "";
  return url;
}

function safeError(value: unknown, apiKey: string) {
  const raw = value instanceof Error ? value.message : String(value || "Unable to load models");
  return raw.replaceAll(apiKey, "[REDACTED]").replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]").slice(0, 300);
}

export async function discoverAiModels(
  settings: { endpoint: string; apiKey: string; configuredModel: string },
  fetcher: typeof fetch = fetch,
) {
  const url = modelsUrl(settings.endpoint);
  try {
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({})) as { data?: Array<{ id?: unknown }>; models?: Array<{ id?: unknown }>; error?: { message?: unknown } };
    if (!response.ok) throw new Error(typeof body.error?.message === "string" ? body.error.message : `Model service returned HTTP ${response.status}`);
    const found = (Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [])
      .flatMap((item) => typeof item?.id === "string" && item.id.trim() ? [item.id.trim()] : []);
    const models = [...new Set(found)].sort();
    if (settings.configuredModel.trim()) models.unshift(settings.configuredModel.trim());
    return { models: [...new Set(models)] };
  } catch (error) {
    throw new Error(safeError(error, settings.apiKey));
  }
}
