import { and, eq } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { createLocalDb } from "../../../db/client";
import { userPreferences } from "../../../db/schema";

type RepositoryDb = ReturnType<typeof createLocalDb>;
export type SafePreferences = { themeMode: "light" | "dark" | "girl"; editorTheme: "light" | "dark" | "girl" };
export type PreferenceValue = { preferences: SafePreferences; version: number; updatedAt: string | null };
export type PreferenceResult =
  | { ok: true; value: PreferenceValue }
  | { ok: false; status: 400 | 409; code: string; message: string; currentVersion?: number; updatedAt?: string };

const themes = new Set(["light", "dark", "girl"]);
const sensitiveKey = /(apikey|token|secret|password|credential)/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function containsSensitiveField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveField);
  const object = record(value);
  return Boolean(object && Object.entries(object).some(([key, item]) => sensitiveKey.test(key.replace(/[^a-z]/gi, "")) || containsSensitiveField(item)));
}

function publicValue(row?: typeof userPreferences.$inferSelect): PreferenceValue {
  return row ? {
    preferences: { themeMode: row.themeMode as SafePreferences["themeMode"], editorTheme: row.editorTheme as SafePreferences["editorTheme"] },
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  } : { preferences: { themeMode: "light", editorTheme: "light" }, version: 0, updatedAt: null };
}

export function createPreferenceRepository(db: Database) {
  const database = db as RepositoryDb;

  async function current(userId: string) {
    const [row] = await database.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
    return row;
  }

  function conflict(row?: typeof userPreferences.$inferSelect): PreferenceResult {
    return {
      ok: false, status: 409, code: "VERSION_CONFLICT", message: "Preferences changed on another device",
      currentVersion: row?.version ?? 0, updatedAt: row?.updatedAt.toISOString(),
    };
  }

  return {
    async get(userId: string) {
      return publicValue(await current(userId));
    },

    async patch(userId: string, input: unknown): Promise<PreferenceResult> {
      const body = record(input);
      const patch = record(body?.patch);
      if (!body || !Number.isInteger(body.version) || Number(body.version) < 0 || !patch || Object.keys(patch).length === 0) {
        return { ok: false, status: 400, code: "INVALID_PREFERENCES", message: "A version and preference patch are required" };
      }
      if (containsSensitiveField(patch)) {
        return { ok: false, status: 400, code: "SENSITIVE_FIELD", message: "Sensitive fields cannot be synced" };
      }
      if (Object.keys(patch).some((key) => key !== "themeMode" && key !== "editorTheme")
        || Object.values(patch).some((value) => typeof value !== "string" || !themes.has(value))) {
        return { ok: false, status: 400, code: "INVALID_PREFERENCES", message: "Only valid themeMode and editorTheme values are allowed" };
      }
      const expectedVersion = body.version as number;
      const existing = await current(userId);
      if (!existing) {
        if (expectedVersion !== 0) return conflict();
        const now = new Date();
        try {
          const [created] = await database.insert(userPreferences).values({
            userId,
            themeMode: typeof patch.themeMode === "string" ? patch.themeMode : "light",
            editorTheme: typeof patch.editorTheme === "string" ? patch.editorTheme : "light",
            settingsJson: "{}", version: 1, createdAt: now, updatedAt: now,
          }).returning();
          return { ok: true, value: publicValue(created) };
        } catch {
          return conflict(await current(userId));
        }
      }
      if (existing.version !== expectedVersion) return conflict(existing);
      const [updated] = await database.update(userPreferences).set({
        themeMode: typeof patch.themeMode === "string" ? patch.themeMode : existing.themeMode,
        editorTheme: typeof patch.editorTheme === "string" ? patch.editorTheme : existing.editorTheme,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      }).where(and(eq(userPreferences.userId, userId), eq(userPreferences.version, expectedVersion))).returning();
      return updated ? { ok: true, value: publicValue(updated) } : conflict(await current(userId));
    },
  };
}

export type PreferenceRepository = ReturnType<typeof createPreferenceRepository>;

