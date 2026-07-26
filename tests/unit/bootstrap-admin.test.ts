import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createLocalDb } from "../../db/client";
import { accounts, users } from "../../db/schema";
import { createBootstrapAdminService } from "../../app/server/admin/admin-bootstrap";
import { createBootstrapAdminHandlers } from "../../app/api/internal/bootstrap-admin/route";
import { parseBootstrapArguments } from "../../scripts/bootstrap-admin.mjs";

function migratedDb() {
  const db = createLocalDb(":memory:");
  migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

describe("administrator bootstrap", () => {
  it("creates exactly one verified administrator with a one-time password", async () => {
    const db = migratedDb();
    const service = createBootstrapAdminService(db);
    const first = await service.bootstrap({ email: "OWNER@EXAMPLE.TEST", name: "Owner" });
    expect(first).toMatchObject({ alreadyExists: false, user: { email: "owner@example.test" } });
    if (first.alreadyExists) return;
    expect(first.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const [created] = await db.select().from(users).where(eq(users.id, first.user.id));
    expect(created).toMatchObject({ role: "admin", emailVerified: true, mustChangePassword: true, banned: false });
    const [credential] = await db.select().from(accounts).where(eq(accounts.userId, first.user.id));
    expect(credential.password).not.toBe(first.temporaryPassword);

    const second = await service.bootstrap({ email: "other@example.test", name: "Other" });
    expect(second).toEqual({ alreadyExists: true });
    expect(JSON.stringify(second)).not.toMatch(/password/i);
  });

  it("protects the endpoint with the bootstrap token and no-store responses", async () => {
    const db = migratedDb();
    const handlers = createBootstrapAdminHandlers(async () => ({ db, token: "bootstrap-secret", pepper: "pepper" }));
    const denied = await handlers.POST(new Request("http://local/api/internal/bootstrap-admin", {
      method: "POST", headers: { authorization: "Bearer wrong" }, body: JSON.stringify({ email: "owner@example.test", name: "Owner" }),
    }));
    expect(denied.status).toBe(404);
    expect(denied.headers.get("cache-control")).toBe("private, no-store");

    const allowed = await handlers.POST(new Request("http://local/api/internal/bootstrap-admin", {
      method: "POST", headers: { authorization: "Bearer bootstrap-secret" }, body: JSON.stringify({ email: "owner@example.test", name: "Owner" }),
    }));
    expect(allowed.status).toBe(201);
    expect(await allowed.json()).toMatchObject({ alreadyExists: false, temporaryPassword: expect.any(String) });
  });

  it("requires explicit confirmation for production and never accepts a token argument", () => {
    expect(() => parseBootstrapArguments(["--target", "production", "--email", "owner@example.test"]))
      .toThrow(/confirm-production/i);
    expect(() => parseBootstrapArguments(["--target", "local", "--email", "owner@example.test", "--token", "secret"]))
      .toThrow(/token/i);
    expect(parseBootstrapArguments(["--target", "production", "--email", "owner@example.test", "--confirm-production"]))
      .toMatchObject({ target: "production", email: "owner@example.test", confirmProduction: true });
  });
});
