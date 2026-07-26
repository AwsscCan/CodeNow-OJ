import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { createD1Db, createLocalDb } from "../../../db/client";
import { aiConversations, aiMessages, codeDrafts, dataImports, folders, problems, testCases, userPreferences } from "../../../db/schema";
import { MAX_SUBMISSION_SOURCE_LENGTH } from "../../api/_lib/constants";
import { fingerprintManifest } from "../../lib/local-data/fingerprint";
import type { LocalDataManifestV1 } from "../../lib/local-data/types";
import { validateProblem, validateTestCases } from "../problems/problem-validation";

type RepositoryDb = ReturnType<typeof createLocalDb>;
type D1Db = ReturnType<typeof createD1Db>;
export type ImportConflict = { localProblemKey: string; cloudProblemId: string; problemCode: string; cloudVersion: number };
export type ImportPreview = {
  counts: { folders: number; problems: number; testCases: number; drafts: number; conversations: number };
  conflicts: ImportConflict[];
  previewFingerprint: string;
};
export type ImportPreviewResult =
  | { ok: true; value: ImportPreview }
  | { ok: false; status: 400 | 413; code: string; message: string };
type ManifestValidationError = { ok: false; status: 400 | 413; code: string; message: string };
export type ImportDecision = { action: "overwrite" | "duplicate" | "skip"; cloudVersion?: number };
export type ImportCommitSummary = {
  fingerprint: string;
  counts: { folders: number; problems: number; testCases: number; drafts: number; conversations: number; overwritten: number; duplicated: number; skipped: number };
};
export type ImportCommitResult =
  | { ok: true; value: ImportCommitSummary }
  | { ok: false; status: 400 | 409 | 413; code: string; message: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function onlyKeys(object: Record<string, unknown>, allowed: readonly string[]) {
  const keys = new Set(allowed);
  return Object.keys(object).every((key) => keys.has(key));
}

function containsApiKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsApiKey);
  const object = record(value);
  return Boolean(object && Object.entries(object).some(([key, item]) =>
    key.replace(/[^a-z]/gi, "").toLowerCase().includes("apikey") || containsApiKey(item)));
}

function isManifest(value: unknown): value is LocalDataManifestV1 {
  const manifest = record(value);
  return Boolean(manifest
    && manifest.schemaVersion === 1
    && Array.isArray(manifest.folders)
    && Array.isArray(manifest.problems)
    && Array.isArray(manifest.conversations)
    && record(manifest.preferences)
    && (manifest.currentDraft === null || record(manifest.currentDraft)));
}

