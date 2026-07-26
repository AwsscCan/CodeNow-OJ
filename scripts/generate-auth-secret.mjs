import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function generateAuthSecret(bytes = 48) {
  if (!Number.isInteger(bytes) || bytes < 32) throw new Error("Secret length must be at least 32 bytes");
  return randomBytes(bytes).toString("base64url");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(`${generateAuthSecret()}\n`);
}
