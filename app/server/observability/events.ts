type EventDetails = Record<string, unknown>;
type EventInput = {
  requestId: string;
  eventName: string;
  status: number;
  durationMs: number;
  userId?: string;
  pepper: string;
  details?: EventDetails;
};

const privateField = /(password|token|email|apikey|secret|credential|sourcecode|testdata|input|expectedoutput|content|message)/i;

async function opaqueHash(value: string, pepper: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${value}\u0000${pepper}`));
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function redact(value: unknown, seen = new Set<object>()): unknown {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  return Object.fromEntries(Object.entries(value as EventDetails)
    .filter(([key]) => !privateField.test(key.replace(/[^a-z]/gi, "")))
    .map(([key, item]) => [key, redact(item, seen)]));
}

export async function createSecurityEvent(input: EventInput) {
  return {
    requestId: input.requestId,
    eventName: input.eventName,
    status: input.status,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    ...(input.userId ? { userHash: await opaqueHash(input.userId, input.pepper) } : {}),
    details: redact(input.details ?? {}) as EventDetails,
  };
}

export type SecurityEvent = Awaited<ReturnType<typeof createSecurityEvent>>;

export function emitSecurityEvent(event: SecurityEvent, sink: (value: SecurityEvent) => void = console.info) {
  sink(event);
}
