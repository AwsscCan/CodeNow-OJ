import { describe, it, expect } from "vitest";
import { validateEndpoint } from "../../app/api/_lib/validate-endpoint";

describe("validateEndpoint", () => {
  it("accepts api.deepseek.com", () => {
    const url = validateEndpoint("https://api.deepseek.com");
    expect(url.hostname).toBe("api.deepseek.com");
    expect(url.pathname).toBe("/chat/completions");
  });

  it("accepts api.openai.com with trailing v1", () => {
    const url = validateEndpoint("https://api.openai.com/v1");
    expect(url.hostname).toBe("api.openai.com");
    expect(url.pathname).toBe("/v1/chat/completions");
  });

  it("accepts api.anthropic.com", () => {
    const url = validateEndpoint("https://api.anthropic.com");
    expect(url.pathname).toBe("/chat/completions");
  });

  it("appends /chat/completions when missing", () => {
    const url = validateEndpoint("https://api.deepseek.com/v1");
    expect(url.pathname).toBe("/v1/chat/completions");
  });

  it("does not double-append /chat/completions", () => {
    const url = validateEndpoint("https://api.openai.com/v1/chat/completions");
    expect(url.pathname).toBe("/v1/chat/completions");
  });

  it("rejects non-HTTPS endpoints", () => {
    expect(() => validateEndpoint("http://api.deepseek.com")).toThrow("HTTPS");
  });

  it("rejects unknown hosts", () => {
    expect(() => validateEndpoint("https://evil.com/api")).toThrow("不支持的 API 服务商");
  });

  it("rejects hostnames that merely contain allowed names", () => {
    expect(() => validateEndpoint("https://api.deepseek.com.evil.com")).toThrow("不支持的 API 服务商");
  });

  it("rejects invalid URL format", () => {
    expect(() => validateEndpoint("not-a-url")).toThrow("格式无效");
  });

  it("strips trailing slashes", () => {
    const url = validateEndpoint("https://api.deepseek.com/v1/");
    expect(url.pathname).toBe("/v1/chat/completions");
  });
});
