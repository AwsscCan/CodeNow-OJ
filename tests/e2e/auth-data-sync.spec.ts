import { expect, test } from "@playwright/test";
import { createProblem, createVerifiedContext, latestEmail, PASSWORD } from "./helpers";

test("two users keep all private resources isolated through migration, conflicts, reset, and logout", async ({ browser }) => {
  const stamp = Date.now();
  const userA = { name: "E2E A", email: `e2e-a-${stamp}@example.com` };
  const userB = { name: "E2E B", email: `e2e-b-${stamp}@example.com` };
  const [contextA, contextB] = await Promise.all([
    createVerifiedContext(browser, userA),
    createVerifiedContext(browser, userB),
  ]);

  const [createdA, createdB] = await Promise.all([
    createProblem(contextA, "Private A"),
    createProblem(contextB, "Private B"),
  ]);
  expect(createdA.problem.id).not.toBe(createdB.problem.id);

  const testsA = await contextA.request.put(`/api/problems/${createdA.problem.id}/test-cases`, { data: {
    version: 1, testCases: [{ input: "A-input", expectedOutput: "A-output" }],
  } });
  const testsB = await contextB.request.put(`/api/problems/${createdB.problem.id}/test-cases`, { data: {
    version: 1, testCases: [{ input: "B-input", expectedOutput: "B-output" }],
  } });
  expect(testsA.ok()).toBeTruthy();
  expect(testsB.ok()).toBeTruthy();
  const privateWrites = await Promise.all([
    contextA.request.put(`/api/drafts/${createdA.problem.id}`, { data: { problemKind: "private", language: "cpp", sourceCode: "// A draft", expectedVersion: 0 } }),
    contextB.request.put(`/api/drafts/${createdB.problem.id}`, { data: { problemKind: "private", language: "cpp", sourceCode: "// B draft", expectedVersion: 0 } }),
    contextA.request.patch("/api/preferences", { data: { version: 0, patch: { themeMode: "dark", editorTheme: "girl" } } }),
    contextB.request.patch("/api/preferences", { data: { version: 0, patch: { themeMode: "girl", editorTheme: "dark" } } }),
  ]);
  expect(privateWrites.every((response) => response.ok())).toBeTruthy();

  const createConversationA = await contextA.request.post("/api/conversations", { data: { title: "A chat", problemRef: createdA.problem.id } });
  const createConversationB = await contextB.request.post("/api/conversations", { data: { title: "B chat", problemRef: createdB.problem.id } });
  expect(createConversationA.status()).toBe(201);
  expect(createConversationB.status()).toBe(201);
  const conversationA = await createConversationA.json();
  const conversationB = await createConversationB.json();
  const messageA = await contextA.request.post(`/api/conversations/${conversationA.conversation.id}/messages`, {
    headers: { "Idempotency-Key": "e2e-a-message" }, data: { expectedVersion: 1, role: "user", content: "A message" },
  });
  const messageB = await contextB.request.post(`/api/conversations/${conversationB.conversation.id}/messages`, {
    headers: { "Idempotency-Key": "e2e-b-message" }, data: { expectedVersion: 1, role: "user", content: "B message" },
  });
  expect(messageA.status()).toBe(201);
  expect(messageB.status()).toBe(201);

  const restoredA = await (await contextA.request.get(`/api/problems/${createdA.problem.id}`)).json();
  const restoredB = await (await contextB.request.get(`/api/problems/${createdB.problem.id}`)).json();
  expect(restoredA.problem.testCases[0].input).toBe("A-input");
  expect(restoredB.problem.testCases[0].input).toBe("B-input");
  const draftA = await (await contextA.request.get(`/api/drafts/${createdA.problem.id}?problemKind=private&language=cpp`)).json();
  const draftB = await (await contextB.request.get(`/api/drafts/${createdB.problem.id}?problemKind=private&language=cpp`)).json();
  expect(draftA.draft.sourceCode).toBe("// A draft");
  expect(draftB.draft.sourceCode).toBe("// B draft");
  await expect((await contextA.request.get("/api/preferences")).json()).resolves.toMatchObject({ preferences: { themeMode: "dark", editorTheme: "girl" } });
  await expect((await contextB.request.get("/api/preferences")).json()).resolves.toMatchObject({ preferences: { themeMode: "girl", editorTheme: "dark" } });
  await expect((await contextA.request.get(`/api/conversations/${conversationA.conversation.id}/messages`)).json()).resolves.toMatchObject({ items: [{ content: "A message" }] });
  await expect((await contextB.request.get(`/api/conversations/${conversationB.conversation.id}/messages`)).json()).resolves.toMatchObject({ items: [{ content: "B message" }] });
  expect((await contextB.request.get(`/api/problems/${createdA.problem.id}`)).status()).toBe(404);
  expect((await contextB.request.get(`/api/conversations/${conversationA.conversation.id}/messages`)).status()).toBe(404);
  expect((await contextB.request.get(`/api/drafts/${createdA.problem.id}?problemKind=private&language=cpp`)).status()).toBe(404);

  const updated = await contextA.request.patch(`/api/problems/${createdA.problem.id}`, { data: { version: 2, patch: { title: "A changed" } } });
  expect(updated.ok()).toBeTruthy();
  expect((await contextA.request.patch(`/api/problems/${createdA.problem.id}`, { data: { version: 2, patch: { title: "stale" } } })).status()).toBe(409);

  const manifest = {
    schemaVersion: 1, folders: ["迁移"],
    problems: [{ id: "MIG-E2E", title: "Migrated", difficulty: "入门", timeLimit: "1s", memoryLimit: "64MB", description: "m", inputFormat: "i", outputFormat: "o", folder: "迁移", testCases: [{ id: "t1", input: "1", expectedOutput: "1" }] }],
    currentDraft: null, preferences: { themeMode: "dark" }, conversations: [],
  };
  const preview = await (await contextA.request.post("/api/imports/local-data/preview", { data: { manifest } })).json();
  const migrated = await contextA.request.post("/api/imports/local-data/commit", {
    headers: { "Idempotency-Key": "e2e-migration" }, data: { manifest, previewFingerprint: preview.previewFingerprint, decisions: {} },
  });
  expect(migrated.ok()).toBeTruthy();

  const resetRequest = await contextA.request.post("/api/auth/request-password-reset", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { email: userA.email, redirectTo: "/reset-password" },
  });
  expect(resetRequest.ok()).toBeTruthy();
  const resetEmail = await latestEmail(contextA, userA.email, "重置");
  const resetUrl = resetEmail.text.match(/https?:\/\/[^\s]+/)?.[0];
  const resetLink = new URL(resetUrl!);
  const token = resetLink.searchParams.get("token") ?? resetLink.pathname.split("/").at(-1);
  expect(token).toBeTruthy();
  expect((await contextA.request.post("/api/auth/reset-password", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { newPassword: `${PASSWORD}-new`, token },
  })).ok()).toBeTruthy();
  expect(await (await contextA.request.get("/api/me")).json()).toEqual({ user: null });

  const pageB = await contextB.newPage();
  await pageB.goto("/library");
  const postponeMigration = pageB.getByRole("button", { name: "暂不导入" });
  await expect(postponeMigration).toBeVisible();
  await postponeMigration.click();
  await pageB.locator("button.folder-select").filter({ hasText: "云端题库" }).click();
  await expect(pageB.getByText("Private B")).toBeVisible();
  await pageB.reload();
  await expect(pageB.getByText("Private B")).toBeVisible();
  const repeatedMigrationPrompt = pageB.getByRole("button", { name: "暂不导入" });
  if (await repeatedMigrationPrompt.isVisible()) await repeatedMigrationPrompt.click();
  await pageB.getByRole("button", { name: "退出登录" }).click();
  await expect(pageB.getByRole("link", { name: "登录" })).toBeVisible();
  await expect(pageB.getByText("Private B")).toHaveCount(0);

  await contextA.close();
  await contextB.close();
});
