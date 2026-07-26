import { describe, expect, it, vi } from "vitest";
import { releaseCloudflare } from "../../scripts/release-cloudflare.mjs";

function label(command: string, args: string[]) { return [command, ...args].join(" "); }

describe("Cloudflare release gates", () => {
  it("backs up before migration and prevents production after preview failure", async () => {
    const calls: string[] = [];
    const run = vi.fn(async (command: string, args: string[]) => {
      const value = label(command, args); calls.push(value);
      if (value.includes("deploy --env preview")) throw new Error("preview failed");
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
    expect(calls.some((value) => value.includes("deploy --env production"))).toBe(true);
  });
});
