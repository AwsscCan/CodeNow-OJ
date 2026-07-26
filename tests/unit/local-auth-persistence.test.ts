import { eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalRuntimeServices } from "../../app/lib/auth";
import { users } from "../../db/schema";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("persistent local authentication", () => {
  it("keeps users when runtime services reopen the same SQLite file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codenow-auth-"));
    directories.push(directory);
    const filename = join(directory, "nested", "codenow.db");
    const request = new Request("http://localhost/api/me");
    const first = createLocalRuntimeServices(request, filename);
    const now = new Date();
    await first.db.insert(users).values({
      id: "persistent-admin", name: "Admin", email: "admin@example.test", emailVerified: true,
      role: "admin", createdAt: now, updatedAt: now,
    });

    const reopened = createLocalRuntimeServices(request, filename);

    expect((await reopened.db.select().from(users).where(eq(users.id, "persistent-admin")))[0]).toMatchObject({
      email: "admin@example.test", role: "admin",
    });
    (first.db as unknown as { $client: { close(): void } }).$client.close();
    (reopened.db as unknown as { $client: { close(): void } }).$client.close();
  });
});
