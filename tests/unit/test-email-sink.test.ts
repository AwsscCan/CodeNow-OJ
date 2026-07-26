import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../../app/api/test/emails/route";
import { createEmailSender } from "../../app/lib/email";
import { clearTestEmails, listTestEmails } from "../../app/lib/test-email-sink";

const originalE2eTest = process.env.E2E_TEST;

afterEach(() => {
  if (originalE2eTest === undefined) delete process.env.E2E_TEST;
  else process.env.E2E_TEST = originalE2eTest;
  clearTestEmails();
});

describe("E2E email sink", () => {
  it("captures exact messages by recipient without logging them", async () => {
    process.env.E2E_TEST = "1";
    const send = createEmailSender({ environment: "development" });

    await send({ to: "a@example.test", subject: "Verify", text: "https://example.test/verify?a" });
    await send({ to: "b@example.test", subject: "Reset", text: "https://example.test/reset?b" });

    expect(listTestEmails("a@example.test")).toEqual([
      { to: "a@example.test", subject: "Verify", text: "https://example.test/verify?a" },
    ]);
    expect(listTestEmails("b@example.test")).toHaveLength(1);
  });

  it("exposes recipient messages only in E2E mode without caching", async () => {
    process.env.E2E_TEST = "1";
    await createEmailSender({ environment: "test" })({
      to: "reader@example.test",
      subject: "Verify",
      text: "https://example.test/verify",
    });

    const response = await GET(new Request("http://localhost/api/test/emails?to=reader%40example.test"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      messages: [{ to: "reader@example.test", subject: "Verify", text: "https://example.test/verify" }],
    });
  });

  it("is unavailable outside E2E mode", async () => {
    delete process.env.E2E_TEST;

    const response = await GET(new Request("http://localhost/api/test/emails?to=reader%40example.test"));

    expect(response.status).toBe(404);
  });
});
