const STORE_NAME = "writes";
const RETRY_DELAYS = [1_000, 5_000, 30_000, 120_000] as const;
const SENSITIVE_FIELD = /(password|token|email|apikey)/i;

export type SyncQueuePauseReason = "auth" | "conflict" | "offline" | "manual";
export type SyncQueueRecord<T = unknown> = {
  id: string;
  userId: string | null;
  resourceType: string;
  resourceId: string;
  idempotencyKey: string;
  baseVersion: number;
  payload: T;
  attempts: number;
  nextAttemptAt: number | null;
  pauseReason?: SyncQueuePauseReason;
  currentVersion?: number;
  updatedAt?: string;
};

export type SyncQueueInput<T = unknown> = Pick<SyncQueueRecord<T>, "userId" | "resourceType" | "resourceId" | "baseVersion" | "payload">;
export type SyncFailure = "network" | "auth" | "conflict" | "offline";

type QueueOptions = { databaseName?: string; now?: () => number };

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function containsSensitiveField(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsSensitiveField(item, seen));
  return Object.entries(value as Record<string, unknown>).some(([key, item]) => SENSITIVE_FIELD.test(key.replace(/[^a-z]/gi, "")) || containsSensitiveField(item, seen));
}

function validateInput(input: SyncQueueInput) {
  if ((input.userId !== null && (typeof input.userId !== "string" || !input.userId))
    || typeof input.resourceType !== "string" || !input.resourceType
    || typeof input.resourceId !== "string" || !input.resourceId
    || !Number.isInteger(input.baseVersion) || input.baseVersion < 0) {
    throw new Error("Invalid sync queue record");
  }
  if (containsSensitiveField(input.payload)) throw new Error("Sync queue payload contains sensitive fields");
}

function samePayload(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function createSyncQueue({ databaseName = "codenow-sync-queue", now = () => Date.now() }: QueueOptions = {}) {
  let openPromise: Promise<IDBDatabase> | null = null;

  function database() {
    if (!openPromise) {
      openPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Unable to open sync queue"));
      });
    }
    return openPromise;
  }

  async function listAll() {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, "readonly");
    return requestResult(transaction.objectStore(STORE_NAME).getAll()) as Promise<SyncQueueRecord[]>;
  }

  async function get(id: string) {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const value = await requestResult(transaction.objectStore(STORE_NAME).get(id)) as SyncQueueRecord | undefined;
    return value ?? null;
  }

  async function put(record: SyncQueueRecord) {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
    return record;
  }

  return {
    async enqueue<T>(input: SyncQueueInput<T>): Promise<SyncQueueRecord<T>> {
      validateInput(input);
      const db = await database();
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const records = await requestResult(store.getAll()) as SyncQueueRecord[];
      const existing = records.find((record) => record.userId === input.userId
        && record.resourceType === input.resourceType && record.resourceId === input.resourceId);
      if (existing && existing.baseVersion === input.baseVersion && samePayload(existing.payload, input.payload)) {
        await transactionDone(transaction);
        return existing as SyncQueueRecord<T>;
      }
      const record: SyncQueueRecord<T> = {
        id: existing?.id ?? crypto.randomUUID(),
        ...input,
        idempotencyKey: crypto.randomUUID(),
        attempts: 0,
        nextAttemptAt: now(),
      };
      store.put(record);
      await transactionDone(transaction);
      return record;
    },

    get,
    listAll,

    async listForUser(userId: string | null) {
      return (await listAll()).filter((record) => record.userId === userId);
    },

    async getByResource(userId: string | null, resourceType: string, resourceId: string) {
      return (await listAll()).find((record) => record.userId === userId
        && record.resourceType === resourceType && record.resourceId === resourceId) ?? null;
    },

    async readyForUser(userId: string) {
      const timestamp = now();
      return (await listAll()).filter((record) => record.userId === userId
        && record.nextAttemptAt !== null && record.nextAttemptAt <= timestamp);
    },

    async markFailure(id: string, failure: SyncFailure, conflict?: { currentVersion?: number; updatedAt?: string }) {
      const record = await get(id);
      if (!record) throw new Error("Sync queue record not found");
      if (failure === "auth" || failure === "conflict" || failure === "offline") {
        return put({ ...record, nextAttemptAt: null, pauseReason: failure, ...conflict });
      }
      const attempts = record.attempts + 1;
      const delay = RETRY_DELAYS[attempts - 1];
      return put({
        ...record,
        attempts,
        nextAttemptAt: delay === undefined ? null : now() + delay,
        pauseReason: delay === undefined ? "manual" : undefined,
      });
    },

    async resumeForUser(userId: string) {
      const records = await listAll();
      await Promise.all(records.filter((record) => record.userId === userId && record.pauseReason === "auth")
        .map((record) => put({ ...record, nextAttemptAt: now(), pauseReason: undefined })));
    },

    async retry(id: string, baseVersion?: number) {
      const record = await get(id);
      if (!record) throw new Error("Sync queue record not found");
      return put({
        ...record,
        baseVersion: baseVersion ?? record.baseVersion,
        attempts: 0,
        nextAttemptAt: now(),
        pauseReason: undefined,
        currentVersion: undefined,
        updatedAt: undefined,
      });
    },

    async remove(id: string) {
      const db = await database();
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      await transactionDone(transaction);
    },

    close() {
      if (openPromise) void openPromise.then((db) => db.close());
      openPromise = null;
    },
  };
}

export type SyncQueue = ReturnType<typeof createSyncQueue>;
