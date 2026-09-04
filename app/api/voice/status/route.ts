import { getRuntimeServices, type RuntimeServices } from "../../../lib/auth";

export type ResolveVoiceStatusServices = (request: Request) => Promise<Pick<RuntimeServices, "auth" | "voiceService">>;

function response(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function healthUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.search || url.hash) return null;
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/health`;
    return url.toString();
  } catch {
    return null;
  }
}

export function createVoiceStatusHandler(resolveServices: ResolveVoiceStatusServices = getRuntimeServices) {
  return async function GET(request: Request) {
  const services = await resolveServices(request);
  const session = await services.auth.api.getSession({ headers: request.headers });
  if (!session) return response(401, { error: { code: "AUTH_REQUIRED", message: "请先登录" } });

  const voiceService = services.voiceService;
  const url = voiceService && healthUrl(voiceService.url);
  if (!voiceService || !url) return response(200, { configured: false, reachable: false, message: "未配置云端语音服务" });

  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${voiceService.token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const body = await upstream.json().catch(() => ({})) as { ok?: boolean; upstreamReady?: boolean };
    const reachable = upstream.ok && body.ok !== false && body.upstreamReady !== false;
    return response(200, { configured: true, reachable, message: reachable ? "云端语音服务正常" : "云端语音服务未就绪" });
  } catch {
    return response(200, { configured: true, reachable: false, message: "云端语音服务暂时不可达" });
  }
  };
}

export const GET = createVoiceStatusHandler();
