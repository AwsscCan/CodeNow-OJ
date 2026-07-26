import { describe, expect, it } from "vitest";
import { generateAuthSecret } from "../../scripts/generate-auth-secret.mjs";

describe("release secret generator", () => {
  it("generates independent URL-safe values with at least 32 random bytes", () => {
    const first = generateAuthSecret();
    const second = generateAuthSecret();
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(first, "base64url").byteLength).toBeGreaterThanOrEqual(32);
    expect(second).not.toBe(first);
  });
});
