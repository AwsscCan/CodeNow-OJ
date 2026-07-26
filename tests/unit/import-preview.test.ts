import { count } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createImportPreviewHandlers } from "../../app/api/imports/local-data/preview/route";
import { fingerprintManifest } from "../../app/lib/local-data/fingerprint";
import type { LocalDataManifestV1 } from "../../app/lib/local-data/types";
import { createImportService } from "../../app/server/imports/import-service";
import { createProblemRepository } from "../../app/server/problems/problem-repository";
import { createLocalDb } from "../../db/client";
import { folders, problems, testCases, users } from "../../db/schema";

const manifest: LocalDataManifestV1 = {
  schemaVersion: 1,
  folders: ["算法"],
  problems: [{
    id: "local-1", title: "Local", difficulty: "入门", timeLimit: "1s", memoryLimit: "64MB",
    description: "Local problem", inputFormat: "input", outputFormat: "output", folder: "算法",
    testCases: [{ id: "test-1", input: "1", expectedOutput: "1" }],
  }],
  currentDraft: null,
  preferences: {},
  conversations: [],
};

function post(body: unknown) {
  return new Request("http://localhost/api/imports/local-data/preview", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("local import preview", () => {
  let db: ReturnType<typeof createLocalDb>;
  let service: ReturnType<typeof createImportService>;
  let userId: string | null;
  let resolve: () => Promise<{ userId: string; service: typeof service } | null>;

  beforeEach(async () => {
    db = createLocalDb(":memory:");
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    await db.insert(users).values({ id: "user-a", name: "A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now });
    service = createImportService(db);
    userId = "user-a";
    resolve = async () => userId ? { userId, service } : null;
  });

  it("returns 401 to anonymous callers", async () => {
    userId = null;
    expect((await createImportPreviewHandlers(resolve).POST(post({ manifest }))).status).toBe(401);
  });

  it("produces stable SHA-256 fingerprints for sorted equivalent data", async () => {
    const reversed = { ...manifest, preferences: { includeSubfolders: true, workspaceSplit: 40 } };
    const reordered = { preferences: { workspaceSplit: 40, includeSubfolders: true }, conversations: [], currentDraft: null, problems: manifest.problems, folders: manifest.folders, schemaVersion: 1 } as LocalDataManifestV1;
    expect(await fingerprintManifest(reversed)).toBe(await fingerprintManifest(reordered));
    expect(await fingerprintManifest(reversed)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("previews counts without writing any table", async () => {
    const before = await tableCounts();
    const response = await createImportPreviewHandlers(resolve).POST(post({ manifest }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ counts: { folders: 1, problems: 1, testCases: 1, drafts: 0, conversations: 0 }, conflicts: [] });
    expect(await tableCounts()).toEqual(before);
  });

  it("classifies a same-code cloud conflict", async () => {
    const repository = createProblemRepository(db);
    const cloud = await repository.createProblem("user-a", {
      problemCode: "local-1", title: "Cloud", difficulty: "入门", timeLimit: "1s", memoryLimit: "64MB",
      description: "Cloud problem", inputFormat: "input", outputFormat: "output",
    });
    if (!cloud.ok) throw new Error(cloud.message);
    const response = await createImportPreviewHandlers(resolve).POST(post({ manifest }));
    expect(await response.json()).toMatchObject({
      conflicts: [{ localProblemKey: "local-1", cloudProblemId: cloud.value.id, problemCode: "local-1", cloudVersion: 1 }],
    });
  });

  it("rejects oversized manifests", async () => {
    const oversized: LocalDataManifestV1 = {
      ...manifest,
      problems: [{ ...manifest.problems[0], testCases: [{ id: "large", input: "x".repeat(512 * 1024 + 1), expectedOutput: "x" }] }],
    };
    expect((await createImportPreviewHandlers(resolve).POST(post({ manifest: oversized }))).status).toBe(413);
  });

  async function tableCounts() {
    const [[folderCount], [problemCount], [testCount]] = await Promise.all([
      db.select({ value: count() }).from(folders),
      db.select({ value: count() }).from(problems),
      db.select({ value: count() }).from(testCases),
    ]);
    return { folders: folderCount.value, problems: problemCount.value, testCases: testCount.value };
  }
});
