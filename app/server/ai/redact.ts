const GENERIC_CREDENTIAL = /\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9._-]{7,}\b/gi;
const NAMED_CREDENTIAL = /((?:api[-_ ]?key|access[-_ ]?token|secret)\s*[:=]\s*)[^\s,;]+/gi;
const BEARER_CREDENTIAL = /(?:authorization\s*:\s*)?bearer\s+[^\s,;]+/gi;

export function redactSensitiveText(value: unknown, secrets: string[] = [], maxLength = 500): string {
  let message = value instanceof Error ? value.message : String(value ?? "");
  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  return message
    .replace(BEARER_CREDENTIAL, "Bearer [REDACTED]")
    .replace(NAMED_CREDENTIAL, "$1[REDACTED]")
    .replace(GENERIC_CREDENTIAL, "[REDACTED]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
