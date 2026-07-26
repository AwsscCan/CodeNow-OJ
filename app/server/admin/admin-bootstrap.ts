import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { createLocalDb, type Database } from "../../../db/client";
import { accounts, adminAuditLogs, users } from "../../../db/schema";

type RepositoryDb = ReturnType<typeof createLocalDb>;
const passwordAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const bootstrapAuditId = "initial-admin-bootstrap";

function newTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => passwordAlphabet[byte & 63]).join("");
}

function isD1Database(db: Database): db is Database & { batch: (...queries: never[]) => Promise<unknown> } {
  return "batch" in db;
}

export function createBootstrapAdminService(db: Database) {
  const database = db as RepositoryDb;
  return {
    async bootstrap(input: { email: string; name: string }) {
      const [existingAdmin] = await database.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
      if (existingAdmin) return { alreadyExists: true as const };

      const email = input.email.trim().toLowerCase();
      const name = input.name.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 1 || name.length > 100) {
        throw new Error("A valid administrator email and name are required");
      }
      const temporaryPassword = newTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      const userId = crypto.randomUUID();
      const now = new Date();
      const userRow = {
        id: userId, name, email, emailVerified: true, role: "admin" as const, banned: false,
        mustChangePassword: true, createdAt: now, updatedAt: now,
      };
      const accountRow = {
        id: crypto.randomUUID(), accountId: userId, providerId: "credential", userId,
        password: passwordHash, createdAt: now, updatedAt: now,
      };
      const auditRow = {
        id: bootstrapAuditId, adminUserId: userId, action: "user.role_change" as const,
        targetType: "user", targetId: userId, requestId: bootstrapAuditId,
        metadataJson: "{}", createdAt: now,
      };

      try {
        if (isD1Database(db)) {
          await db.batch([
            db.insert(users).values(userRow), db.insert(accounts).values(accountRow), db.insert(adminAuditLogs).values(auditRow),
          ] as never);
        } else {
          database.transaction((tx) => {
            tx.insert(users).values(userRow).run();
            tx.insert(accounts).values(accountRow).run();
            tx.insert(adminAuditLogs).values(auditRow).run();
          });
        }
      } catch (cause) {
        const [createdAdmin] = await database.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
        if (createdAdmin) return { alreadyExists: true as const };
        throw cause;
      }
      return { alreadyExists: false as const, user: { id: userId, email, name }, temporaryPassword };
    },
  };
}
