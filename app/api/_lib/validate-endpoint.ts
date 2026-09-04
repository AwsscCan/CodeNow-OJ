import type { AiWireApi } from "../../server/ai/ai-settings-repository";

export function validateEndpoint(raw: string, wireApi: AiWireApi = "chat_completions") {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("API Endpoint 格式无效");
  }
  if (url.protocol !== "https:") throw new Error("API Endpoint 必须使用 HTTPS");
  const host = url.hostname.toLowerCase();
  if (isBlockedHost(host)) throw new Error(`不安全的 API Endpoint：${host}。请使用公网 HTTPS OpenAI-compatible API 地址`);
  const path = url.pathname.replace(/\/+$/, "");
  const suffix = wireApi === "responses" ? "responses" : wireApi === "anthropic" ? "messages" : "chat/completions";
  url.pathname = new RegExp(`/${suffix.replace("/", "\\/")}$`, "i").test(path) ? path : `${path}/${suffix}`;
  return url;
}

function isBlockedHost(host: string) {
  if (!host) return true;
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isPrivateIpv4(host);
  if (host === "::1" || host.startsWith("[") || host.includes(":")) return true;
  return false;
}

function isPrivateIpv4(host: string) {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a === 0;
}
