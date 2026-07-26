import BetterSqlite3 from "better-sqlite3";
import { getTableColumns } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { adminAuditLogs, aiConversations, codeDrafts, sessions, users } from "../../db/schema";

describe("administrator schema", () => {
  it("stores roles, bans, forced password changes, moderation markers, and audit indexes", () => {
    const userColumns = getTableColumns(users);
    expect(userColumns).toMatchObject({
      role: expect.anything(),
      banned: expect.anything(),
      banReason: expect.anything(),
      banExpires: expect.anything(),
      mustChangePassword: expect.anything(),
    });
    expect(userColumns.role.enumValues).toEqual(["user", "admin"]);
    expect(userColumns.role.default).toBe("user");
    expect(userColumns.banned.default).toBe(false);
    expect(userColumns.mustChangePassword.default).toBe(false);

    expect(getTableColumns(sessions)).toHaveProperty("impersonatedBy");
    expect(getTableColumns(codeDrafts)).toHaveProperty("deletedAt");
    expect(getTableColumns(aiConversations)).toHaveProperty("deletedAt");

    const auditColumns = getTableColumns(adminAuditLogs);
    expect(auditColumns).toMatchObject({
      id: expect.anything(),
      adminUserId: expect.anything(),
      action: expect.anything(),
      targetType: expect.anything(),
      targetId: expect.anything(),
      requestId: expect.anything(),
      metadataJson: expect.anything(),
      createdAt: expect.anything(),
    });
    expect(getTableConfig(adminAuditLogs).indexes.map((entry) => entry.config.name)).toEqual(expect.arrayContaining([
      "admin_audit_admin_created_at_idx",
      "admin_audit_target_idx",
    ]));
  });

  it("enforces administrator roles and audit actions at the database layer", () => {
    expect(getTableConfig(users).checks.map((entry) => entry.name)).toContain("user_role_check");
    expect(getTableConfig(adminAuditLogs).checks.map((entry) => entry.name)).toContain("admin_audit_action_check");
  });

  it("upgrades an existing user without losing account data", () => {
    const database = new BetterSqlite3(":memory:");
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    // 按内容定位管理员迁移，避免耦合具体迁移编号（合并后已重新编号为 0012）
    const adminIdx = migrations.findIndex((migration) => migration.sql.some((statement) => statement.includes("admin_audit_logs")));
    for (const migration of migrations.slice(0, adminIdx)) {
      for (const statement of migration.sql) database.exec(statement);
    }
    database.prepare("insert into user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)")
      .run("existing-user", "Existing", "existing@example.test", 1, 1, 1);

    for (const statement of migrations[adminIdx].sql) database.exec(statement);

    expect(database.prepare("select id, role, banned, must_change_password from user").get()).toEqual({
      id: "existing-user",
      role: "user",
      banned: 0,
      must_change_password: 0,
    });
    database.close();
  });
});
