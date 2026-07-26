"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  ConversationApi,
  queueConversationMessage,
  type ConversationMetadata,
  type SafeConversationMessage,
} from "../lib/conversation-api";
import { createSyncQueue } from "../lib/local-data/queue";
import { useAiStore } from "../stores/ai-store";

const conversationQueue = createSyncQueue();

export function useConversationSync(userId: string | null, problemRef: string) {
  const conversationId = useRef<string | null>(null);
  const version = useRef(0);
  const generation = useRef(0);
  const appendChain = useRef<Promise<unknown>>(Promise.resolve());
  const loadPromise = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const currentGeneration = ++generation.current;
    appendChain.current = Promise.resolve();
    if (!userId) {
      useAiStore.getState().switchConversationAccount(null);
      conversationId.current = null;
      version.current = 0;
      loadPromise.current = Promise.resolve();
      return;
    }
    useAiStore.getState().switchConversationAccount(userId);
    const load = (async () => {
      try {
        const list = await ConversationApi.list();
        const selected = list.items.find((item) => item.problemRef === problemRef) ?? null;
        const messages = selected ? await loadMessages(selected.id) : [];
        if (generation.current !== currentGeneration) return;
        conversationId.current = selected?.id ?? null;
        version.current = selected?.version ?? 0;
        useAiStore.getState().hydrateConversation(userId, selected?.id ?? null, selected?.version ?? 0, messages, list.items);
        if (selected) await replayReady(userId, selected, currentGeneration);
      } catch {
        // Local conversation cache stays available until the next authenticated load.
      }
    })();
    loadPromise.current = load;
    void load;
  }, [problemRef, userId]);

  const append = useCallback((message: SafeConversationMessage) => {
    if (!userId) return Promise.resolve(null);
    const task = appendChain.current.then(async () => {
      await loadPromise.current;
      let id = conversationId.current;
      if (!id) {
        const created = await ConversationApi.create(message.content.slice(0, 80), problemRef);
        id = created.conversation.id;
        conversationId.current = id;
        version.current = created.conversation.version;
        const state = useAiStore.getState();
        state.hydrateConversation(userId, id, version.current, state.chatMessages, [created.conversation, ...state.conversations]);
      }
      const saved = await queueConversationMessage(conversationQueue, {
        userId,
        conversationId: id,
        conversationVersion: version.current,
        message,
      });
      version.current = saved.version;
      useAiStore.getState().setConversationVersion(saved.version);
      return saved;
    });
    appendChain.current = task.catch(() => undefined);
    return task;
  }, [problemRef, userId]);

  return { append };

  async function replayReady(activeUserId: string, selected: ConversationMetadata, expectedGeneration: number) {
    let currentVersion = selected.version;
    const records = (await conversationQueue.readyForUser(activeUserId))
      .filter((record) => record.resourceType === "conversation-message")
      .sort((left, right) => left.resourceId.localeCompare(right.resourceId));
    for (const record of records) {
      const payload = safePayload(record.payload);
      if (!payload || payload.conversationId !== selected.id) continue;
      try {
        const saved = await ConversationApi.appendMessage(selected.id, currentVersion, payload, record.idempotencyKey);
        await conversationQueue.remove(record.id);
        currentVersion = saved.version;
      } catch {
        break;
      }
    }
    if (generation.current === expectedGeneration && currentVersion !== selected.version) {
      version.current = currentVersion;
      useAiStore.getState().setConversationVersion(currentVersion);
    }
  }
}

async function loadMessages(conversationId: string) {
  const result: SafeConversationMessage[] = [];
  let cursor: number | undefined;
  do {
    const page = await ConversationApi.messages(conversationId, cursor);
    result.push(...page.items.map(({ role, content }) => ({ role, content })));
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return result;
}

function safePayload(value: unknown): (SafeConversationMessage & { conversationId: string }) | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  return typeof payload.conversationId === "string" && (payload.role === "user" || payload.role === "assistant") && typeof payload.content === "string"
    ? { conversationId: payload.conversationId, role: payload.role, content: payload.content }
    : null;
}