function validateManifest(manifest: LocalDataManifestV1): ManifestValidationError | null {
  if (containsApiKey(manifest)) {
    return { ok: false, status: 400, code: "SENSITIVE_DATA", message: "API keys cannot be imported" };
  }
  if (!manifest.folders.every((folder) => typeof folder === "string" && Boolean(folder.trim()))) {
    return { ok: false, status: 400, code: "INVALID_MANIFEST", message: "Folder entries must be non-empty strings" };
  }
  const folderNames = new Set(manifest.folders);
  if (folderNames.size !== manifest.folders.length || manifest.folders.some((path) => {
    const separator = path.lastIndexOf("/");
    return separator >= 0 && !folderNames.has(path.slice(0, separator));
  })) {
    return { ok: false, status: 400, code: "INVALID_MANIFEST", message: "Folder hierarchy is invalid" };
  }
  const problemKeys = new Set<string>();
  const preferences = record(manifest.preferences);
  const allowedPreferenceKeys = new Set([
    "themeMode", "editorTheme", "aiProvider", "aiEndpoint", "aiModel", "workspaceSplit",
    "selectedFolder", "collapsedFolders", "folderOrder", "includeSubfolders",
  ]);
  const themes = new Set(["light", "dark", "girl"]);
  const providers = new Set(["deepseek", "openai", "custom"]);
  if (!preferences || Object.keys(preferences).some((key) => !allowedPreferenceKeys.has(key))
    || (preferences.themeMode !== undefined && !themes.has(String(preferences.themeMode)))
    || (preferences.editorTheme !== undefined && !themes.has(String(preferences.editorTheme)))
    || (preferences.aiProvider !== undefined && !providers.has(String(preferences.aiProvider)))
    || [preferences.aiEndpoint, preferences.aiModel, preferences.selectedFolder].some((value) => value !== undefined && typeof value !== "string")
    || (preferences.workspaceSplit !== undefined && (typeof preferences.workspaceSplit !== "number" || !Number.isFinite(preferences.workspaceSplit)))
    || (preferences.includeSubfolders !== undefined && typeof preferences.includeSubfolders !== "boolean")
    || [preferences.collapsedFolders, preferences.folderOrder].some((value) => value !== undefined && (!Array.isArray(value) || !value.every((item) => typeof item === "string")))) {
    return { ok: false, status: 400, code: "INVALID_PREFERENCES", message: "Preference fields are invalid" };
  }
  for (const item of manifest.problems) {
    const problem = record(item);
    if (!problem || !onlyKeys(problem, ["id", "title", "difficulty", "timeLimit", "memoryLimit", "description", "inputFormat", "outputFormat", "folder", "testCases", "sourceUrl", "extractionStatus"])
      || typeof problem.id !== "string" || !problem.id.trim() || problemKeys.has(problem.id)
      || typeof problem.folder !== "string" || (problem.folder !== "" && !folderNames.has(problem.folder))
      || (problem.sourceUrl !== undefined && typeof problem.sourceUrl !== "string")
      || (problem.extractionStatus !== undefined && problem.extractionStatus !== "complete" && problem.extractionStatus !== "needs_review")
      || !Array.isArray(problem.testCases)) {
      return { ok: false, status: 400, code: "INVALID_MANIFEST", message: "Problem entries are invalid" };
    }
    problemKeys.add(problem.id);
    const validatedProblem = validateProblem({ ...problem, problemCode: problem.id });
    if (!validatedProblem.ok) {
      return { ok: false, status: 400, code: validatedProblem.code, message: validatedProblem.message };
    }
    const tests = validateTestCases(problem.testCases);
    if (!tests.ok) {
      return { ok: false, status: tests.code.includes("TOO_LARGE") ? 413 : 400, code: tests.code, message: tests.message };
    }
    const testIds = new Set<string>();
    const categories = new Set(["boundary", "special", "ordinary", "adversarial", "performance", "sample", "manual"]);
    if (!problem.testCases.every((test) => {
      const entry = record(test);
      if (!entry || !onlyKeys(entry, ["id", "input", "expectedOutput", "category", "scale", "targets", "reason"])
        || typeof entry.id !== "string" || !entry.id || testIds.has(entry.id)
        || (entry.category !== undefined && !categories.has(String(entry.category)))
        || (entry.scale !== undefined && (typeof entry.scale !== "number" || !Number.isFinite(entry.scale)))
        || (entry.targets !== undefined && typeof entry.targets !== "string")
        || (entry.reason !== undefined && typeof entry.reason !== "string")) return false;
      testIds.add(entry.id);
      return true;
    })) {
      return { ok: false, status: 400, code: "INVALID_MANIFEST", message: "Test case identifiers are invalid" };
    }
  }
  if (manifest.currentDraft) {
    const draft = record(manifest.currentDraft);
    if (!draft || !onlyKeys(draft, ["problemId", "language", "sourceCode"])
      || typeof draft.problemId !== "string" || !problemKeys.has(draft.problemId)
      || draft.language !== "cpp" || typeof draft.sourceCode !== "string") {
      return { ok: false, status: 400, code: "INVALID_DRAFT", message: "Draft fields are invalid" };
    }
    if (draft.sourceCode.length > MAX_SUBMISSION_SOURCE_LENGTH) {
      return { ok: false, status: 413, code: "SOURCE_TOO_LARGE", message: "Draft source code is too large" };
    }
  }
  for (const conversation of manifest.conversations) {
    const item = record(conversation);
    if (!item || !onlyKeys(item, ["id", "problemId", "messages"])
      || typeof item.id !== "string" || !Array.isArray(item.messages)
      || (item.problemId !== undefined && typeof item.problemId !== "string")
      || !item.messages.every((message) => {
        const entry = record(message);
        return Boolean(entry && onlyKeys(entry, ["role", "content"])
          && (entry.role === "user" || entry.role === "assistant") && typeof entry.content === "string");
      })) {
      return { ok: false, status: 400, code: "INVALID_MANIFEST", message: "Conversation entries are invalid" };
    }
  }
  return null;
}

function isD1Database(db: Database): db is D1Db {
  return "batch" in db;
}

function problemValues(problem: LocalDataManifestV1["problems"][number], folderId: string | null) {
  return {
    folderId,
    title: problem.title.trim(),
    difficulty: problem.difficulty.trim(),
    timeLimit: problem.timeLimit.trim(),
    memoryLimit: problem.memoryLimit.trim(),
    description: problem.description.trim(),
    inputFormat: problem.inputFormat.trim(),
    outputFormat: problem.outputFormat.trim(),
    origin: "private",
    sourceUrl: problem.sourceUrl ?? null,
    extractionStatus: problem.extractionStatus ?? null,
  };
}

