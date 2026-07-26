"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSyncQueue, type SyncQueue, type SyncQueueRecord } from "../lib/local-data/queue";

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
  userId?: string | null;
  resourceType?: string;
  resourceId?: string | null;
  queue?: SyncQueue;
};

type Pending<T> = {
  scopeKey: string;
  payload: T;
  idempotencyKey: string;
  baseVersion: number;
  recordId?: string;
  attempts?: number;
  nextAttemptAt?: number | null;
  persisting?: boolean;
};

const defaultQueue = createSyncQueue();

export function useCloudSave<T = unknown>({
  enabled, version, save, onConflict, delay = 600,
  userId = null, resourceType, resourceId = null, queue = defaultQueue,
}: Options<T>) {
  const [status, setStatus] = useState<SyncStatus>(enabled ? "synced" : "local-only");
  const [currentVersion, setCurrentVersion] = useState(version);
  const [pending, setPending] = useState<Pending<T> | null>(null);
  const [conflict, setConflict] = useState<CloudConflict | null>(null);
  const conflictCallback = useRef(onConflict);
  const externalVersion = useRef(version);
  const writeGeneration = useRef(0);
  const persistent = Boolean(userId && resourceType && resourceId);
  const scopeKey = `${userId ?? "anonymous"}:${resourceType ?? "local"}:${resourceId ?? "local"}`;

  useEffect(() => { conflictCallback.current = onConflict; }, [onConflict]);
  useEffect(() => { externalVersion.current = version; }, [version]);
  useEffect(() => { writeGeneration.current += 1; }, [scopeKey]);

  const restoreRecord = useCallback((record: SyncQueueRecord) => {
    setCurrentVersion(record.baseVersion);
    setPending(fromRecord<T>(record, scopeKey));
    if (record.pauseReason === "conflict") {
      setConflict({ localVersion: record.baseVersion, currentVersion: record.currentVersion ?? record.baseVersion, updatedAt: record.updatedAt });
      setStatus("conflicted");
    } else if (record.pauseReason === "manual" || record.pauseReason === "offline" || record.pauseReason === "auth") {
      setStatus("failed");
    } else {
      setStatus("saving");
    }
  }, [scopeKey]);

  const persistPayload = useCallback((payload: T, baseVersion: number) => {
    const generation = ++writeGeneration.current;
    setCurrentVersion(baseVersion);
    setConflict(null);
    setStatus(enabled ? "saving" : "local-only");
    if (!enabled || !persistent || !userId || !resourceType || !resourceId) {
      setPending({ scopeKey, payload, baseVersion, idempotencyKey: crypto.randomUUID() });
      return;
    }
    setPending({ scopeKey, payload, baseVersion, idempotencyKey: "", nextAttemptAt: null, persisting: true });
    void queue.enqueue({ userId, resourceType, resourceId, baseVersion, payload }).then(async (queued) => {
      if (writeGeneration.current !== generation) return;
      let record: SyncQueueRecord = queued;
      if (record.pauseReason === "auth" || (record.pauseReason === "offline" && navigator.onLine)) record = await queue.retry(record.id);
      if (writeGeneration.current === generation) restoreRecord(record);
    }).catch(() => {
      if (writeGeneration.current === generation) setStatus("failed");
    });
  }, [enabled, persistent, queue, resourceId, resourceType, restoreRecord, scopeKey, userId]);

  const queueSave = useCallback((payload: T) => {
    persistPayload(payload, externalVersion.current);
  }, [persistPayload]);

  const retryWithVersion = useCallback((payload: T, nextVersion: number) => {
    persistPayload(payload, nextVersion);
  }, [persistPayload]);

  const discardPending = useCallback((nextVersion: number) => {
    writeGeneration.current += 1;
    if (pending?.recordId) void queue.remove(pending.recordId);
    setCurrentVersion(nextVersion);
    setPending(null);
    setConflict(null);
    setStatus(enabled ? "synced" : "local-only");
  }, [enabled, pending, queue]);

  const retryPending = useCallback(() => {
    if (!pending || pending.scopeKey !== scopeKey) return;
    setConflict(null);
    setStatus(enabled ? "saving" : "local-only");
    if (!pending.recordId) {
      setPending({ ...pending, nextAttemptAt: Date.now(), persisting: false });
      return;
    }
    void queue.retry(pending.recordId).then((record) => setPending(fromRecord<T>(record, scopeKey))).catch(() => setStatus("failed"));
  }, [enabled, pending, queue, scopeKey]);

  useEffect(() => {
    if (!enabled || !persistent || !userId || !resourceType || !resourceId) return;
    const generation = writeGeneration.current;
    let cancelled = false;
    void (async () => {
      await queue.resumeForUser(userId);
      const record = await queue.getByResource(userId, resourceType, resourceId);
      if (cancelled || writeGeneration.current !== generation) return;
      if (!record) {
        setPending(null);
        setConflict(null);
        setStatus("synced");
        return;
      }
      restoreRecord(record);
    })();
    return () => { cancelled = true; };
  }, [enabled, persistent, queue, resourceId, resourceType, restoreRecord, scopeKey, userId]);

  useEffect(() => {
    if (!pending || pending.scopeKey !== scopeKey || pending.persisting || !enabled) return;
    if (pending.nextAttemptAt === null) return;
    const controller = new AbortController();
    const wait = pending.recordId && (pending.attempts ?? 0) > 0
      ? Math.max(0, (pending.nextAttemptAt ?? Date.now()) - Date.now())
      : delay;
    const timer = setTimeout(async () => {
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine && pending.recordId) {
          const paused = await queue.markFailure(pending.recordId, "offline");
          setPending(fromRecord<T>(paused, scopeKey));
          setStatus("failed");
          return;
        }
        const result = await save(pending.payload, pending.baseVersion, pending.idempotencyKey, controller.signal);
        if (controller.signal.aborted) return;
        if (result.ok) {
          if (pending.recordId) await queue.remove(pending.recordId);
          setCurrentVersion(result.version);
          setPending(null);
          setStatus("synced");
          return;
        }
        if (result.status === 409) {
          if (pending.recordId) await queue.markFailure(pending.recordId, "conflict", result);
          const next = { localVersion: pending.baseVersion, currentVersion: result.currentVersion ?? pending.baseVersion, updatedAt: result.updatedAt };
          setConflict(next);
          setStatus("conflicted");
          conflictCallback.current?.(next);
          return;
        }
        if (result.status === 401 && pending.recordId) {
          const paused = await queue.markFailure(pending.recordId, "auth");
          setPending(fromRecord<T>(paused, scopeKey));
          setStatus("failed");
          return;
        }
        await retainFailure(pending);
      } catch {
        if (!controller.signal.aborted) await retainFailure(pending);
      }
    }, wait);
    return () => { clearTimeout(timer); controller.abort(); };

    async function retainFailure(value: Pending<T>) {
      if (value.recordId) {
        const failed = await queue.markFailure(value.recordId, "network");
        setPending(fromRecord<T>(failed, scopeKey));
      }
      setStatus("failed");
    }
  }, [delay, enabled, pending, queue, save, scopeKey]);

  useEffect(() => {
    if (!pending?.recordId || !userId) return;
    const resume = () => {
      void queue.get(pending.recordId!).then((record) => {
        if (!record || record.pauseReason !== "offline") return;
        return queue.retry(record.id).then((ready) => {
          setPending(fromRecord<T>(ready, scopeKey));
          setStatus("saving");
        });
      });
    };
    window.addEventListener("online", resume);
    return () => window.removeEventListener("online", resume);
  }, [pending?.recordId, queue, scopeKey, userId]);

  const isCurrentScope = !pending || pending.scopeKey === scopeKey;
  return {
    status: enabled ? (isCurrentScope ? status : "synced") : "local-only" as SyncStatus,
    version: currentVersion,
    pendingPayload: isCurrentScope ? pending?.payload ?? null : null,
    conflict: isCurrentScope ? conflict : null,
    queueSave,
    retryWithVersion,
    retryPending,
    discardPending,
  };
}

function fromRecord<T>(record: SyncQueueRecord, scopeKey: string): Pending<T> {
  return {
    scopeKey,
    payload: record.payload as T,
    idempotencyKey: record.idempotencyKey,
    baseVersion: record.baseVersion,
    recordId: record.id,
    attempts: record.attempts,
    nextAttemptAt: record.nextAttemptAt,
  };
}
