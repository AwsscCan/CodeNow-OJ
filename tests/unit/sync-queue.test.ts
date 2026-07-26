// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest requires its environment directive before imports. */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSyncQueue, type SyncQueue } from "../../app/lib/local-data/queue";

describe("persistent sync queue", () => {
  let name: string;
  let now: number;
  let queue: SyncQueue;

  beforeEach(() => {
    name = `sync-queue-${crypto.randomUUID()}`;
    now = 10_000;
    queue = createSyncQueue({ databaseName: name, now: () => now });
  });

  afterEach(async () => {
    queue.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });

  it("enqueues and deduplicates the newest payload by user and resource", async () => {
    const first = await queue.enqueue(input({ title: "first" }));
    const second = await queue.enqueue(input({ title: "latest" }));
    expect(second.id).toBe(first.id);
    expect(second.payload).toEqual({ title: "latest" });
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(await queue.listAll()).toHaveLength(1);
  });

  it("deduplicates concurrent saves for the same resource", async () => {
    await Promise.all([
      queue.enqueue(input({ title: "first" })),
      queue.enqueue(input({ title: "latest" })),
    ]);
    expect(await queue.listAll()).toHaveLength(1);
  });

  it("does not reset retry state when an unchanged payload is queued after reload", async () => {
    const first = await queue.enqueue(input({ title: "unchanged" }));
    const failed = await queue.markFailure(first.id, "network");
    const repeated = await queue.enqueue(input({ title: "unchanged" }));
    expect(repeated).toMatchObject({ id: first.id, idempotencyKey: first.idempotencyKey, attempts: failed.attempts, nextAttemptAt: failed.nextAttemptAt });
  });

  it("rejects credentials and personal identity fields at any depth", async () => {
    await expect(queue.enqueue(input({ nested: { apiKey: "sk-secret" } }))).rejects.toThrow("sensitive");
    await expect(queue.enqueue(input({ token: "secret" }))).rejects.toThrow("sensitive");
    await expect(queue.enqueue(input({ email: "user@example.com" }))).rejects.toThrow("sensitive");
    expect(await queue.listAll()).toEqual([]);
  });

  it("uses capped exponential retry delays before requiring manual retry", async () => {
    let record = await queue.enqueue(input({ title: "retry" }));
    for (const delay of [1_000, 5_000, 30_000, 120_000]) {
      record = await queue.markFailure(record.id, "network");
      expect(record.nextAttemptAt).toBe(now + delay);
      now = record.nextAttemptAt!;
    }
    record = await queue.markFailure(record.id, "network");
    expect(record.attempts).toBe(5);
    expect(record.nextAttemptAt).toBeNull();
    expect(record.pauseReason).toBe("manual");
  });

  it("recovers queued data after a new queue instance opens the same IndexedDB", async () => {
    const saved = await queue.enqueue(input({ title: "survives reload" }));
    queue.close();
    queue = createSyncQueue({ databaseName: name, now: () => now });
    expect(await queue.getByResource("user-a", "problem", "problem-1")).toMatchObject({ id: saved.id, payload: { title: "survives reload" } });
  });

  it("pauses on 401 and resumes only for the same authenticated user", async () => {
    const saved = await queue.enqueue(input({ title: "auth" }));
    await queue.markFailure(saved.id, "auth");
    expect(await queue.readyForUser("user-a")).toEqual([]);
    await queue.resumeForUser("user-b");
    expect((await queue.get(saved.id))?.pauseReason).toBe("auth");
    await queue.resumeForUser("user-a");
    expect(await queue.readyForUser("user-a")).toHaveLength(1);
  });

  it("pauses conflicts until an explicit retry and removes successful entries", async () => {
    const saved = await queue.enqueue(input({ title: "conflict" }));
    const paused = await queue.markFailure(saved.id, "conflict", { currentVersion: 4, updatedAt: "server-time" });
    expect(paused).toMatchObject({ nextAttemptAt: null, pauseReason: "conflict", currentVersion: 4 });
    expect(await queue.readyForUser("user-a")).toEqual([]);
    await queue.retry(saved.id, 4);
    expect(await queue.readyForUser("user-a")).toHaveLength(1);
    await queue.remove(saved.id);
    expect(await queue.get(saved.id)).toBeNull();
  });

  it("exposes only anonymous local entries while logged out without deleting account queues", async () => {
    await queue.enqueue(input({ title: "private" }));
    await queue.enqueue({ ...input({ title: "anonymous" }), userId: null, resourceId: "local-1" });
    expect((await queue.listForUser(null)).map((entry) => entry.payload)).toEqual([{ title: "anonymous" }]);
    expect(await queue.listAll()).toHaveLength(2);
  });

  function input(payload: unknown) {
    return { userId: "user-a", resourceType: "problem", resourceId: "problem-1", baseVersion: 1, payload };
  }
});