export function createImportService(db: Database) {
  const database = db as RepositoryDb;

  async function cloudProblems(userId: string) {
    return database.select({ id: problems.id, problemCode: problems.problemCode, version: problems.version })
      .from(problems).where(and(eq(problems.userId, userId), isNull(problems.deletedAt)));
  }

  return {
    async previewImport(userId: string, input: unknown): Promise<ImportPreviewResult> {
      if (!isManifest(input)) return { ok: false, status: 400, code: "INVALID_MANIFEST", message: "Import manifest is invalid" };
      const validation = validateManifest(input);
      if (validation) return validation;
      const codes = new Set(input.problems.map((problem) => problem.id));
      const cloud = await cloudProblems(userId);
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

    async commitImport(userId: string, input: unknown, previewFingerprint: unknown, rawDecisions: unknown, idempotencyKey: string): Promise<ImportCommitResult> {
      const [prior] = await database.select({ resultJson: dataImports.resultJson }).from(dataImports)
        .where(and(eq(dataImports.userId, userId), eq(dataImports.idempotencyKey, idempotencyKey))).limit(1);
      if (prior) return { ok: true, value: JSON.parse(prior.resultJson) as ImportCommitSummary };
      if (!isManifest(input)) return { ok: false, status: 400, code: "INVALID_MANIFEST", message: "Import manifest is invalid" };
      const validation = validateManifest(input);
      if (validation) return validation;
      const fingerprint = await fingerprintManifest(input);
      const [racingPrior] = await database.select({ resultJson: dataImports.resultJson }).from(dataImports)
        .where(and(eq(dataImports.userId, userId), eq(dataImports.idempotencyKey, idempotencyKey))).limit(1);
      if (racingPrior) return { ok: true, value: JSON.parse(racingPrior.resultJson) as ImportCommitSummary };
      if (typeof previewFingerprint !== "string" || previewFingerprint !== fingerprint) {
        return { ok: false, status: 409, code: "PREVIEW_MISMATCH", message: "The import preview is stale" };
      }
      const decisionsObject = record(rawDecisions);
      if (!decisionsObject) return { ok: false, status: 400, code: "INVALID_DECISIONS", message: "Conflict decisions are invalid" };

      const activeCloud = await cloudProblems(userId);
      const allCodes = new Set((await database.select({ problemCode: problems.problemCode }).from(problems)
        .where(eq(problems.userId, userId))).map((row) => row.problemCode));
      const conflictByCode = new Map(activeCloud.map((problem) => [problem.problemCode, problem]));
      const localConflictCodes = new Set(input.problems
        .map((problem) => problem.id)
        .filter((problemCode) => conflictByCode.has(problemCode)));
      if (Object.keys(decisionsObject).some((problemCode) => !localConflictCodes.has(problemCode))) {
        return { ok: false, status: 400, code: "INVALID_DECISIONS", message: "Conflict decisions contain an unknown problem" };
      }
      const decisions = new Map<string, ImportDecision>();
      for (const local of input.problems) {
        const cloud = conflictByCode.get(local.id);
        if (!cloud) continue;
        const decision = record(decisionsObject[local.id]);
        if (!decision || !onlyKeys(decision, ["action", "cloudVersion"])
          || (decision.action !== "overwrite" && decision.action !== "duplicate" && decision.action !== "skip")) {
          return { ok: false, status: 400, code: "MISSING_CONFLICT_DECISION", message: `A valid decision is required for ${local.id}` };
        }
        if ((decision.cloudVersion !== undefined && (!Number.isInteger(decision.cloudVersion) || decision.cloudVersion !== cloud.version))
          || (decision.action === "overwrite" && decision.cloudVersion === undefined)) {
          return { ok: false, status: 409, code: "VERSION_CONFLICT", message: `Cloud problem ${local.id} changed after preview` };
        }
        decisions.set(local.id, { action: decision.action, ...(typeof decision.cloudVersion === "number" ? { cloudVersion: decision.cloudVersion } : {}) });
      }

      const now = new Date();
      const folderIds = new Map(input.folders.map((path) => [path, crypto.randomUUID()]));
      const folderRows = input.folders.map((path, sortOrder) => {
        const separator = path.lastIndexOf("/");
        const parentPath = separator >= 0 ? path.slice(0, separator) : null;
        return {
          id: folderIds.get(path)!, userId, parentId: parentPath ? folderIds.get(parentPath) ?? null : null,
          name: separator >= 0 ? path.slice(separator + 1) : path, sortOrder, createdAt: now, updatedAt: now,
        };
      });
      const writes: Array<
        | { kind: "new"; id: string; code: string; local: LocalDataManifestV1["problems"][number] }
        | { kind: "overwrite"; id: string; version: number; code: string; local: LocalDataManifestV1["problems"][number] }
      > = [];
      const problemIds = new Map<string, string>();
      let overwritten = 0;
      let duplicated = 0;
      let skipped = 0;
      for (const local of input.problems) {
        const cloud = conflictByCode.get(local.id);
        const decision = decisions.get(local.id);
        if (cloud && decision?.action === "skip") {
          skipped += 1;
          continue;
        }
        if (cloud && decision?.action === "overwrite") {
          writes.push({ kind: "overwrite", id: cloud.id, version: cloud.version, code: local.id, local });
          problemIds.set(local.id, cloud.id);
          overwritten += 1;
          continue;
        }
        let code = local.id;
        if (cloud) {
          let copy = 1;
          while (allCodes.has(`${local.id}-COPY-${copy}`)) copy += 1;
          code = `${local.id}-COPY-${copy}`;
          duplicated += 1;
        }
        allCodes.add(code);
        const id = crypto.randomUUID();
        writes.push({ kind: "new", id, code, local });
        problemIds.set(local.id, id);
      }

      const draftProblemId = input.currentDraft ? problemIds.get(input.currentDraft.problemId) : undefined;
      const conversationRows = input.conversations.map((conversation) => {
        const id = crypto.randomUUID();
        const title = conversation.messages.find((message) => message.role === "user")?.content.trim().slice(0, 200) || "导入的本地对话";
        return {
          id, userId, problemRef: conversation.problemId ? problemIds.get(conversation.problemId) ?? null : null,
          title, version: conversation.messages.length + 1, createdAt: now, updatedAt: now,
          messages: conversation.messages.map((message, sortOrder) => ({
            id: crypto.randomUUID(), userId, conversationId: id, role: message.role, content: message.content,
            idempotencyKey: crypto.randomUUID(), sortOrder, version: sortOrder + 2, createdAt: now, updatedAt: now,
          })),
        };
      });
      const summary: ImportCommitSummary = {
        fingerprint,
        counts: {
          folders: folderRows.length,
          problems: writes.length,
          testCases: writes.reduce((sum, write) => sum + write.local.testCases.length, 0),
          drafts: draftProblemId ? 1 : 0,
          conversations: conversationRows.length,
          overwritten, duplicated, skipped,
        },
      };
      const importRow = { id: crypto.randomUUID(), userId, idempotencyKey, fingerprint, resultJson: JSON.stringify(summary), createdAt: now };
      const preferenceRow = input.preferences.themeMode || input.preferences.editorTheme ? {
        userId,
        themeMode: input.preferences.themeMode ?? "light",
        editorTheme: input.preferences.editorTheme ?? "light",
        settingsJson: "{}",
        version: 1,
        createdAt: now,
        updatedAt: now,
      } : null;

      try {
        if (isD1Database(db)) {
          const statements = [];
          if (folderRows.length) statements.push(db.insert(folders).values(folderRows));
          for (const write of writes) {
            const folderId = write.local.folder ? folderIds.get(write.local.folder) ?? null : null;
            if (write.kind === "overwrite") {
              statements.push(db.update(problems).set({
                ...problemValues(write.local, folderId),
                title: sql<string>`case when ${problems.version} = ${write.version} then ${write.local.title.trim()} else null end`,
                version: write.version + 1,
                updatedAt: now,
              }).where(and(eq(problems.userId, userId), eq(problems.id, write.id), isNull(problems.deletedAt))));
              statements.push(db.delete(testCases).where(and(eq(testCases.userId, userId), eq(testCases.problemId, write.id))));
            } else {
              statements.push(db.insert(problems).values({ id: write.id, userId, problemCode: write.code, ...problemValues(write.local, folderId), version: 1, createdAt: now, updatedAt: now }));
            }
            if (write.local.testCases.length) statements.push(db.insert(testCases).values(write.local.testCases.map((test, sortOrder) => ({
              id: crypto.randomUUID(), userId, problemId: write.id, sortOrder, input: test.input, expectedOutput: test.expectedOutput,
              category: test.category ?? null, scale: test.scale ?? null, targets: test.targets ?? null, reason: test.reason ?? null, createdAt: now, updatedAt: now,
            }))));
          }
          if (input.currentDraft && draftProblemId) statements.push(db.insert(codeDrafts).values({
            id: crypto.randomUUID(), userId, problemKind: "private", problemRef: draftProblemId, language: input.currentDraft.language,
            sourceCode: input.currentDraft.sourceCode, version: 1, createdAt: now, updatedAt: now,
          }).onConflictDoUpdate({ target: [codeDrafts.userId, codeDrafts.problemKind, codeDrafts.problemRef, codeDrafts.language], set: { sourceCode: input.currentDraft.sourceCode, updatedAt: now } }));
          if (conversationRows.length) {
            statements.push(db.insert(aiConversations).values(conversationRows.map(({ messages: _messages, ...conversation }) => conversation)));
            const messages = conversationRows.flatMap((conversation) => conversation.messages);
            if (messages.length) statements.push(db.insert(aiMessages).values(messages));
          }
          if (preferenceRow) statements.push(db.insert(userPreferences).values(preferenceRow).onConflictDoNothing({ target: userPreferences.userId }));
          statements.push(db.insert(dataImports).values(importRow));
          await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
        } else {
          database.transaction((tx) => {
          if (folderRows.length) tx.insert(folders).values(folderRows).run();
          for (const write of writes) {
            const folderId = write.local.folder ? folderIds.get(write.local.folder) ?? null : null;
            if (write.kind === "overwrite") {
              const updated = tx.update(problems).set({ ...problemValues(write.local, folderId), version: write.version + 1, updatedAt: now })
                .where(and(eq(problems.userId, userId), eq(problems.id, write.id), eq(problems.version, write.version), isNull(problems.deletedAt))).run();
              if (updated.changes !== 1) throw new Error("IMPORT_VERSION_CONFLICT");
              tx.delete(testCases).where(and(eq(testCases.userId, userId), eq(testCases.problemId, write.id))).run();
            } else {
              tx.insert(problems).values({ id: write.id, userId, problemCode: write.code, ...problemValues(write.local, folderId), version: 1, createdAt: now, updatedAt: now }).run();
            }
            if (write.local.testCases.length) tx.insert(testCases).values(write.local.testCases.map((test, sortOrder) => ({
              id: crypto.randomUUID(), userId, problemId: write.id, sortOrder, input: test.input, expectedOutput: test.expectedOutput,
              category: test.category ?? null, scale: test.scale ?? null, targets: test.targets ?? null, reason: test.reason ?? null, createdAt: now, updatedAt: now,
            }))).run();
          }
          if (input.currentDraft && draftProblemId) tx.insert(codeDrafts).values({
            id: crypto.randomUUID(), userId, problemKind: "private", problemRef: draftProblemId, language: input.currentDraft.language,
            sourceCode: input.currentDraft.sourceCode, version: 1, createdAt: now, updatedAt: now,
          }).onConflictDoUpdate({ target: [codeDrafts.userId, codeDrafts.problemKind, codeDrafts.problemRef, codeDrafts.language], set: { sourceCode: input.currentDraft.sourceCode, updatedAt: now } }).run();
          if (conversationRows.length) {
            tx.insert(aiConversations).values(conversationRows.map(({ messages: _messages, ...conversation }) => conversation)).run();
            const messages = conversationRows.flatMap((conversation) => conversation.messages);
            if (messages.length) tx.insert(aiMessages).values(messages).run();
          }
          if (preferenceRow) tx.insert(userPreferences).values(preferenceRow).onConflictDoNothing({ target: userPreferences.userId }).run();
          tx.insert(dataImports).values(importRow).run();
          });
        }
      } catch (error) {
        const [winner] = await database.select({ resultJson: dataImports.resultJson }).from(dataImports)
          .where(and(eq(dataImports.userId, userId), eq(dataImports.idempotencyKey, idempotencyKey))).limit(1);
        if (winner) return { ok: true, value: JSON.parse(winner.resultJson) as ImportCommitSummary };
        if (error instanceof Error && error.message === "IMPORT_VERSION_CONFLICT") {
          return { ok: false, status: 409, code: "VERSION_CONFLICT", message: "A cloud problem changed during import" };
        }
        const overwrites = writes.filter((write) => write.kind === "overwrite");
        for (const write of overwrites) {
          const [current] = await database.select({ version: problems.version }).from(problems)
            .where(and(eq(problems.userId, userId), eq(problems.id, write.id), isNull(problems.deletedAt))).limit(1);
          if (!current || current.version !== write.version) {
            return { ok: false, status: 409, code: "VERSION_CONFLICT", message: "A cloud problem changed during import" };
          }
        }
        throw error;
      }
      return { ok: true, value: summary };
    },
  };
}

export type ImportService = ReturnType<typeof createImportService>;
