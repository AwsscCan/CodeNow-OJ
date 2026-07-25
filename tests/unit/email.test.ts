import { describe, expect, it, vi } from "vitest";
import { createEmailSender } from "../../app/lib/email";

describe("email sender", () => {
  it("uses the development sink without a Resend key", async () => {
    const sink = vi.fn();
    const send = createEmailSender({ environment: "development", sink });

    await send({
      to: "dev@example.test",
      subject: "Verify",
      text: "http://localhost/verify",
    });

    expect(sink).toHaveBeenCalledWith(expect.stringContaining("http://localhost/verify"));
  });

  it("refuses the development sink in production", () => {
    expect(() => createEmailSender({ environment: "production", sink: vi.fn() }))
      .toThrow("RESEND_API_KEY");
  });
});
