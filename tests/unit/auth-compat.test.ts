import { describe, expect, it } from "vitest";
import { createAuthOptions } from "../../app/lib/auth-compat";

describe("auth runtime compatibility", () => {
  it("creates edge-safe options without reading Node-only globals", () => {
    const options = createAuthOptions({
      baseURL: "http://localhost:3000",
      secret: "test-secret-at-least-32-characters",
    });
    expect(options.baseURL).toBe("http://localhost:3000");
    expect(options.emailAndPassword.requireEmailVerification).toBe(true);
  });
});
