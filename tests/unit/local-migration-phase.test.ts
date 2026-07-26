import { count, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createImportCommitHandlers } from "../../app/api/imports/local-data/commit/route";
import { createImportPreviewHandlers } from "../../app/api/imports/local-data/preview/route";
import { fingerprintManifest } from "../../app/lib/local-data/fingerprint";
import { parseLocalData } from "../../app/lib/local-data/parse";
import { createImportService } from "../../app/server/imports/import-service";
import { createProblemRepository } from "../../app/server/problems/problem-repository";
import { createLocalDb } from "../../db/client";
import { aiConversations, aiMessages, codeDrafts, dataImports, folders, problems, testCases, userPreferences, users } from "../../db/schema";

describe("local migration phase verification", () => {
  let db: ReturnType<typeof createLocalDb>;
  let service: ReturnType<typeof createImportService>;
  let sessionUserId: string | null;
  let resolve: () => Promise<{ userId: string; service: typeof service } | null>;

  beforeEach(async () => {
    db = createLocalDb(":memory:");
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    await db.insert(users).values([
      { id: "user-a", name: "A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "user-b", name: "B", email: "b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    service = createImportService(db);
    sessionUserId = "user-a";
    resolve = async () => sessionUserId ? { userId: sessionUserId, service } : null;
  });

  it("parses, previews, imports, and idempotently isolates a complete guest fixture", async () => {
    const parsed = parseLocalData(completeFixture());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest).toMatchObject({
      folders: ["算法", "算法/基础"],
      preferences: { themeMode: "dark", aiProvider: "openai", aiModel: "gpt-test", workspaceSplit: 42 },
      conversations: [{ messages: [{ role: "user", content: "请给我提示" }, { role: "assistant", content: "先枚举边界" }] }],
    });
    expect(JSON.stringify(parsed.manifest)).not.toContain("sk-local-secret");

    const preview = await createImportPreviewHandlers(resolve).POST(request("preview", { manifest: parsed.manifest }));
    expect(preview.status).toBe(200);
    const previewBody = await preview.json();
    expect(previewBody).toMatchObject({ counts: { folders: 2, problems: 2, testCases: 3, drafts: 1, conversations: 1 }, conflicts: [] });

    const commitBody = { manifest: parsed.manifest, previewFingerprint: previewBody.previewFingerprint, decisions: {} };
    const first = await createImportCommitHandlers(resolve).POST(request("commit", commitBody, "phase-key"));
    const repeated = await createImportCommitHandlers(resolve).POST(request("commit", commitBody, "phase-key"));
    expect(first.status).toBe(200);
    expect(await repeated.json()).toEqual(await first.json());
    expect(await ownedCounts("user-a")).toEqual({ folders: 2, problems: 2, testCases: 3, drafts: 1, imports: 1 });
    expect((await db.select().from(problems).where(eq(problems.userId, "user-a"))).map((row) => row.title).sort()).toEqual(["A + B", "边界计数"]);
    expect((await db.select().from(codeDrafts).where(eq(codeDrafts.userId, "user-a")))[0].sourceCode).toContain("main");
    expect((await db.select().from(userPreferences).where(eq(userPreferences.userId, "user-a")))[0]).toMatchObject({ themeMode: "dark", editorTheme: "light" });
    expect((await db.select().from(aiConversations).where(eq(aiConversations.userId, "user-a")))[0]).toMatchObject({ problemRef: expect.any(String) });
    expect((await db.select().from(aiMessages).where(eq(aiMessages.userId, "user-a")).orderBy(aiMessages.sortOrder)).map((row) => [row.role, row.content]))
      .toEqual([["user", "请给我提示"], ["assistant", "先枚举边界"]]);
    expect(await ownedCounts("user-b")).toEqual({ folders: 0, problems: 0, testCases: 0, drafts: 0, imports: 0 });
  });

  it("rejects expired sessions and stale conflict decisions without cross-account writes", async () => {
    const parsed = parseLocalData(completeFixture());
    if (!parsed.ok) throw new Error(parsed.error.message);
    sessionUserId = null;
    const anonymous = await createImportCommitHandlers(resolve).POST(request("commit", {
      manifest: parsed.manifest, previewFingerprint: await fingerprintManifest(parsed.manifest), decisions: {},
    }, "expired"));
    expect(anonymous.status).toBe(401);

    sessionUserId = "user-a";
    const repository = createProblemRepository(db);
    const cloud = await repository.createProblem("user-a", {
      problemCode: "MIG1", title: "Cloud", difficulty: "入门", timeLimit: "1s", memoryLimit: "64MB",
      description: "Cloud", inputFormat: "input", outputFormat: "output",
    });
    if (!cloud.ok) throw new Error(cloud.message);
    const preview = await service.previewImport("user-a", parsed.manifest);
    if (!preview.ok) throw new Error(preview.message);
    await repository.updateProblem("user-a", cloud.value.id, cloud.version, { title: "Changed elsewhere" });
    const stale = await createImportCommitHandlers(resolve).POST(request("commit", {
      manifest: parsed.manifest,
      previewFingerprint: preview.value.previewFingerprint,
      decisions: { MIG1: { action: "overwrite", cloudVersion: cloud.version } },
    }, "stale-phase"));
    expect(stale.status).toBe(409);
    expect((await db.select({ value: count() }).from(dataImports))[0].value).toBe(0);
    expect(await ownedCounts("user-b")).toEqual({ folders: 0, problems: 0, testCases: 0, drafts: 0, imports: 0 });
  });

  function request(action: "preview" | "commit", body: unknown, key?: string) {
    return new Request(`http://localhost/api/imports/local-data/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
      body: JSON.stringify(body),
    });
  }

  async function ownedCounts(userId: string) {
    const [[folderCount], [problemCount], [testCount], [draftCount], [importCount]] = await Promise.all([
      db.select({ value: count() }).from(folders).where(eq(folders.userId, userId)),
      db.select({ value: count() }).from(problems).where(eq(problems.userId, userId)),
      db.select({ value: count() }).from(testCases).where(eq(testCases.userId, userId)),
      db.select({ value: count() }).from(codeDrafts).where(eq(codeDrafts.userId, userId)),
      db.select({ value: count() }).from(dataImports).where(eq(dataImports.userId, userId)),
    ]);
    return { folders: folderCount.value, problems: problemCount.value, testCases: testCount.value, drafts: draftCount.value, imports: importCount.value };
  }
});

function completeFixture() {
  const problem = (id: string, title: string, samples: Array<{ id: number; input: string; output: string }>) => ({
    id, title, difficulty: "入门", time: "1s", memory: "64MB", description: title,
    inputFormat: "输入", outputFormat: "输出", samples,
  });
  return {
    "codenow-problem-library": JSON.stringify({ state: {
      folders: ["算法", "算法/基础"], selectedFolder: "算法/基础", includeSubfolders: true,
      archives: [
        { folder: "算法/基础", problem: problem("MIG1", "A + B", [{ id: 1, input: "1 2", output: "3" }, { id: 2, input: "0 0", output: "0" }]) },
        { folder: "算法", problem: problem("MIG2", "边界计数", [{ id: 1, input: "5", output: "5" }]) },
      ],
    } }),
    "codenow-workspace": JSON.stringify({ state: { problem: problem("MIG1", "A + B", [{ id: 1, input: "1 2", output: "3" }]), code: "int main(){return 0;}", workspaceSplit: 42 } }),
    "codenow-theme": JSON.stringify({ state: { themeMode: "dark" } }),
    "codenow-ai": JSON.stringify({ state: {
      provider: "openai", model: "gpt-test", endpoint: "https://example.invalid", apiKey: "sk-local-secret",
      chatMessages: [{ role: "user", content: "请给我提示" }, { role: "assistant", content: "先枚举边界" }],
    } }),
  };
}
