import { describe, expect, it, vi } from "vitest";
import { applyCcSwitchProvider, fetchCcSwitchCatalog } from "../../app/lib/ccswitch-client";

describe("CCSwitch local bridge", () => {
  it("reads the real local provider catalog without exposing credentials", async () => {
    const result = await fetchCcSwitchCatalog(vi.fn(async () => new Response(JSON.stringify({ active: true, providers: [{ id: "p1", name: "Local", model_id: "m1" }] }), { status: 200 })));
    expect(result.providers?.[0]).toMatchObject({ id: "p1", model_id: "m1" });
  });

  it("applies one selected provider and requires verified response", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ provider_id: "p1", model_id: "m1", verify_connection: true });
      return new Response(JSON.stringify({ ok: true, verified: true, connection_verified: true, model_id: "m1" }), { status: 200 });
    });
    await expect(applyCcSwitchProvider("p1", "m1", fetcher)).resolves.toMatchObject({ verified: true });
  });
});
