// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConversationSync } from "../../app/hooks/use-conversation-sync";
import { ConversationApi, queueConversationMessage } from "../../app/lib/conversation-api";
import { createSyncQueue } from "../../app/lib/local-data/queue";
import { useAiStore } from "../../app/stores/ai-store";

beforeEach(() => {
  localStorage.clear();
  useAiStore.setState({
    configured: false, hasApiKey: false, provider: "deepseek", source: "manual", version: 0, updatedAt: null,
    endpoint: "https://api.deepseek.com", model: "deepseek-chat", chatMessages: [],
    conversationAccountId: null, conversationId: null, conversationVersion: 0, conversations: [],
  });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AI conversation sync boundaries", () => {
  it("keeps account AI settings in memory and persists only the conversation cache", () => {
    const store = useAiStore.getState();
    store.hydrateSettings({
      configured: true, hasApiKey: true, provider: "openai", endpoint: "https://api.openai.com/v1",
      model: "gpt-5", source: "manual", version: 3, updatedAt: "2026-09-03T00:00:00.000Z",
    });
    store.addChatMessage({ role: "user", content: "guest message" });

    expect(localStorage.getItem("codenow-api-keys")).toBeNull();
    expect(localStorage.getItem("codenow-ai-local-config")).toBeNull();
    expect(localStorage.getItem("codenow-ai-conversation-cache")).toContain("guest message");
    expect(localStorage.getItem("codenow-ai-conversation-cache")).not.toContain("gpt-5");
    expect(localStorage.getItem("codenow-ai-conversation-cache")).not.toContain("api.openai.com");
  });

  it("clears prior cloud conversations when accounts switch while guests remain local", () => {
    useAiStore.getState().hydrateConversation("user-a", "conversation-a", 2, [{ role: "user", content: "private-a" }], []);
    useAiStore.getState().hydrateConversation("user-b", "conversation-b", 1, [{ role: "assistant", content: "private-b" }], []);
    expect(useAiStore.getState()).toMatchObject({ conversationAccountId: "user-b", conversationId: "conversation-b", chatMessages: [{ content: "private-b" }] });
    useAiStore.getState().switchConversationAccount(null);
    useAiStore.getState().addChatMessage({ role: "user", content: "guest-local" });
    expect(useAiStore.getState().chatMessages).toEqual([{ role: "user", content: "guest-local" }]);
  });

  it("uploads only role and content with a version and idempotency key", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      message: { id: "m1", role: "user", content: "safe", sortOrder: 0 }, version: 2, updatedAt: "now",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    await ConversationApi.appendMessage("conversation-1", 1, { role: "user", content: "safe" }, "idem-1");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/conversations/conversation-1/messages");
    expect(init?.headers).toMatchObject({ "Idempotency-Key": "idem-1" });
    expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 1, role: "user", content: "safe" });
  });

  it("leaves a failed append in IndexedDB for the same user", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const queue = createSyncQueue({ databaseName: `ai-queue-${crypto.randomUUID()}` });
    await expect(queueConversationMessage(queue, {
      userId: "user-a", conversationId: "conversation-1", conversationVersion: 1,
      message: { role: "user", content: "survive" },
    })).rejects.toThrow("offline");
    const records = await queue.listForUser("user-a");
    expect(records).toHaveLength(1);
    expect(records[0].payload).toEqual({ conversationId: "conversation-1", role: "user", content: "survive" });
    queue.close();
  });

  it("waits for login hydration before deciding whether to create a conversation", async () => {
    let resolveList!: (response: Response) => void;
    const listResponse = new Promise<Response>((resolve) => { resolveList = resolve; });
    vi.mocked(fetch)
      .mockImplementationOnce(() => listResponse)
      .mockResolvedValueOnce(json({ items: [], nextCursor: null }))
      .mockResolvedValueOnce(json({ message: { id: "m1", role: "user", content: "hello", sortOrder: 0 }, version: 3, updatedAt: "now" }, 201));
    const { result } = renderHook(() => useConversationSync("user-a", "CF0001"));
    let append!: Promise<unknown>;
    act(() => { append = result.current.append({ role: "user", content: "hello" }); });
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);

    resolveList(json({ items: [{ id: "conversation-1", problemRef: "CF0001", title: "Existing", version: 2, createdAt: "now", updatedAt: "now" }], nextCursor: null }));
    await append;
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => url === "/api/conversations" && init?.method === "POST")).toBe(false);
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
