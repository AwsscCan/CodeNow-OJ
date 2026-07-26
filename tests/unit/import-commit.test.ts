import { count, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { createImportCommitHandlers } from "../../app/api/imports/local-data/commit/route";
import { fingerprintManifest } from "../../app/lib/local-data/fingerprint";
import type { LocalDataManifestV1 } from "../../app/lib/local-data/types";
import { createImportService } from "../../app/server/imports/import-service";
import { createProblemRepository } from "../../app/server/problems/problem-repository";
import { createLocalDb } from "../../db/client";
import { dataImports, folders, problems, testCases, users } from "../../db/schema";

const baseManifest: LocalDataManifestV1 = {
  schemaVersion: 1,
  folders: ["算法"],
  problems: [{
    id: "CF0001", title: "Local", difficulty: "入门", timeLimit: "1s", memoryLimit: "64MB",
    description: "Local", inputFormat: "input", outputFormat: "output", folder: "算法",
    testCases: [{ id: "t1", input: "1", expectedOutput: "1" }],
  }],
  currentDraft: { problemId: "CF0001", language: "cpp", sourceCode: "int main(){}" },
  preferences: { themeMode: "dark" },
  conversations: [{ id: "c1", problemId: "CF0001", messages: [{ role: "user", content: "hint" }] }],
};

describe("local import commit", () => {
  let db: ReturnType<typeof createLocalDb>;
  let service: ReturnType<typeof createImportService>;
  let resolve: () => Promise<{ userId: string; service: typeof service } | null>;

  beforeEach(async () => {
    db = createLocalDb(":memory:");
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    await db.insert(users).values({ id: "user-a", name: "A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now });
    service = createImportService(db);
    resolve = async () => ({ userId: "user-a", service });
  });

  it("requires an idempotency key", async () => {
    const response = await createImportCommitHandlers(resolve).POST(await request(baseManifest));
    expect(response.status).toBe(400);
  });

  it("returns the first result for a repeated identical commit", async () => {
    const first = await createImportCommitHandlers(resolve).POST(await request(baseManifest, "same-key"));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    const second = await createImportCommitHandlers(resolve).POST(await request(baseManifest, "same-key"));
    expect(await second.json()).toEqual(firstBody);
    expect((await db.select({ value: count() }).from(dataImports))[0].value).toBe(1);
    expect((await db.select({ value: count() }).from(problems))[0].value).toBe(1);
  });

  it("returns the first result when identical first commits race", async () => {
    const handlers = createImportCommitHandlers(resolve);
    const [firstRequest, secondRequest] = await Promise.all([
      request(baseManifest, "racing-key"),
      request(baseManifest, "racing-key"),
    ]);
    const [first, second] = await Promise.all([handlers.POST(firstRequest), handlers.POST(secondRequest)]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect((await db.select({ value: count() }).from(dataImports))[0].value).toBe(1);
  });

  it("rejects a fingerprint mismatch", async () => {
    const response = await createImportCommitHandlers(resolve).POST(await request(baseManifest, "mismatch", {}, "wrong"));
    expect(response.status).toBe(409);
  });

  it.each(["overwrite", "duplicate", "skip"] as const)("applies the %s conflict decision", async (action) => {
    const repository = createProblemRepository(db);
    const cloud = await repository.createProblem("user-a", {
      problemCode: "CF0001", title: "Cloud", difficulty: "入门", timeLimit: "1s", memoryLimit: "64MB",
      description: "Cloud", inputFormat: "input", outputFormat: "output",
    });
    if (!cloud.ok) throw new Error(cloud.message);
    const response = await createImportCommitHandlers(resolve).POST(await request(baseManifest, `decision-${action}`, {
      CF0001: { action, cloudVersion: 1 },
    }));
    expect(response.status).toBe(200);
    const rows = await db.select().from(problems).where(eq(problems.userId, "user-a"));
    if (action === "overwrite") expect(rows.find((row) => row.id === cloud.value.id)?.title).toBe("Local");
    if (action === "duplicate") expect(rows.map((row) => row.problemCode)).toContain("CF0001-COPY-1");
    if (action === "skip") expect(rows).toHaveLength(1);
  });

  it("rejects a stale cloud version", async () => {
    const repository = createProblemRepository(db);
    await repository.createProblem("user-a", {
      problemCode: "CF0001", title: "Cloud", difficulty: "入门", timeLimit: "1s", memoryLimit: "64MB",
      description: "Cloud", inputFormat: "input", outputFormat: "output",
    });
    const response = await createImportCommitHandlers(resolve).POST(await request(baseManifest, "stale", {
      CF0001: { action: "overwrite", cloudVersion: 99 },
    }));
    expect(response.status).toBe(409);
  });

  it("rejects extra or malformed conflict decisions", async () => {
    const repository = createProblemRepository(db);
    await repository.createProblem("user-a", {
      problemCode: "CF0001", title: "Cloud", difficulty: "鍏ラ棬", timeLimit: "1s", memoryLimit: "64MB",
      description: "Cloud", inputFormat: "input", outputFormat: "output",
    });
    const extraKey = await createImportCommitHandlers(resolve).POST(await request(baseManifest, "extra-decision", {
      CF0001: { action: "skip", cloudVersion: 1 },
      UNKNOWN: { action: "skip" },
    }));
    expect(extraKey.status).toBe(400);

    const extraField = await createImportCommitHandlers(resolve).POST(await request(baseManifest, "extra-field", {
      CF0001: { action: "duplicate", cloudVersion: 1, unexpected: true },
    }));
    expect(extraField.status).toBe(400);

    const staleOptionalVersion = await createImportCommitHandlers(resolve).POST(await request(baseManifest, "stale-optional-version", {
      CF0001: { action: "skip", cloudVersion: 99 },
    }));
    expect(staleOptionalVersion.status).toBe(409);
  });

  it("rolls back every row when one manifest item is invalid", async () => {
    const invalid = { ...baseManifest, problems: [...baseManifest.problems, { ...baseManifest.problems[0], id: "BAD", title: "" }] };
    const response = await createImportCommitHandlers(resolve).POST(await request(invalid, "rollback"));
    expect(response.status).toBe(400);
    expect((await db.select({ value: count() }).from(problems))[0].value).toBe(0);
    expect((await db.select({ value: count() }).from(testCases))[0].value).toBe(0);
    expect((await db.select({ value: count() }).from(dataImports))[0].value).toBe(0);
  });

  it("rolls back earlier writes when a later database write fails", async () => {
    db.$client.exec(`
      CREATE TRIGGER reject_bad_import
      BEFORE INSERT ON problems
      WHEN NEW.problem_code = 'BAD'
      BEGIN
        SELECT RAISE(ABORT, 'invalid imported item');
      END;
    `);
    const manifest = {
      ...baseManifest,
      problems: [baseManifest.problems[0], { ...baseManifest.problems[0], id: "BAD", title: "Rejected later" }],
    };
    await expect(createImportCommitHandlers(resolve).POST(await request(manifest, "transaction-rollback")))
      .rejects.toThrow("invalid imported item");
    expect((await db.select({ value: count() }).from(folders))[0].value).toBe(0);
    expect((await db.select({ value: count() }).from(problems))[0].value).toBe(0);
    expect((await db.select({ value: count() }).from(testCases))[0].value).toBe(0);
    expect((await db.select({ value: count() }).from(dataImports))[0].value).toBe(0);
  });

  it("never stores local API key fields", async () => {
    const tainted = { ...baseManifest, preferences: { ...baseManifest.preferences, apiKey: "sk-secret" } } as LocalDataManifestV1;
    const response = await createImportCommitHandlers(resolve).POST(await request(tainted, "secret"));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await db.select().from(dataImports))).not.toContain("sk-secret");
  });

  it("rejects invalid preference fields before writing", async () => {
    const invalid = { ...baseManifest, preferences: { themeMode: 42 } } as unknown as LocalDataManifestV1;
    const response = await createImportCommitHandlers(resolve).POST(await request(invalid, "invalid-preferences"));
    expect(response.status).toBe(400);
    expect((await db.select({ value: count() }).from(dataImports))[0].value).toBe(0);
  });

  it("preserves nested folder ancestry", async () => {
    const nested = {
      ...baseManifest,
      folders: ["Root", "Root/Child"],
      problems: [{ ...baseManifest.problems[0], folder: "Root/Child" }],
    };
    const response = await createImportCommitHandlers(resolve).POST(await request(nested, "nested-folders"));
    expect(response.status).toBe(200);
    const rows = await db.select().from(folders).where(eq(folders.userId, "user-a"));
    const root = rows.find((row) => row.name === "Root");
    expect(rows.find((row) => row.name === "Child")?.parentId).toBe(root?.id);
  });

  it("rejects invalid nested item fields before the transaction", async () => {
    const invalid = {
      ...baseManifest,
      problems: [{ ...baseManifest.problems[0], testCases: [{ ...baseManifest.problems[0].testCases[0], category: "unknown" }] }],
    } as unknown as LocalDataManifestV1;
    const response = await createImportCommitHandlers(resolve).POST(await request(invalid, "invalid-nested-field"));
    expect(response.status).toBe(400);
    expect((await db.select({ value: count() }).from(problems))[0].value).toBe(0);
  });

  async function request(manifest: LocalDataManifestV1, key?: string, decisions: Record<string, unknown> = {}, fingerprint?: string) {
    return new Request("http://localhost/api/imports/local-data/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
      body: JSON.stringify({ manifest, decisions, previewFingerprint: fingerprint ?? await fingerprintManifest(manifest) }),
    });
  }
});
