import { describe, expect, it, vi } from "vitest";
import { applyCcSwitchProvider, fetchCcSwitchCatalog } from "../../app/lib/ccswitch-client";

describe("CCSwitch local bridge", () => {
  it("reads the real local provider catalog without exposing credentials", async () => {
    const result = await fetchCcSwitchCatalog(vi.fn(async () => new Response(JSON.stringify({ active: true, providers: [{ id: "p1", name: "Local", model_id: "m1" }] }), { status: 200 })));
    expect(result.providers?.[0]).toMatchObject({ id: "p1", model_id: "m1" });
  });

  it("applies one selected provider and requires verified response", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ provider_id: "p1", model_id: "m1", verify_connection: true, sync_account: true });
      return new Response(JSON.stringify({ ok: true, verified: true, connection_verified: true, model_id: "m1" }), { status: 200 });
    });
    await expect(applyCcSwitchProvider("p1", "m1", "codex", fetcher)).resolves.toMatchObject({ verified: true });
    expect(fetcher.mock.calls[0][0]).toContain("cc-switch-codex-apply");
  });

  it("discovers a Modex backend on the fallback port", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes(":18088/")) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ active: true, providers: [{ id: "p2", name: "Fallback", model_id: "m2" }] }), { status: 200 });
    });
    await expect(fetchCcSwitchCatalog(fetcher)).resolves.toMatchObject({ providers: [{ id: "p2" }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
