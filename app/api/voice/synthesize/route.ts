import { getRuntimeServices, type RuntimeServices } from "../../../lib/auth";

const MAX_TEXT_LENGTH = 1_200;
const VALID_MOODS = new Set(["teasing", "gentle", "proud", "serious", "encouraging", "surprised", "playful"]);
const SAFE_PRESET = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type ResolveVoiceServices = (request: Request) => Promise<Pick<RuntimeServices, "auth" | "voiceService">>;

function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function readSynthesisPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const mood = typeof input.mood === "string" ? input.mood : "";
  const preset = input.preset === undefined ? "takagi" : input.preset;
  const speed = input.speed === undefined ? undefined : input.speed;

  if (!text || text.length > MAX_TEXT_LENGTH || !VALID_MOODS.has(mood)
    || typeof preset !== "string" || !SAFE_PRESET.test(preset)
    || (speed !== undefined && (typeof speed !== "number" || !Number.isFinite(speed) || speed < 0.7 || speed > 1.4))) {
    return null;
  }

  return { text, mood, preset, ...(speed === undefined ? {} : { speed }) };
}

function synthesisUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.search || url.hash) return null;
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/tts`;
    return url.toString();
  } catch {
    return null;
  }
}

function isAudio(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.startsWith("audio/") || contentType === "application/octet-stream";
}

export function createVoiceSynthesisHandler(resolveServices: ResolveVoiceServices = getRuntimeServices) {
  return async (request: Request): Promise<Response> => {
    const services = await resolveServices(request);
    const session = await services.auth.api.getSession({ headers: request.headers });
    if (!session) return apiError(401, "AUTH_REQUIRED", "请先登录");

    const voiceService = services.voiceService;
    const upstream = voiceService && synthesisUrl(voiceService.url);
    if (!voiceService || !upstream) return apiError(503, "VOICE_UNAVAILABLE", "语音服务暂不可用");

    const payload = readSynthesisPayload(await request.json().catch(() => null));
    if (!payload) return apiError(400, "VOICE_INVALID_REQUEST", "语音内容或参数无效");

    try {
      const response = await fetch(upstream, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/*",
          Authorization: `Bearer ${voiceService.token}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok || !isAudio(response)) return apiError(502, "VOICE_UPSTREAM", "语音服务暂时无法生成音频");

      const headers = new Headers({ "Cache-Control": "private, no-store" });
      const contentType = response.headers.get("content-type");
      if (contentType) headers.set("content-type", contentType);
      return new Response(response.body, { status: 200, headers });
    } catch {
      return apiError(503, "VOICE_UNAVAILABLE", "语音服务暂不可用");
    }
  };
}

export const POST = createVoiceSynthesisHandler();
