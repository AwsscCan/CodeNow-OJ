// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCloudSave, type CloudSaveResult } from "../../app/hooks/use-cloud-save";
import { createSyncQueue } from "../../app/lib/local-data/queue";

describe("useCloudSave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("keeps anonymous changes local only", async () => {
    const save = vi.fn();
    const { result } = renderHook(() => useCloudSave({ enabled: false, version: 0, save }));
    act(() => result.current.queueSave({ title: "local" }));
    await act(() => vi.runAllTimersAsync());
    expect(result.current.status).toBe("local-only");
    expect(save).not.toHaveBeenCalled();
  });

  it("debounces authenticated edits and becomes synced", async () => {
    const save = vi.fn(async (_payload: unknown, _version: number, _key: string, _signal: AbortSignal) => ({ ok: true as const, version: 2, updatedAt: "now" }));
    const { result } = renderHook(() => useCloudSave({ enabled: true, version: 1, save, delay: 200 }));
    act(() => { result.current.queueSave({ title: "first" }); result.current.queueSave({ title: "latest" }); });
    expect(result.current.status).toBe("saving");
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ title: "latest" });
    expect(result.current.status).toBe("synced");
    expect(result.current.version).toBe(2);
  });

  it("uses a newly supplied server version for the next queued change", async () => {
    const save = vi.fn(async (_payload: unknown, version: number, _key: string, _signal: AbortSignal) => ({ ok: true as const, version: version + 1, updatedAt: "now" }));
    const { result, rerender } = renderHook(({ version }) => useCloudSave({ enabled: true, version, save, delay: 100 }), { initialProps: { version: 1 } });
    const initialQueueSave = result.current.queueSave;
    rerender({ version: 7 });
    expect(result.current.queueSave).toBe(initialQueueSave);
    act(() => result.current.queueSave({ title: "other problem" }));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(save.mock.calls[0][1]).toBe(7);
  });

  it("retains failed local payloads", async () => {
    const save = vi.fn(async (_payload: unknown, _version: number, _key: string, _signal: AbortSignal): Promise<CloudSaveResult> => { throw new Error("offline"); });
    const { result } = renderHook(() => useCloudSave({ enabled: true, version: 1, save, delay: 100 }));
    act(() => result.current.queueSave({ title: "unsaved" }));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current.status).toBe("failed");
    expect(result.current.pendingPayload).toEqual({ title: "unsaved" });
    save.mockImplementation(async () => ({ ok: true as const, version: 2, updatedAt: "now" }));
    act(() => result.current.retryPending());
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current.status).toBe("synced");
  });

  it("exposes both versions when the server reports a conflict", async () => {
    const onConflict = vi.fn();
    const save = vi.fn(async (_payload: unknown, _version: number, _key: string, _signal: AbortSignal) => ({ ok: false as const, status: 409, currentVersion: 4, updatedAt: "server-time" }));
    const { result } = renderHook(() => useCloudSave({ enabled: true, version: 2, save, onConflict, delay: 100 }));
    act(() => result.current.queueSave({ title: "mine" }));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current.status).toBe("conflicted");
    expect(result.current.conflict).toEqual({ localVersion: 2, currentVersion: 4, updatedAt: "server-time" });
    expect(onConflict).toHaveBeenCalledWith(result.current.conflict);
    act(() => result.current.retryWithVersion({ title: "overwrite" }, 4));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(save.mock.calls[1][1]).toBe(4);
    act(() => result.current.discardPending(4));
    expect(result.current.status).toBe("synced");
    expect(result.current.pendingPayload).toBeNull();
  });

  it("persists a failed write, recovers it after reload, and removes it after success", async () => {
    vi.useRealTimers();
    const databaseName = `cloud-save-${crypto.randomUUID()}`;
    const queue = createSyncQueue({ databaseName });
    const failedSave = vi.fn(async () => { throw new Error("offline"); });
    const options = {
      enabled: true, userId: "user-a", resourceType: "problem", resourceId: "problem-1", queue, version: 1, delay: 0,
    };
    const first = renderHook(() => useCloudSave({ ...options, save: failedSave }));
    act(() => first.result.current.queueSave({ title: "survives" }));
    await waitFor(() => expect(first.result.current.status).toBe("failed"));
    const persisted = await queue.getByResource("user-a", "problem", "problem-1");
    expect(persisted?.payload).toEqual({ title: "survives" });
    first.unmount();

    await queue.retry(persisted!.id);
    const successfulSave = vi.fn(async () => ({ ok: true as const, version: 2, updatedAt: "now" }));
    const second = renderHook(() => useCloudSave({ ...options, save: successfulSave }));
    await waitFor(() => expect(successfulSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(second.result.current.status).toBe("synced"));
    expect(successfulSave).toHaveBeenCalledWith({ title: "survives" }, 1, persisted!.idempotencyKey, expect.any(AbortSignal));
    expect(await queue.get(persisted!.id)).toBeNull();
    second.unmount();
    queue.close();
  });

  it("never replays one account's pending payload after an account switch", async () => {
    vi.useRealTimers();
    const queue = createSyncQueue({ databaseName: `account-switch-${crypto.randomUUID()}` });
    const save = vi.fn(async () => ({ ok: true as const, version: 2, updatedAt: "now" }));
    const { result, rerender, unmount } = renderHook(({ userId, resourceId }) => useCloudSave({
      enabled: true, userId, resourceType: "problem", resourceId, queue, version: 1, save, delay: 20,
    }), { initialProps: { userId: "user-a", resourceId: "problem-a" } });
    act(() => result.current.queueSave({ title: "private-a" }));
    await waitFor(async () => expect(await queue.getByResource("user-a", "problem", "problem-a")).not.toBeNull());
    rerender({ userId: "user-b", resourceId: "problem-b" });
    expect(result.current.pendingPayload).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(save).not.toHaveBeenCalled();
    expect((await queue.getByResource("user-a", "problem", "problem-a"))?.payload).toEqual({ title: "private-a" });
    unmount();
    queue.close();
  });

  it.each([
    { response: { ok: false as const, status: 401 }, status: "failed", pauseReason: "auth" },
    { response: { ok: false as const, status: 409, currentVersion: 4, updatedAt: "server-time" }, status: "conflicted", pauseReason: "conflict" },
  ])("persists and pauses a $pauseReason response", async ({ response, status, pauseReason }) => {
    vi.useRealTimers();
    const queue = createSyncQueue({ databaseName: `paused-${pauseReason}-${crypto.randomUUID()}` });
    const save = vi.fn(async () => response);
    const { result, unmount } = renderHook(() => useCloudSave({
      enabled: true, userId: "user-a", resourceType: "problem", resourceId: "problem-1",
      queue, version: 1, save, delay: 0,
    }));
    act(() => result.current.queueSave({ title: "pending" }));
    await waitFor(() => expect(result.current.status).toBe(status));
    expect(await queue.getByResource("user-a", "problem", "problem-1")).toMatchObject({ pauseReason, nextAttemptAt: null });
    unmount();
    queue.close();
  });

  it("pauses while offline and resumes the same queued write on the online event", async () => {
    vi.useRealTimers();
    let online = false;
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    const queue = createSyncQueue({ databaseName: `offline-${crypto.randomUUID()}` });
    const save = vi.fn(async () => ({ ok: true as const, version: 2, updatedAt: "now" }));
    const { result, unmount } = renderHook(() => useCloudSave({
      enabled: true, userId: "user-a", resourceType: "problem", resourceId: "problem-1",
      queue, version: 1, save, delay: 0,
    }));
    act(() => result.current.queueSave({ title: "offline" }));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(save).not.toHaveBeenCalled();
    expect(await queue.getByResource("user-a", "problem", "problem-1")).toMatchObject({ pauseReason: "offline" });

    online = true;
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.status).toBe("synced"));
    expect(await queue.getByResource("user-a", "problem", "problem-1")).toBeNull();
    unmount();
    queue.close();
    onlineSpy.mockRestore();
  });

  it("preserves a reloaded conflict when the page requeues the unchanged payload on mount", async () => {
    vi.useRealTimers();
    const queue = createSyncQueue({ databaseName: `conflict-reload-${crypto.randomUUID()}` });
    const saved = await queue.enqueue({
      userId: "user-a", resourceType: "problem", resourceId: "problem-1", baseVersion: 1, payload: { title: "same" },
    });
    await queue.markFailure(saved.id, "conflict", { currentVersion: 4, updatedAt: "server-time" });
    const save = vi.fn(async () => ({ ok: true as const, version: 5, updatedAt: "now" }));
    const { result, unmount } = renderHook(() => useCloudSave({
      enabled: true, userId: "user-a", resourceType: "problem", resourceId: "problem-1",
      queue, version: 1, save, delay: 0,
    }));
    act(() => result.current.queueSave({ title: "same" }));
    await waitFor(() => expect(result.current.status).toBe("conflicted"));
    expect(result.current.conflict).toMatchObject({ localVersion: 1, currentVersion: 4 });
    expect(save).not.toHaveBeenCalled();
    unmount();
    queue.close();
  });
});
