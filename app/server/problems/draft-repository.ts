import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { createLocalDb } from "../../../db/client";
import { codeDrafts, problems } from "../../../db/schema";
import { MAX_SUBMISSION_SOURCE_LENGTH } from "../../api/_lib/constants";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type DraftRow = typeof codeDrafts.$inferSelect;
export type DraftInput = { problemKind: "public" | "private"; problemRef: string; language: string; sourceCode: string };
export type DraftResult =
  | { ok: true; value: ReturnType<typeof publicDraft>; version: number; updatedAt: string }
  | { ok: false; status: 400 | 404 | 409 | 413; code: string; message: string; currentVersion?: number; updatedAt?: string };

function publicDraft(row: DraftRow) {
  const value = { ...row };
  Reflect.deleteProperty(value, "userId");
  return { ...value, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export function createDraftRepository(db: Database) {
  const database = db as RepositoryDb;

  async function find(userId: string, problemKind: string, problemRef: string, language: string) {
    const [row] = await database.select().from(codeDrafts).where(and(
      eq(codeDrafts.userId, userId), eq(codeDrafts.problemKind, problemKind),
      eq(codeDrafts.problemRef, problemRef), eq(codeDrafts.language, language),
      isNull(codeDrafts.deletedAt),
    )).limit(1);
    return row ?? null;
  }

  return {
    async getDraft(userId: string, problemKind: string, problemRef: string, language: string) {
      const row = await find(userId, problemKind, problemRef, language);
      return row ? publicDraft(row) : null;
    },

    async saveDraft(userId: string, input: DraftInput, expectedVersion: number): Promise<DraftResult> {
      if ((input.problemKind !== "public" && input.problemKind !== "private") || !input.problemRef.trim() || !input.language.trim() || typeof input.sourceCode !== "string") {
        return { ok: false, status: 400, code: "INVALID_DRAFT", message: "Draft fields are invalid" };
      }
      if (input.sourceCode.length > MAX_SUBMISSION_SOURCE_LENGTH) {
        return { ok: false, status: 413, code: "SOURCE_TOO_LARGE", message: "Source code is too large" };
      }
      if (input.problemKind === "private") {
        const [owned] = await database.select({ id: problems.id }).from(problems).where(and(
          eq(problems.userId, userId), eq(problems.id, input.problemRef), isNull(problems.deletedAt),
        )).limit(1);
        if (!owned) return { ok: false, status: 404, code: "PROBLEM_NOT_FOUND", message: "Private problem not found" };
      }
      const current = await find(userId, input.problemKind, input.problemRef, input.language);
      if (!current) {
        if (expectedVersion !== 0) return { ok: false, status: 409, code: "VERSION_CONFLICT", message: "Draft version conflict", currentVersion: 0 };
        const now = new Date();
        const [row] = await database.insert(codeDrafts).values({
          id: crypto.randomUUID(), userId, ...input, version: 1, createdAt: now, updatedAt: now,
        }).returning();
        return { ok: true, value: publicDraft(row), version: 1, updatedAt: now.toISOString() };
      }
      if (current.version !== expectedVersion) {
        return { ok: false, status: 409, code: "VERSION_CONFLICT", message: "Draft version conflict", currentVersion: current.version, updatedAt: current.updatedAt.toISOString() };
      }
      const now = new Date();
      const [row] = await database.update(codeDrafts).set({ sourceCode: input.sourceCode, version: expectedVersion + 1, updatedAt: now }).where(and(
        eq(codeDrafts.userId, userId), eq(codeDrafts.id, current.id), eq(codeDrafts.version, expectedVersion),
      )).returning();
      if (!row) {
        const latest = await find(userId, input.problemKind, input.problemRef, input.language);
        return { ok: false, status: 409, code: "VERSION_CONFLICT", message: "Draft version conflict", currentVersion: latest?.version ?? 0, updatedAt: latest?.updatedAt.toISOString() };
      }
      return { ok: true, value: publicDraft(row), version: row.version, updatedAt: row.updatedAt.toISOString() };
    },
  };
}

export type DraftRepository = ReturnType<typeof createDraftRepository>;

