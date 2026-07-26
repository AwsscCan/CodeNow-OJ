import { rmSync } from "node:fs";
import { resolve } from "node:path";

export default function globalSetup() {
  const database = resolve(".data", "playwright.db");
  for (const filename of [database, `${database}-shm`, `${database}-wal`]) rmSync(filename, { force: true });
}
