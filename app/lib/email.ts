import { Resend } from "resend";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

type EmailConfig = {
  environment: "development" | "test" | "production";
  apiKey?: string;
  from?: string;
  sink?: (line: string) => void;
};

export function createEmailSender(config: EmailConfig) {
  if (process.env.E2E_TEST === "1") {
    return async (message: EmailMessage) => {
      const { recordTestEmail } = await import("./test-email-sink");
      recordTestEmail(message);
    };
  }

  if (!config.apiKey) {
    if (config.environment === "production") {
      throw new Error("RESEND_API_KEY is required in production");
    }

    return async (message: EmailMessage) => {
      const sink = config.sink ?? console.info;
      sink(`[dev-email] ${message.to} ${message.subject} ${message.text}`);
    };
  }

  const resend = new Resend(config.apiKey);
  return async (message: EmailMessage) => {
    const result = await resend.emails.send({
      from: config.from ?? "CodeNow <onboarding@resend.dev>",
      ...message,
    });
    if (result.error) throw new Error(result.error.message);
  };
}
