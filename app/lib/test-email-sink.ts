import type { EmailMessage } from "./email";

const sinkKey = Symbol.for("codenow.e2e-email-sink");
type GlobalWithEmailSink = typeof globalThis & { [sinkKey]?: EmailMessage[] };

function messages(): EmailMessage[] {
  const target = globalThis as GlobalWithEmailSink;
  return target[sinkKey] ??= [];
}

export function recordTestEmail(message: EmailMessage): void {
  messages().push({ ...message });
}

export function listTestEmails(to: string): EmailMessage[] {
  return messages().filter((message) => message.to === to).map((message) => ({ ...message }));
}

export function clearTestEmails(): void {
  messages().length = 0;
}
