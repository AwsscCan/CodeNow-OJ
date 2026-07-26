import { expect, type Browser, type BrowserContext } from "@playwright/test";

export const BASE_URL = "http://127.0.0.1:3100";
export const PASSWORD = "E2e-password-123!";

export async function createVerifiedContext(browser: Browser, identity: { name: string; email: string }) {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const signup = await context.request.post("/api/auth/sign-up/email", {
    data: { ...identity, password: PASSWORD, callbackURL: "/library" },
  });
  expect(signup.ok()).toBeTruthy();
  const email = await latestEmail(context, identity.email, "验证");
  const verificationUrl = email.text.match(/https?:\/\/[^\s]+/)?.[0];
  expect(verificationUrl).toBeTruthy();
  const verified = await context.request.get(verificationUrl!);
  expect(verified.ok()).toBeTruthy();
  const signin = await context.request.post("/api/auth/sign-in/email", { data: { email: identity.email, password: PASSWORD } });
  expect(signin.ok()).toBeTruthy();
  return context;
}

export async function latestEmail(context: BrowserContext, to: string, subjectIncludes: string) {
  await expect.poll(async () => {
    const response = await context.request.get(`/api/test/emails?to=${encodeURIComponent(to)}`);
    if (!response.ok()) return 0;
    const body = await response.json() as { messages: Array<{ subject: string }> };
    return body.messages.filter((message) => message.subject.includes(subjectIncludes)).length;
  }).toBeGreaterThan(0);
  const response = await context.request.get(`/api/test/emails?to=${encodeURIComponent(to)}`);
  const body = await response.json() as { messages: Array<{ to: string; subject: string; text: string }> };
  return body.messages.filter((message) => message.subject.includes(subjectIncludes)).at(-1)!;
}

export async function createProblem(context: BrowserContext, title: string) {
  const response = await context.request.post("/api/problems", { data: {
    problemCode: "SHARED-001", title, difficulty: "入门", timeLimit: "1s", memoryLimit: "64MB",
    description: title, inputFormat: "input", outputFormat: "output",
  } });
  expect(response.status()).toBe(201);
  return await response.json() as { problem: { id: string; version: number } };
}
