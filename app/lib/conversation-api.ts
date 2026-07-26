import type { SyncQueue } from "./local-data/queue";

export type ConversationMetadata = {
  id: string;
  problemRef: string | null;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type CloudConversationMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  sortOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type SafeConversationMessage = Pick<CloudConversationMessage, "role" | "content">;

export class ConversationApiError extends Error {
  constructor(public status: number, message: string, public currentVersion?: number) {
    super(message);
    this.name = "ConversationApiError";
  }
}
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { error?: { message?: string; currentVersion?: number } } & T;
  if (!response.ok) throw new ConversationApiError(response.status, body.error?.message ?? "Conversation request failed", body.error?.currentVersion);
  return body;
}

const headers = { "Content-Type": "application/json" };

export const ConversationApi = {
  list: (cursor?: string) => json<{ items: ConversationMetadata[]; nextCursor: string | null }>(`/api/conversations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
  create: (title: string, problemRef?: string | null) => json<{ conversation: ConversationMetadata }>("/api/conversations", {
    method: "POST", headers, body: JSON.stringify({ title, ...(problemRef ? { problemRef } : {}) }),
  }),
  messages: (conversationId: string, cursor?: number) => json<{ items: CloudConversationMessage[]; nextCursor: number | null }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages${cursor === undefined ? "" : `?cursor=${cursor}`}`,
  ),
  appendMessage: (conversationId: string, expectedVersion: number, message: SafeConversationMessage, idempotencyKey: string, signal?: AbortSignal) =>
    json<{ message: CloudConversationMessage; version: number; updatedAt: string }>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ expectedVersion, role: message.role, content: message.content }),
      signal,
    }),
};

export async function queueConversationMessage(queue: SyncQueue, input: {
  userId: string;
  conversationId: string;
  conversationVersion: number;
  message: SafeConversationMessage;
}) {
  const resourceId = `${input.conversationId}:${Date.now()}:${crypto.randomUUID()}`;
  const payload = { conversationId: input.conversationId, role: input.message.role, content: input.message.content };
  const record = await queue.enqueue({
    userId: input.userId,
    resourceType: "conversation-message",
    resourceId,
    baseVersion: input.conversationVersion,
    payload,
  });
  try {
    const result = await ConversationApi.appendMessage(input.conversationId, input.conversationVersion, input.message, record.idempotencyKey);
    await queue.remove(record.id);
    return result;
  } catch (error) {
    if (error instanceof ConversationApiError && error.status === 401) await queue.markFailure(record.id, "auth");
    else if (error instanceof ConversationApiError && error.status === 409) await queue.markFailure(record.id, "conflict", { currentVersion: error.currentVersion });
    else await queue.markFailure(record.id, "network");
    throw error;
  }
}
