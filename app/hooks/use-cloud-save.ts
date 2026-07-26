"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SyncStatus = "local-only" | "saving" | "synced" | "failed" | "conflicted";
export type CloudConflict = { localVersion: number; currentVersion: number; updatedAt?: string };
export type CloudSaveResult =
  | { ok: true; version: number; updatedAt: string }
  | { ok: false; status: number; currentVersion?: number; updatedAt?: string };

type Options<T> = {
  enabled: boolean;
  version: number;
  save: (payload: T, version: number, idempotencyKey: string, signal: AbortSignal) => Promise<CloudSaveResult>;
  onConflict?: (conflict: CloudConflict) => void;
  delay?: number;
};

export function useCloudSave<T = unknown>({ enabled, version, save, onConflict, delay = 600 }: Options<T>) {
  const [status, setStatus] = useState<SyncStatus>(enabled ? "synced" : "local-only");
  const [currentVersion, setCurrentVersion] = useState(version);
  const [pending, setPending] = useState<{ payload: T; idempotencyKey: string } | null>(null);
  const [conflict, setConflict] = useState<CloudConflict | null>(null);
  const conflictCallback = useRef(onConflict);

  useEffect(() => { conflictCallback.current = onConflict; }, [onConflict]);
  const queueSave = useCallback((payload: T) => {
    setPending({ payload, idempotencyKey: crypto.randomUUID() });
    setConflict(null);
    setStatus(enabled ? "saving" : "local-only");
  }, [enabled]);

  const retryWithVersion = useCallback((payload: T, nextVersion: number) => {
    setCurrentVersion(nextVersion);
    setPending({ payload, idempotencyKey: crypto.randomUUID() });
    setConflict(null);
    setStatus(enabled ? "saving" : "local-only");
  }, [enabled]);

  const discardPending = useCallback((nextVersion: number) => {
    setCurrentVersion(nextVersion);
    setPending(null);
    setConflict(null);
    setStatus(enabled ? "synced" : "local-only");
  }, [enabled]);

  useEffect(() => {
    if (!pending || !enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await save(pending.payload, currentVersion, pending.idempotencyKey, controller.signal);
        if (controller.signal.aborted) return;
        if (result.ok) {
          setCurrentVersion(result.version);
          setPending(null);
          setStatus("synced");
          return;
        }
        if (result.status === 409) {
          const next = { localVersion: currentVersion, currentVersion: result.currentVersion ?? currentVersion, updatedAt: result.updatedAt };
          setConflict(next);
          setStatus("conflicted");
          conflictCallback.current?.(next);
          return;
        }
        setStatus("failed");
      } catch {
        if (!controller.signal.aborted) setStatus("failed");
      }
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [currentVersion, delay, enabled, pending, save]);

  return { status, version: currentVersion, pendingPayload: pending?.payload ?? null, conflict, queueSave, retryWithVersion, discardPending };
}
