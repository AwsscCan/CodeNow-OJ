import { and, eq, isNull } from "drizzle-orm";
import { MAX_SUBMISSION_SOURCE_LENGTH } from "../../api/_lib/constants";
import { fingerprintManifest } from "../../lib/local-data/fingerprint";
import type { LocalDataManifestV1 } from "../../lib/local-data/types";
import { validateTestCases } from "../problems/problem-validation";
import type { Database } from "../../../db/client";
import { createLocalDb } from "../../../db/client";
import { problems } from "../../../db/schema";

type RepositoryDb = ReturnType<typeof createLocalDb>;
export type ImportConflict = { localProblemKey: string; cloudProblemId: string; problemCode: string; cloudVersion: number };
export type ImportPreview = {
  counts: { folders: number; problems: number; testCases: number; drafts: number; conversations: number };
  conflicts: ImportConflict[];
  previewFingerprint: string;
};
export type ImportPreviewResult =
  | { ok: true; value: ImportPreview }
  | { ok: false; status: 400 | 413; code: string; message: string };

function isManifest(value: unknown): value is LocalDataManifestV1 {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<LocalDataManifestV1>;
  return manifest.schemaVersion === 1
    && Array.isArray(manifest.folders)
    && Array.isArray(manifest.problems)
    && Array.isArray(manifest.conversations)
    && Boolean(manifest.preferences && typeof manifest.preferences === "object")
    && (manifest.currentDraft === null || Boolean(manifest.currentDraft && typeof manifest.currentDraft === "object"));
}

function validateManifest(manifest: LocalDataManifestV1): ImportPreviewResult | null {
  if (!manifest.folders.every((folder) => typeof folder === "string")) {
    return { ok: false, status: 400, code: "INVALID_MANIFEST", message: "Folder entries must be strings" };
  }
  for (const problem of manifest.problems) {
    if (!problem || typeof problem !== "object" || typeof problem.id !== "string" || !Array.isArray(problem.testCases)) {
      return { ok: false, status: 400, code: "INVALID_MANIFEST", message: "Problem entries are invalid" };
    }
    const tests = validateTestCases(problem.testCases);
    if (!tests.ok) {
      return { ok: false, status: tests.code.includes("TOO_LARGE") ? 413 : 400, code: tests.code, message: tests.message };
    }
  }
  if (manifest.currentDraft && (typeof manifest.currentDraft.sourceCode !== "string" || manifest.currentDraft.sourceCode.length > MAX_SUBMISSION_SOURCE_LENGTH)) {
    return { ok: false, status: 413, code: "SOURCE_TOO_LARGE", message: "Draft source code is too large" };
  }
  return null;
}

export function createImportService(db: Database) {
  const database = db as RepositoryDb;
  return {
    async previewImport(userId: string, input: unknown): Promise<ImportPreviewResult> {
      if (!isManifest(input)) return { ok: false, status: 400, code: "INVALID_MANIFEST", message: "Import manifest is invalid" };
      const validation = validateManifest(input);
      if (validation) return validation;
      const codes = new Set(input.problems.map((problem) => problem.id));
      const cloud = await database.select({ id: problems.id, problemCode: problems.problemCode, version: problems.version })
        .from(problems).where(and(eq(problems.userId, userId), isNull(problems.deletedAt)));
      const conflicts = cloud.filter((problem) => codes.has(problem.problemCode)).map((problem) => ({
        localProblemKey: problem.problemCode,
        cloudProblemId: problem.id,
        problemCode: problem.problemCode,
        cloudVersion: problem.version,
      }));
      return {
        ok: true,
        value: {
          counts: {
            folders: input.folders.length,
            problems: input.problems.length,
            testCases: input.problems.reduce((sum, problem) => sum + problem.testCases.length, 0),
            drafts: input.currentDraft ? 1 : 0,
            conversations: input.conversations.length,
          },
          conflicts,
          previewFingerprint: await fingerprintManifest(input),
        },
      };
    },
  };
}

export type ImportService = ReturnType<typeof createImportService>;

