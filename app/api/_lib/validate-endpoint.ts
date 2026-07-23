import { ALLOWED_AI_HOSTS } from "./constants";

export function validateEndpoint(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("API Endpoint 格式无效");
  }
  if (url.protocol !== "https:") throw new Error("API Endpoint 必须使用 HTTPS");
  const host = url.hostname.toLowerCase();
  const allowed = ALLOWED_AI_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  if (!allowed) throw new Error(`不支持的 API 服务商：${host}。支持：${ALLOWED_AI_HOSTS.join("、")}`);
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = /\/chat\/completions$/i.test(path) ? path : `${path}/chat/completions`;
  return url;
}
