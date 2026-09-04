import { describe, expect, it } from "vitest";
import { validateCloudflareConfig } from "../../scripts/validate-cloudflare-config.mjs";

function validConfig() {
  return {
    name: "codenow-oj",
    workers_dev: true,
    d1_databases: [],
    env: {
      preview: {
        name: "codenow-oj-preview", workers_dev: true,
        d1_databases: [{ binding: "DB", database_name: "codenow-oj-preview", database_id: "preview-id", migrations_dir: "drizzle" }],
        vars: { INVITE_ONLY: "1", BETTER_AUTH_URL: "https://preview.workers.dev" },
      },
      production: {
        name: "codenow-oj-production", workers_dev: true,
        routes: [{ pattern: "codenowoj.xyz", custom_domain: true }],
        d1_databases: [{ binding: "DB", database_name: "codenow-oj-production", database_id: "production-id", migrations_dir: "drizzle" }],
        vars: { INVITE_ONLY: "1", BETTER_AUTH_URL: "https://production.workers.dev" },
      },
    },
  };
}

describe("Cloudflare configuration validator", () => {
  it("accepts isolated workers.dev environments with separate D1 databases", () => {
    expect(validateCloudflareConfig(validConfig())).toEqual({ ok: true, errors: [] });
  });

  it("rejects shared databases, missing migrations, and inline secrets", () => {
    const config = validConfig();
    config.env.production.d1_databases[0].database_id = "preview-id";
    config.env.production.d1_databases[0].migrations_dir = "other";
    Object.assign(config.env.preview.vars, { BETTER_AUTH_SECRET: "inline-secret" });
    const result = validateCloudflareConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/different D1|migrations_dir|secret/i);
  });

  it("requires the production custom domain route", () => {
    const config = validConfig();
    config.env.production.routes = [];
    const result = validateCloudflareConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/codenowoj\.xyz|custom domain/i);
  });
});
