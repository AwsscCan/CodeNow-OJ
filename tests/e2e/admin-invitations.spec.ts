import { expect, test } from "@playwright/test";

test.use({ trace: "off", screenshot: "off" });
test.describe.configure({ retries: 0 });

const ownerEmail = "700whitebird007@gmail.com";
const ownerPassword = "Owner-formal-password-2026!";
const friendEmail = "friend-admin-e2e@example.test";
const friendPassword = "Friend-formal-password-2026!";

async function loginAndComplete(page: import("@playwright/test").Page, email: string, temporaryPassword: string, formalPassword: string) {
  await page.goto("/login");
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return Boolean(form && Object.keys(form).some((key) => key.startsWith("__reactProps")));
  });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(temporaryPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/change-temporary-password/);
  expect(await page.context().cookies()).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: expect.stringMatching(/session_token/) }),
  ]));
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return Boolean(form && Object.keys(form).some((key) => key.startsWith("__reactProps")));
  });
  await page.locator('input[name="currentPassword"]').fill(temporaryPassword);
  await page.locator('input[name="newPassword"]').fill(formalPassword);
  await page.locator('input[name="confirmPassword"]').fill(formalPassword);
  const completionResponse = page.waitForResponse((response) => response.url().endsWith("/api/account/complete-invitation"));
  await page.locator('button[type="submit"]').click();
  expect((await completionResponse).status()).toBe(200);
  await expect(page).toHaveURL(/library/);
  expect(await page.context().cookies()).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: expect.stringMatching(/session_token/) }),
  ]));
}

test("administrator invitation lifecycle preserves private data and revokes banned sessions", async ({ browser, request }) => {
  const bootstrap = await request.post("/api/internal/bootstrap-admin", {
    headers: { authorization: "Bearer e2e-bootstrap-token" },
    data: { email: ownerEmail, name: "管理员" },
  });
  expect(bootstrap.status()).toBe(201);
  const bootstrapBody = await bootstrap.json() as { temporaryPassword: string };

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginAndComplete(adminPage, ownerEmail, bootstrapBody.temporaryPassword, ownerPassword);
  const adminSession = await adminContext.request.get("/api/auth/get-session");
  expect(await adminSession.json()).toMatchObject({ user: { email: ownerEmail, role: "admin", mustChangePassword: false } });
  await adminPage.goto("/admin");
  await expect(adminPage.getByRole("heading", { name: "管理控制台" })).toBeVisible();
  const migrationDialog = adminPage.getByRole("dialog", { name: "导入本地数据" });
  await migrationDialog.waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
  if (await migrationDialog.isVisible().catch(() => false)) {
    await migrationDialog.getByRole("button", { name: "暂不导入" }).click();
  }

  await adminPage.getByLabel("好友名称").fill("熟悉的朋友");
  await adminPage.getByLabel("好友邮箱").fill(friendEmail);
  await adminPage.getByRole("button", { name: "创建邀请账户" }).click();
  const friendTemporaryPassword = await adminPage.getByRole("dialog", { name: "一次性临时密码" }).locator("code").textContent();
  expect(friendTemporaryPassword).toBeTruthy();
  await adminPage.getByRole("button", { name: "我已保存，关闭" }).click();

  const friendContext = await browser.newContext();
  const friendPage = await friendContext.newPage();
  await loginAndComplete(friendPage, friendEmail, friendTemporaryPassword!, friendPassword);
  const problem = await friendContext.request.post("/api/problems", { data: {
    problemCode: "ADMIN-E2E-001", title: "管理员审核示例题", difficulty: "入门", timeLimit: "1s", memoryLimit: "64MB",
    description: "private", inputFormat: "input", outputFormat: "output",
  } });
  expect(problem.status()).toBe(201);

  await adminPage.reload();
  await expect(adminPage.getByText("管理员审核示例题")).toBeVisible();
  const contentRow = adminPage.getByRole("listitem").filter({ hasText: "管理员审核示例题" });
  await contentRow.getByRole("button", { name: "软删除" }).click();
  await adminPage.getByRole("button", { name: "确认软删除" }).click();
  await expect(contentRow.getByRole("button", { name: "恢复" })).toBeVisible();
  await contentRow.getByRole("button", { name: "恢复" }).click();
  await expect(contentRow.getByRole("button", { name: "软删除" })).toBeVisible();

  const friendRow = adminPage.getByRole("row").filter({ hasText: friendEmail });
  await friendRow.getByRole("button", { name: "封禁" }).click();
  await adminPage.getByRole("button", { name: "确认封禁" }).click();
  const revoked = await friendContext.request.get("/api/me");
  expect(await revoked.json()).toEqual({ user: null });

  await adminPage.reload();
  await adminPage.getByRole("row").filter({ hasText: friendEmail }).getByRole("button", { name: "解封" }).click();
  await adminContext.close();
  await friendContext.close();
});
