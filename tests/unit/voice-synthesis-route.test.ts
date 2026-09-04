import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceSynthesisHandler, type ResolveVoiceServices } from "../../app/api/voice/synthesize/route";
import { createVoiceStatusHandler } from "../../app/api/voice/status/route";

function request(body: Record<string, unknown>): Request {
  return new Request("https://codenowoj.xyz/api/voice/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function services(session: unknown, voiceService = { url: "https://voice.codenowoj.xyz", token: "tunnel-token" }): ResolveVoiceServices {
  return async () => ({
    auth: { api: { getSession: vi.fn().mockResolvedValue(session) } },
    voiceService,
  }) as never;
}

afterEach(() => vi.restoreAllMocks());

describe("POST /api/voice/synthesize", () => {
  it("requires a signed-in user before contacting the voice tunnel", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const handler = createVoiceSynthesisHandler(services(null));

    const response = await handler(request({ text: "你好", mood: "gentle" }));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the fixed tunnel URL and never forwards a browser-supplied service URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("audio", {
      headers: { "Content-Type": "audio/wav" },
    }));
    const handler = createVoiceSynthesisHandler(services({ user: { id: "user-1" } }));

    const response = await handler(request({
      text: "通过测试了。",
      mood: "gentle",
      preset: "takagi",
      serviceUrl: "https://attacker.example",
    }));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://voice.codenowoj.xyz/tts", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer tunnel-token" }),
    }));
    const payload = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(payload).toEqual({ text: "通过测试了。", mood: "gentle", preset: "takagi" });
  });
});

describe("GET /api/voice/status", () => {
  it("requires a signed-in user", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const handler = createVoiceStatusHandler(services(null));
    const response = await handler(new Request("https://codenowoj.xyz/api/voice/status"));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the server voice health endpoint without exposing credentials", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, upstreamReady: true }), {
      headers: { "Content-Type": "application/json" },
    }));
    const handler = createVoiceStatusHandler(services({ user: { id: "user-1" } }));
    const response = await handler(new Request("https://codenowoj.xyz/api/voice/status"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ configured: true, reachable: true });
    expect(fetchMock).toHaveBeenCalledWith("https://voice.codenowoj.xyz/health", expect.objectContaining({
      headers: { Accept: "application/json", Authorization: "Bearer tunnel-token" },
    }));
  });
});
