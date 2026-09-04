import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { createD1Db, createLocalDb } from "../../../db/client";
import { folders, problems, testCases } from "../../../db/schema";
import {
  validateProblem,
  validateTestCases,
  type ProblemInput,
  type TestCaseInput,
} from "./problem-validation";

export type { ProblemInput, TestCaseInput } from "./problem-validation";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type D1Db = ReturnType<typeof createD1Db>;
type ProblemRow = typeof problems.$inferSelect;
type TestCaseRow = typeof testCases.$inferSelect;
type FolderRow = typeof folders.$inferSelect;
type PublicProblem = Omit<ProblemRow, "userId" | "createdAt" | "updatedAt" | "deletedAt"> & {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
type PublicTestCase = Omit<TestCaseRow, "userId" | "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
type PublicFolder = Omit<FolderRow, "userId" | "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };

export type SaveResult<T> =
  | { ok: true; value: T; version: number; updatedAt: string }
  | { ok: false; status: 400 | 404 | 409 | 413; code: string; message: string; field?: string; currentVersion?: number; updatedAt?: string };

export class ProblemConflictError extends Error {
  constructor(public currentVersion: number, public updatedAt: string) {
    super("Problem version conflict");
    this.name = "ProblemConflictError";
  }
}

function publicProblem(row: ProblemRow): PublicProblem {
  const value = { ...row };
  Reflect.deleteProperty(value, "userId");
  return {
    ...value,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function publicTestCase(row: TestCaseRow): PublicTestCase {
  const value = { ...row };
  Reflect.deleteProperty(value, "userId");
  return { ...value, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function publicFolder(row: FolderRow): PublicFolder {
  const value = { ...row };
  Reflect.deleteProperty(value, "userId");
  return { ...value, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function validationError(result: { code: string; field: string; message: string }): SaveResult<never> {
  const status = result.code.includes("TOO_LARGE") ? 413 : 400;
  return { ok: false, status, ...result };
}

function isD1Database(db: Database): db is D1Db {
  return "batch" in db;
}

export function createProblemRepository(db: Database) {
  const database = db as RepositoryDb;

  async function ownedProblem(userId: string, id: string, includeDeleted = false) {
    const filter = includeDeleted
      ? and(eq(problems.userId, userId), eq(problems.id, id))
      : and(eq(problems.userId, userId), eq(problems.id, id), isNull(problems.deletedAt));
    const [row] = await database.select().from(problems).where(filter).limit(1);
    return row ?? null;
  }

  async function validFolder(userId: string, folderId?: string | null) {
    if (!folderId) return true;
    const [folder] = await database.select({ id: folders.id }).from(folders)
      .where(and(eq(folders.userId, userId), eq(folders.id, folderId))).limit(1);
    return Boolean(folder);
  }

  function conflict(row: ProblemRow): SaveResult<never> {
    const error = new ProblemConflictError(row.version, row.updatedAt.toISOString());
    return { ok: false, status: 409, code: "VERSION_CONFLICT", message: error.message, currentVersion: error.currentVersion, updatedAt: error.updatedAt };
  }

  return {
    async listFolders(userId: string) {
      const rows = await database.select().from(folders).where(eq(folders.userId, userId)).orderBy(folders.sortOrder, folders.name);
      return rows.map(publicFolder);
    },

    async createFolder(userId: string, input: { name?: unknown; parentId?: unknown; sortOrder?: unknown }) {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (!name || name.length > 100) return { ok: false as const, status: 400 as const, code: "INVALID_FOLDER", message: "Folder name is required" };
      const parentId = typeof input.parentId === "string" && input.parentId ? input.parentId : null;
      if (!(await validFolder(userId, parentId))) return { ok: false as const, status: 404 as const, code: "PARENT_FOLDER_NOT_FOUND", message: "Parent folder not found" };
      const now = new Date();
      const [row] = await database.insert(folders).values({
        id: crypto.randomUUID(), userId, parentId, name,
        sortOrder: typeof input.sortOrder === "number" ? Math.trunc(input.sortOrder) : 0,
        createdAt: now, updatedAt: now,
      }).returning();
      return { ok: true as const, value: publicFolder(row) };
    },

    async updateFolder(userId: string, id: string, input: { name?: unknown; parentId?: unknown; sortOrder?: unknown }) {
      const [current] = await database.select().from(folders).where(and(eq(folders.userId, userId), eq(folders.id, id))).limit(1);
      if (!current) return { ok: false as const, status: 404 as const, code: "FOLDER_NOT_FOUND", message: "Folder not found" };
      const name = input.name === undefined ? current.name : typeof input.name === "string" ? input.name.trim() : "";
      if (!name || name.length > 100) return { ok: false as const, status: 400 as const, code: "INVALID_FOLDER", message: "Folder name is required" };
      const parentId = input.parentId === undefined ? current.parentId : typeof input.parentId === "string" && input.parentId ? input.parentId : null;
      if (parentId === id || !(await validFolder(userId, parentId))) return { ok: false as const, status: 400 as const, code: "INVALID_PARENT_FOLDER", message: "Invalid parent folder" };
      let ancestorId = parentId;
      while (ancestorId) {
        const [ancestor] = await database.select({ parentId: folders.parentId }).from(folders)
          .where(and(eq(folders.userId, userId), eq(folders.id, ancestorId))).limit(1);
        if (!ancestor || ancestor.parentId === id) return { ok: false as const, status: 400 as const, code: "FOLDER_CYCLE", message: "Folder hierarchy cannot contain a cycle" };
        ancestorId = ancestor.parentId;
      }
      const [row] = await database.update(folders).set({
        name, parentId,
        sortOrder: typeof input.sortOrder === "number" ? Math.trunc(input.sortOrder) : current.sortOrder,
        updatedAt: new Date(),
      }).where(and(eq(folders.userId, userId), eq(folders.id, id))).returning();
      return { ok: true as const, value: publicFolder(row) };
    },

    async deleteFolder(userId: string, id: string) {
      const [current] = await database.select().from(folders).where(and(eq(folders.userId, userId), eq(folders.id, id))).limit(1);
      if (!current) return { ok: false as const, status: 404 as const, code: "FOLDER_NOT_FOUND", message: "Folder not found" };
      await database.update(problems).set({ folderId: current.parentId, updatedAt: new Date() })
        .where(and(eq(problems.userId, userId), eq(problems.folderId, id)));
      await database.update(folders).set({ parentId: current.parentId, updatedAt: new Date() })
        .where(and(eq(folders.userId, userId), eq(folders.parentId, id)));
      await database.delete(folders).where(and(eq(folders.userId, userId), eq(folders.id, id)));
      return { ok: true as const, value: { id } };
    },

    async listProblems(userId: string, cursor?: string) {
      const parsedCursor = cursor ? new Date(cursor) : null;
      const filter = parsedCursor && !Number.isNaN(parsedCursor.getTime())
        ? and(eq(problems.userId, userId), isNull(problems.deletedAt), lt(problems.updatedAt, parsedCursor))
        : and(eq(problems.userId, userId), isNull(problems.deletedAt));
      const rows = await database.select().from(problems).where(filter).orderBy(desc(problems.updatedAt)).limit(51);
      const hasMore = rows.length > 50;
      const items = rows.slice(0, 50).map(publicProblem);
      return { items, nextCursor: hasMore ? items.at(-1)?.updatedAt ?? null : null };
    },

    async listDeletedProblems(userId: string) {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const rows = await database.select().from(problems)
        .where(and(eq(problems.userId, userId), gt(problems.deletedAt, cutoff)))
        .orderBy(desc(problems.deletedAt));
      return rows.map(publicProblem);
    },

    async getProblem(userId: string, id: string) {
      const row = await ownedProblem(userId, id);
      if (!row) return null;
      const rows = await database.select().from(testCases)
        .where(and(eq(testCases.userId, userId), eq(testCases.problemId, id)))
        .orderBy(testCases.sortOrder);
      return { ...publicProblem(row), testCases: rows.map(publicTestCase) };
    },

    async createProblem(userId: string, input: ProblemInput): Promise<SaveResult<ReturnType<typeof publicProblem>>> {
      const validated = validateProblem(input);
      if (!validated.ok) return validationError(validated);
      if (!(await validFolder(userId, validated.value.folderId))) {
        return { ok: false, status: 404, code: "FOLDER_NOT_FOUND", message: "Folder not found" };
      }
      const [duplicate] = await database.select({ id: problems.id }).from(problems)
        .where(and(eq(problems.userId, userId), eq(problems.problemCode, validated.value.problemCode))).limit(1);
      if (duplicate) return { ok: false, status: 409, code: "PROBLEM_CODE_EXISTS", message: "Problem code already exists" };
      const now = new Date();
      const [row] = await database.insert(problems).values({
        id: crypto.randomUUID(), userId, ...validated.value, version: 1, createdAt: now, updatedAt: now,
      }).returning();
      return { ok: true, value: publicProblem(row), version: row.version, updatedAt: row.updatedAt.toISOString() };
    },

    async updateProblem(userId: string, id: string, version: number, patch: Partial<ProblemInput>): Promise<SaveResult<ReturnType<typeof publicProblem>>> {
      const current = await ownedProblem(userId, id);
      if (!current) return { ok: false, status: 404, code: "PROBLEM_NOT_FOUND", message: "Problem not found" };
      if (current.version !== version) return conflict(current);
      const validated = validateProblem({ ...current, ...patch });
      if (!validated.ok) return validationError(validated);
      if (!(await validFolder(userId, validated.value.folderId))) {
        return { ok: false, status: 404, code: "FOLDER_NOT_FOUND", message: "Folder not found" };
      }
      const now = new Date();
      const [row] = await database.update(problems).set({ ...validated.value, version: version + 1, updatedAt: now })
        .where(and(eq(problems.userId, userId), eq(problems.id, id), eq(problems.version, version), isNull(problems.deletedAt))).returning();
      if (!row) {
        const latest = await ownedProblem(userId, id);
        return latest ? conflict(latest) : { ok: false, status: 404, code: "PROBLEM_NOT_FOUND", message: "Problem not found" };
      }
      return { ok: true, value: publicProblem(row), version: row.version, updatedAt: row.updatedAt.toISOString() };
    },

    async replaceTestCases(userId: string, problemId: string, version: number, input: TestCaseInput[]): Promise<SaveResult<ReturnType<typeof publicTestCase>[]>> {
      const current = await ownedProblem(userId, problemId);
      if (!current) return { ok: false, status: 404, code: "PROBLEM_NOT_FOUND", message: "Problem not found" };
      if (current.version !== version) return conflict(current);
      const validated = validateTestCases(input);
      if (!validated.ok) return validationError(validated);
      const now = new Date();
      const values = validated.value.map((item, sortOrder) => ({
        id: crypto.randomUUID(), userId, problemId, sortOrder, ...item, createdAt: now, updatedAt: now,
      }));
      let parent: ProblemRow | null = null;
      let rows: TestCaseRow[] = [];

      if (isD1Database(db)) {
        const saveParent = db.update(problems).set({ version: version + 1, updatedAt: now })
          .where(and(eq(problems.userId, userId), eq(problems.id, problemId), eq(problems.version, version), isNull(problems.deletedAt))).returning();
        const remove = db.delete(testCases).where(and(eq(testCases.userId, userId), eq(testCases.problemId, problemId)));
        if (values.length) {
          const result = await db.batch([saveParent, remove, db.insert(testCases).values(values).returning()]);
          parent = result[0][0] ?? null;
          rows = result[2];
        } else {
          const result = await db.batch([saveParent, remove]);
          parent = result[0][0] ?? null;
        }
      } else {
        const result = database.transaction((tx) => {
          const savedParent = tx.update(problems).set({ version: version + 1, updatedAt: now })
            .where(and(eq(problems.userId, userId), eq(problems.id, problemId), eq(problems.version, version), isNull(problems.deletedAt)))
            .returning().get();
          if (!savedParent) return null;
          tx.delete(testCases).where(and(eq(testCases.userId, userId), eq(testCases.problemId, problemId))).run();
          const savedRows = values.length ? tx.insert(testCases).values(values).returning().all() : [];
          return { parent: savedParent, rows: savedRows };
        });
        parent = result?.parent ?? null;
        rows = result?.rows ?? [];
      }

      if (!parent) {
        const latest = await ownedProblem(userId, problemId);
        return latest ? conflict(latest) : { ok: false, status: 404, code: "PROBLEM_NOT_FOUND", message: "Problem not found" };
      }
      return { ok: true, value: rows.map(publicTestCase), version: parent.version, updatedAt: parent.updatedAt.toISOString() };
    },

    async softDeleteProblem(userId: string, id: string, version: number): Promise<SaveResult<{ id: string }>> {
      const current = await ownedProblem(userId, id);
      if (!current) return { ok: false, status: 404, code: "PROBLEM_NOT_FOUND", message: "Problem not found" };
      if (current.version !== version) return conflict(current);
      const now = new Date();
      const [row] = await database.update(problems).set({ deletedAt: now, updatedAt: now, version: version + 1 })
        .where(and(eq(problems.userId, userId), eq(problems.id, id), eq(problems.version, version), isNull(problems.deletedAt))).returning();
      if (!row) {
        const latest = await ownedProblem(userId, id, true);
        return latest ? conflict(latest) : { ok: false, status: 404, code: "PROBLEM_NOT_FOUND", message: "Problem not found" };
      }
      return { ok: true, value: { id: row.id }, version: row.version, updatedAt: row.updatedAt.toISOString() };
    },

    async restoreProblem(userId: string, id: string, version: number): Promise<SaveResult<ReturnType<typeof publicProblem>>> {
      const current = await ownedProblem(userId, id, true);
      if (!current || !current.deletedAt) return { ok: false, status: 404, code: "PROBLEM_NOT_FOUND", message: "Problem not found" };
      if (Date.now() - current.deletedAt.getTime() > 30 * 24 * 60 * 60 * 1000) {
        return { ok: false, status: 404, code: "PROBLEM_EXPIRED", message: "Deleted problem has expired" };
      }
      if (current.version !== version) return conflict(current);
      const now = new Date();
      const [row] = await database.update(problems).set({ deletedAt: null, updatedAt: now, version: version + 1 })
        .where(and(eq(problems.userId, userId), eq(problems.id, id), eq(problems.version, version), gt(problems.deletedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))).returning();
      if (!row) return { ok: false, status: 404, code: "PROBLEM_NOT_FOUND", message: "Problem not found" };
      return { ok: true, value: publicProblem(row), version: row.version, updatedAt: row.updatedAt.toISOString() };
    },
  };
}

export type ProblemRepository = ReturnType<typeof createProblemRepository>;
