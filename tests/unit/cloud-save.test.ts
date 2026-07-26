// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest environment must be declared before imports. */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCloudSave } from "../../app/hooks/use-cloud-save";

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

  it("retains failed local payloads", async () => {
    const save = vi.fn(async (_payload: unknown, _version: number, _key: string, _signal: AbortSignal) => { throw new Error("offline"); });
    const { result } = renderHook(() => useCloudSave({ enabled: true, version: 1, save, delay: 100 }));
    act(() => result.current.queueSave({ title: "unsaved" }));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(result.current.status).toBe("failed");
    expect(result.current.pendingPayload).toEqual({ title: "unsaved" });
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
});
