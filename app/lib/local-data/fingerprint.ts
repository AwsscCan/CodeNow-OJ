import type { LocalDataManifestV1 } from "./types";

function deterministicJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(deterministicJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${deterministicJson(record[key])}`).join(",")}}`;
}

export async function fingerprintManifest(manifest: LocalDataManifestV1) {
  const bytes = new TextEncoder().encode(deterministicJson(manifest));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export { deterministicJson };

