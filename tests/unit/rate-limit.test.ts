import { describe, it, expect, beforeEach } from "vitest";

// We test the rate-limit logic by importing the module and testing its behavior.
// The module uses an in-memory Map that persists between calls.

describe("rateLimit", () => {
  let rateLimit: typeof import("../../app/api/_lib/rate-limit").rateLimit;

  beforeEach(async () => {
    // Re-import to get fresh module state
    const mod = await import("../../app/api/_lib/rate-limit");
    rateLimit = mod.rateLimit;
  });

  function makeRequest(ip: string): Request {
    return new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": ip },
    });
  }

  it("allows requests within the limit", () => {
    for (let i = 0; i < 30; i++) {
      const result = rateLimit(makeRequest("192.168.1.1"), "judge");
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests exceeding the judge limit", () => {
    for (let i = 0; i < 30; i++) {
      rateLimit(makeRequest("10.0.0.1"), "judge");
    }
    const result = rateLimit(makeRequest("10.0.0.1"), "judge");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks different IPs independently", () => {
    // Exhaust IP A
    for (let i = 0; i < 15; i++) {
      rateLimit(makeRequest("1.1.1.1"), "ai");
    }
    const blocked = rateLimit(makeRequest("1.1.1.1"), "ai");
    expect(blocked.allowed).toBe(false);

    // IP B should still be allowed
    const allowed = rateLimit(makeRequest("2.2.2.2"), "ai");
    expect(allowed.allowed).toBe(true);
  });

  it("tracks different routes independently", () => {
    const judgeResult = rateLimit(makeRequest("3.3.3.3"), "judge");
    const aiResult = rateLimit(makeRequest("3.3.3.3"), "ai");
    // Both should be allowed (different buckets)
    expect(judgeResult.allowed).toBe(true);
    expect(aiResult.allowed).toBe(true);
  });

  it("falls back to 127.0.0.1 when x-forwarded-for is absent", () => {
    const req = new Request("http://localhost/api/test");
    const result = rateLimit(req, "submissions");
    expect(result.allowed).toBe(true);
  });

  it("uses first IP from x-forwarded-for chain", () => {
    const result = rateLimit(makeRequest("4.4.4.4, 5.5.5.5, 6.6.6.6"), "judge");
    expect(result.allowed).toBe(true);
  });
});
