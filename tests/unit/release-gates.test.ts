import { describe, expect, it, vi } from "vitest";
import { releaseCloudflare, smokeWorker } from "../../scripts/release-cloudflare.mjs";

function label(command: string, args: string[]) { return [command, ...args].join(" "); }

describe("Cloudflare release gates", () => {
  it("smoke-tests the account AI settings routes as authenticated APIs", async () => {
    const requests: Request[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/")) return new Response("ok", { status: 200 });
      if (request.url.includes("/api/auth/sign-up/email")) return new Response("", { status: 404 });
      if (request.url.includes("/api/admin/users")) return new Response("", { status: 404, headers: { "cache-control": "private, no-store" } });
      return new Response(JSON.stringify({ error: { code: "AUTH_REQUIRED" } }), { status: 401 });
    }));

    await expect(smokeWorker("https://example.test")).resolves.toBe(true);
    expect(requests.filter((request) => request.url.includes("/api/ai-settings")).map((request) => request.method))
      .toEqual(["GET", "POST", "POST"]);
    vi.unstubAllGlobals();
  });

  it("builds the current worker before any remote release operation", async () => {
    const calls: string[] = [];
    const run = vi.fn(async (command: string, args: string[]) => {
      calls.push(label(command, args));
    });

    await releaseCloudflare({ target: "preview", run, smokePreview: async () => true });

    const buildIndex = calls.findIndex((value) => value === "npm run build");
    const backupIndex = calls.findIndex((value) => value.includes("d1 export") && value.includes("--env preview"));
    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeLessThan(backupIndex);
  });

  it("backs up before migration and prevents production after preview failure", async () => {
    const calls: string[] = [];
    const run = vi.fn(async (command: string, args: string[]) => {
      const value = label(command, args); calls.push(value);
      if (value.includes("wrangler deploy dist/server/index.js") && value.includes("--env preview")) throw new Error("preview failed");
    });
    await expect(releaseCloudflare({ target: "production", run, smokePreview: vi.fn() })).rejects.toThrow("preview failed");
    expect(calls.findIndex((value) => value.includes("d1 export") && value.includes("--env preview")))
      .toBeLessThan(calls.findIndex((value) => value.includes("migrations apply") && value.includes("--env preview")));
    expect(calls.some((value) => value.includes("--env production"))).toBe(false);
  });

  it("requires a successful preview smoke before production commands", async () => {
    const calls: string[] = [];
    const run = vi.fn(async (command: string, args: string[]) => { calls.push(label(command, args)); });
    await expect(releaseCloudflare({ target: "production", run, smokePreview: async () => false })).rejects.toThrow(/smoke/i);
    expect(calls.some((value) => value.includes("--env production"))).toBe(false);

    calls.length = 0;
    await releaseCloudflare({ target: "production", run, smokePreview: async () => true });
    expect(calls.some((value) => value.includes("wrangler deploy dist/server/index.js --config wrangler.jsonc --env production --assets dist/client --no-bundle"))).toBe(true);
  });
});
